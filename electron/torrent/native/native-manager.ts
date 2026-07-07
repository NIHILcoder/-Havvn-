/**
 * NativeTorrentManager — the transmission-daemon-backed download engine behind
 * the SAME host contract as the webtorrent TorrentManager (see
 * docs/native-host-contract.md). Runs in the torrent-host utilityProcess,
 * persists through the db-bridge (main owns electron-store), and drives the
 * bundled daemon over localhost RPC via TransmissionSidecar.
 *
 * MVP scope (engine-swap plan step 4, first increment): add / stats / pause /
 * resume / remove / recheck / files / peers / trackers / per-file priority /
 * sequential mode / cast-by-disk-path / alt-speed / settings. Advanced features
 * (in-app streaming, swarm map, tracker CRUD, seeding-from-folder) still throw
 * NOT_IMPLEMENTED and arrive in later increments — the webtorrent engine stays
 * selectable via settings.engine as the fallback.
 *
 * Identity note: transmission's integer ids are NOT stable across daemon
 * restarts — everything is keyed on the torrent's infoHash (persisted onto the
 * Download record) and mapped to our uuid ids in memory.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as db from '../host/db-bridge';
import { getHostEnv } from '../host/env';
import { TorrentError } from '../errors';
import { logger } from '../../utils';
import { TransmissionSidecar } from './transmission-sidecar';
import { TransmissionRpc, TrTorrent, TrStatus, TrFile } from './transmission-rpc';
import { ENGINE_STAT_FIELDS, mapStats, mapStatus, mapFiles, mapPeers, mapTrackers } from './map';
import { extractInfoHashFromMagnet } from '../../../shared/magnet';
import { classifyMediaKind, isDirectlyPlayable } from '../../../shared/media';
import type {
  AppSettings, Download, DownloadStats, FilePriority, PeerInfo, SourceType,
  TorrentFile, TorrentInfo, TrackerInfo,
} from '../../../shared/types';

const log = logger.child('NativeEngine');

const STATS_INTERVAL_MS = 750;
const PERSIST_EVERY_TICKS = 7; // ≈5.25s, mirrors the webtorrent manager's 5s batch persist

// parse-torrent is CJS with no types; we only need the file list + name.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parseTorrent = require('parse-torrent') as (buf: Buffer) => {
  name?: string; infoHash?: string; length?: number;
  files?: Array<{ path: string; name: string; length: number }>;
};

function resolveFfmpeg(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let p = require('ffmpeg-static') as string | null;
    if (p && getHostEnv().isPackaged) p = p.replace('app.asar', 'app.asar.unpacked');
    return p;
  } catch {
    return null;
  }
}

function notImplemented(what: string): never {
  throw new TorrentError(`${what} is not available with the native engine yet`, 'NOT_IMPLEMENTED');
}

const ACTIVE: ReadonlySet<Download['status']> = new Set(['downloading', 'seeding', 'queued']);

export class NativeTorrentManager {
  private sidecar: TransmissionSidecar | null = null;
  private rpc: TransmissionRpc | null = null;
  private ready: Promise<void> | null = null;

  private settings!: AppSettings;
  private readonly records = new Map<string, Download>();
  private readonly idToHash = new Map<string, string>();
  private readonly hashToId = new Map<string, string>();
  /** Per-torrent file metadata for the SYNCHRONOUS cast resolver (getCastFileInfo). */
  private readonly metaCache = new Map<string, TrFile[]>();

  private lastStats: DownloadStats[] = [];
  private statsTimer: NodeJS.Timeout | null = null;
  private persistCounter = 0;
  private altSpeedEnabled = false;
  private readonly ffmpegPath = resolveFfmpeg();

  private readonly statsCbs = new Set<(s: DownloadStats[]) => void>();
  private readonly completeCbs = new Set<(i: { id: string; name: string }) => void>();
  private readonly listeningCbs = new Set<() => void>();

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  initialize(): Promise<void> {
    if (!this.ready) this.ready = this.doInit();
    return this.ready;
  }

  private async doInit(): Promise<void> {
    const env = getHostEnv();
    if (!env.engineBinary || !fs.existsSync(env.engineBinary)) {
      throw new Error(`transmission binary missing (${env.engineBinary ?? 'unset'}) — run: node scripts/fetch-transmission.mjs`);
    }
    this.settings = await db.getSettings();
    this.sidecar = new TransmissionSidecar({
      binaryPath: env.engineBinary,
      configDir: env.engineStateDir,
      downloadDir: this.settings.defaultDownloadDir,
      peerPort: (this.settings.portMin ?? 0) > 0 ? this.settings.portMin : undefined,
      // Main's existing UPnP service owns the router mapping (honors the
      // portForwarding toggle); don't let the daemon double-map the port.
      settingsOverrides: { 'port-forwarding-enabled': false },
      onLog: (line) => log.debug('daemon', { line }),
      // Host exits → proxy respawns the whole host → clean engine restart.
      onUnexpectedExit: (code) => { log.error('transmission daemon died', { code }); process.exit(1); },
    });
    this.rpc = await this.sidecar.start();
    log.info('Native engine ready', { pid: this.sidecar.pid, peerPort: this.sidecar.peerPort });
    await this.applySessionSettings(this.settings);
    await this.reconcile();
    this.statsTimer = setInterval(() => { void this.tick().catch((e) => log.warn('stats tick failed', { error: String(e) })); }, STATS_INTERVAL_MS);
    for (const cb of this.listeningCbs) { try { cb(); } catch { /* ignore */ } }
  }

  private async whenReady(): Promise<void> {
    if (!this.ready) throw new TorrentError('engine not initialized', 'NOT_ACTIVE');
    await this.ready;
    if (!this.rpc) throw new TorrentError('engine not running', 'NOT_ACTIVE');
  }

  async destroy(): Promise<void> {
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    this.rpc = null;
    await this.sidecar?.stop();
    this.sidecar = null;
  }

  // ── Session settings ────────────────────────────────────────────────────────
  private async applySessionSettings(s: AppSettings): Promise<void> {
    const args: Record<string, unknown> = {
      'dht-enabled': s.enableDHT ?? true,
      'pex-enabled': s.enablePEX ?? true,   // real toggles at last — webtorrent ignored these
      'lpd-enabled': s.enableLSD ?? true,
      'utp-enabled': s.enableUtp ?? true,
      'encryption': 'preferred',
      'peer-limit-per-torrent': s.maxConnections ?? 100,
      'peer-limit-global': s.maxConnectionsGlobal ?? 300,
      'speed-limit-down-enabled': (s.maxDownKbps ?? 0) > 0,
      'speed-limit-up-enabled': (s.maxUpKbps ?? 0) > 0,
      'alt-speed-enabled': s.altSpeedEnabled ?? false,
      'seed-ratio-limited': (s.defaultSeedRatioLimit ?? 0) > 0,
    };
    if ((s.maxDownKbps ?? 0) > 0) args['speed-limit-down'] = s.maxDownKbps;   // both sides are kB/s
    if ((s.maxUpKbps ?? 0) > 0) args['speed-limit-up'] = s.maxUpKbps;
    if ((s.altDownKbps ?? 0) > 0) args['alt-speed-down'] = s.altDownKbps;
    if ((s.altUpKbps ?? 0) > 0) args['alt-speed-up'] = s.altUpKbps;
    if ((s.defaultSeedRatioLimit ?? 0) > 0) args['seedRatioLimit'] = s.defaultSeedRatioLimit;
    await this.rpc!.sessionSet(args);
    this.altSpeedEnabled = s.altSpeedEnabled ?? false;
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<void> {
    await this.whenReady();
    this.settings = { ...this.settings, ...partial };
    await this.applySessionSettings(this.settings);
  }

  async setAltSpeed(enabled: boolean): Promise<{ altSpeedEnabled: boolean }> {
    await this.whenReady();
    await this.rpc!.sessionSet({ 'alt-speed-enabled': enabled });
    this.altSpeedEnabled = enabled;
    this.settings.altSpeedEnabled = enabled;
    await db.updateSettings({ altSpeedEnabled: enabled });
    return { altSpeedEnabled: enabled };
  }

  isAltSpeedEnabled(): boolean { return this.altSpeedEnabled; }
  getListeningPort(): number { return this.sidecar?.peerPort ?? 0; }
  get ffmpegBinary(): string | null { return this.ffmpegPath; }

  // ── Restore / identity mapping ──────────────────────────────────────────────
  private link(id: string, hash: string): void {
    this.idToHash.set(id, hash);
    this.hashToId.set(hash, id);
  }

  /**
   * Boot reconciliation. The daemon restores its own torrents from its resume
   * state; the DB records are the app's source of truth. Marry the two by
   * infoHash: sync run-state for matches, re-add active records the daemon
   * lost, drop daemon strays the app no longer knows.
   */
  private async reconcile(): Promise<void> {
    const all = await db.getAllDownloads();
    const daemonList = await this.rpc!.torrentGet(['hashString', 'name', 'status', 'percentDone']);
    const daemonByHash = new Map(daemonList.map((t) => [t.hashString.toLowerCase(), t]));
    const claimed = new Set<string>();

    for (const d of all) {
      if (d.status === 'removed') { await db.deleteDownload(d.id); continue; } // boot purge, same as webtorrent manager
      this.records.set(d.id, d);
      const hash = d.infoHash?.toLowerCase()
        ?? (d.sourceType === 'magnet' ? extractInfoHashFromMagnet(d.sourceUri) ?? undefined : undefined);
      const t = hash ? daemonByHash.get(hash) : undefined;
      const wantActive = ACTIVE.has(d.status);
      try {
        if (hash && t) {
          this.link(d.id, hash);
          claimed.add(hash);
          if (!d.infoHash) await db.updateDownloadField(d.id, 'infoHash', hash);
          // Persisted intent wins over whatever run-state the daemon resumed with.
          if (!wantActive && t.status !== TrStatus.Stopped) await this.rpc!.torrentStop(hash);
          else if (wantActive && t.status === TrStatus.Stopped) await this.rpc!.torrentStartNow(hash);
        } else if (wantActive) {
          claimed.add(await this.addToDaemon(d, false));
        }
        // paused/completed/error rows stay daemon-less until resumed (ensureInDaemon)
      } catch (e) {
        log.error('Failed to restore torrent', { id: d.id, error: e instanceof Error ? e.message : String(e) });
        await this.setStatus(d, 'error', e instanceof Error ? e.message : 'Failed to restore');
      }
    }

    for (const t of daemonList) {
      const h = t.hashString.toLowerCase();
      if (!claimed.has(h)) {
        log.warn('Removing stray daemon torrent (unknown to the app)', { hash: h, name: t.name });
        await this.rpc!.torrentRemove(h, false).catch(() => undefined);
      }
    }
    log.info('Reconciled downloads with daemon', { records: this.records.size, daemon: daemonList.length });
  }

  /** Re-add a DB record to the daemon from its source (restore / lazy resume). */
  private async addToDaemon(d: Download, paused: boolean): Promise<string> {
    let res;
    if (d.sourceType === 'torrent_file' && d.torrentFilePath) {
      let file = d.torrentFilePath;
      if (!fs.existsSync(file)) {
        // Heal pre-rebrand/pre-move profile paths — the copy lives in THIS profile.
        const healed = path.join(getHostEnv().userDataDir, 'torrents', path.basename(file));
        if (!fs.existsSync(healed)) throw new TorrentError('Torrent file not found', 'FILE_NOT_FOUND', d.id);
        file = healed;
        await db.updateDownloadField(d.id, 'torrentFilePath', healed);
      }
      const buf = fs.readFileSync(file);
      res = await this.rpc!.torrentAdd({ metainfo: buf, downloadDir: d.savePath, paused, filesUnwanted: unwantedIndices(buf, d.selectedFiles) });
    } else {
      res = await this.rpc!.torrentAdd({ filename: d.sourceUri, downloadDir: d.savePath, paused });
    }
    const hash = res.hashString.toLowerCase();
    this.link(d.id, hash);
    if (d.infoHash !== hash) { d.infoHash = hash; await db.updateDownloadField(d.id, 'infoHash', hash); }
    return hash;
  }

  /** Hash for a record, (re-)adding it to the daemon paused if it isn't live. */
  private async ensureInDaemon(d: Download): Promise<string> {
    const existing = this.idToHash.get(d.id);
    if (existing) return existing;
    return this.addToDaemon(d, true);
  }

  private getRecord(id: string): Download {
    const d = this.records.get(id);
    if (!d || d.status === 'removed') throw new TorrentError('Download not found', 'NOT_FOUND', id);
    return d;
  }

  private async setStatus(d: Download, status: Download['status'], lastError?: string): Promise<void> {
    d.status = status;
    if (lastError !== undefined) d.lastError = lastError;
    await db.updateDownloadStatus(d.id, status, lastError);
  }

  // ── Add ─────────────────────────────────────────────────────────────────────
  async addDownload(params: {
    sourceType: SourceType;
    sourceUri: string;
    savePath?: string;
    name?: string;
    selectedFiles?: number[];
  }): Promise<Download> {
    await this.whenReady();
    const savePath = params.savePath || this.settings.defaultDownloadDir;

    // Magnet duplicates are knowable before touching the daemon.
    if (params.sourceType === 'magnet') {
      const pre = extractInfoHashFromMagnet(params.sourceUri);
      if (pre && this.hashToId.has(pre)) throw new TorrentError('This torrent is already in your downloads', 'DUPLICATE', this.hashToId.get(pre));
    }

    let localTorrentPath: string | null = null;
    let tempToCleanup: string | null = null;
    if (params.sourceType === 'torrent_file') {
      localTorrentPath = params.sourceUri;
      if (/^https?:\/\//i.test(params.sourceUri)) {
        localTorrentPath = await this.fetchTorrentToTemp(params.sourceUri);
        tempToCleanup = localTorrentPath;
      }
    }

    try {
      let res;
      if (localTorrentPath) {
        const buf = fs.readFileSync(localTorrentPath);
        res = await this.rpc!.torrentAdd({ metainfo: buf, downloadDir: savePath, paused: false, filesUnwanted: unwantedIndices(buf, params.selectedFiles) });
      } else {
        res = await this.rpc!.torrentAdd({ filename: params.sourceUri, downloadDir: savePath, paused: false });
      }
      const hash = res.hashString.toLowerCase();
      if (res.duplicate) throw new TorrentError('This torrent is already in your downloads', 'DUPLICATE', this.hashToId.get(hash));

      const storedTorrentPath = localTorrentPath ? this.copyTorrentIntoAppData(localTorrentPath) : null;
      const download = await db.createDownload({
        name: params.name || res.name,
        sourceType: params.sourceType,
        sourceUri: params.sourceUri,
        torrentFilePath: storedTorrentPath ?? undefined,
        savePath,
        status: 'downloading',
        selectedFiles: params.selectedFiles,
      });
      download.infoHash = hash;
      download.status = 'downloading';
      await db.updateDownloadField(download.id, 'infoHash', hash);
      this.records.set(download.id, download);
      this.link(download.id, hash);
      log.info('Download added', { id: download.id, hash, name: download.name });
      return download;
    } finally {
      if (tempToCleanup) { try { fs.unlinkSync(tempToCleanup); } catch { /* ignore */ } }
    }
  }

  async getTorrentInfo(params: { sourceType: SourceType; sourceUri: string }): Promise<TorrentInfo> {
    await this.whenReady();
    if (params.sourceType !== 'torrent_file') notImplemented('Magnet metadata preview');
    let file = params.sourceUri;
    let temp: string | null = null;
    if (/^https?:\/\//i.test(file)) { file = await this.fetchTorrentToTemp(file); temp = file; }
    try {
      const meta = parseTorrent(fs.readFileSync(file));
      const files = (meta.files ?? []).map((f, index) => ({ path: f.path, size: f.length, index }));
      return { name: meta.name ?? path.basename(file, '.torrent'), files, totalSize: meta.length ?? files.reduce((a, f) => a + f.size, 0) };
    } finally {
      if (temp) { try { fs.unlinkSync(temp); } catch { /* ignore */ } }
    }
  }

  private async fetchTorrentToTemp(url: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new TorrentError(`Failed to fetch .torrent (http ${res.status})`, 'LOAD_ERROR');
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = path.join(getHostEnv().tempDir, `havvn-${Date.now()}.torrent`);
    fs.writeFileSync(dest, buf);
    return dest;
  }

  /** Same convention as the webtorrent manager: restarts survive the source moving. */
  private copyTorrentIntoAppData(localTorrentPath: string): string {
    const dir = path.join(getHostEnv().userDataDir, 'torrents');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${Date.now()}_${path.basename(localTorrentPath)}`);
    fs.copyFileSync(localTorrentPath, dest);
    return dest;
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  async pauseDownload(id: string): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = this.idToHash.get(id);
    if (hash) await this.rpc!.torrentStop(hash);
    await this.setStatus(d, 'paused');
  }

  async resumeDownload(id: string): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = await this.ensureInDaemon(d);
    await this.rpc!.torrentStartNow(hash);
    await this.setStatus(d, d.progress >= 1 ? 'seeding' : 'downloading');
  }

  async removeDownload(id: string, deleteFiles: boolean): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = this.idToHash.get(id);
    if (hash) {
      await this.rpc!.torrentRemove(hash, deleteFiles).catch((e) => log.warn('daemon remove failed', { id, error: String(e) }));
      this.idToHash.delete(id);
      this.hashToId.delete(hash);
    }
    this.metaCache.delete(id);
    // Tombstone until next boot (same as webtorrent manager) so late stats
    // ticks/UI reads don't resurrect the row; reconcile() purges it.
    await this.setStatus(d, 'removed');
  }

  async recheckDownload(id: string): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    await this.rpc!.torrentVerify(await this.ensureInDaemon(d));
  }

  async retryDownload(id: string): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = await this.ensureInDaemon(d);
    await this.rpc!.torrentStartNow(hash);
    await this.setStatus(d, d.progress >= 1 ? 'seeding' : 'downloading', undefined);
  }

  async stopSeeding(id: string): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = this.idToHash.get(id);
    if (hash) await this.rpc!.torrentStop(hash);
    await this.setStatus(d, 'completed');
  }

  async pauseAllActive(): Promise<number> {
    await this.whenReady();
    let n = 0;
    for (const d of this.records.values()) {
      if (ACTIVE.has(d.status)) { await this.pauseDownload(d.id); n++; }
    }
    return n;
  }

  async resumeAllPaused(): Promise<number> {
    await this.whenReady();
    let n = 0;
    for (const d of this.records.values()) {
      if (d.status === 'paused') { await this.resumeDownload(d.id); n++; }
    }
    return n;
  }

  // ── Reads ───────────────────────────────────────────────────────────────────
  getDownloads(): Promise<Download[]> { return db.getAllDownloads(); }
  getStats(): DownloadStats[] { return this.lastStats; }

  async getFiles(id: string): Promise<TorrentFile[]> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = await this.ensureInDaemon(d);
    const [t] = await this.rpc!.torrentGet(['files', 'fileStats'], hash);
    if (!t) return [];
    if (t.files?.length) this.metaCache.set(id, t.files);
    return mapFiles(t);
  }

  async getPeers(id: string): Promise<PeerInfo[]> {
    await this.whenReady();
    const hash = this.idToHash.get(id);
    if (!hash) return [];
    const [t] = await this.rpc!.torrentGet(['peers'], hash);
    return t ? mapPeers(t) : [];
  }

  async getTrackers(id: string): Promise<TrackerInfo[]> {
    await this.whenReady();
    const hash = this.idToHash.get(id);
    if (!hash) return [];
    const [t] = await this.rpc!.torrentGet(['trackerStats'], hash);
    return t ? mapTrackers(t) : [];
  }

  /**
   * SYNCHRONOUS by contract (the cast server resolves in-process without an
   * async hop) — served from metaCache, which is warmed when metadata completes,
   * on completion, and by every getFiles() (the cast dialog lists files first).
   */
  getCastFileInfo(id: string, fileIndex: number): {
    name: string; length: number; diskPath: string; complete: boolean;
    kind: 'video' | 'audio' | 'other'; direct: boolean;
  } | null {
    const d = this.records.get(id);
    const files = this.metaCache.get(id);
    const f = files?.[fileIndex];
    if (!d || !f) return null;
    const name = path.basename(f.name);
    return {
      name,
      length: f.length,
      diskPath: path.join(d.savePath, f.name),
      complete: f.bytesCompleted >= f.length,
      kind: classifyMediaKind(name),
      direct: isDirectlyPlayable(name),
    };
  }

  // ── Per-torrent knobs ───────────────────────────────────────────────────────
  async setFilePriority(id: string, fileIndex: number, priority: FilePriority): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = await this.ensureInDaemon(d);
    if (priority === 'skip') {
      await this.rpc!.torrentSet(hash, { 'files-unwanted': [fileIndex] });
    } else {
      const key = priority === 'low' ? 'priority-low' : priority === 'high' ? 'priority-high' : 'priority-normal';
      await this.rpc!.torrentSet(hash, { 'files-wanted': [fileIndex], [key]: [fileIndex] });
    }
    const priorities = [...(d.filePriorities ?? [])];
    priorities[fileIndex] = priority;
    d.filePriorities = priorities;
    await db.updateDownloadField(id, 'filePriorities', priorities);
  }

  async setSequentialDownload(id: string, enabled: boolean): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = await this.ensureInDaemon(d);
    // transmission 4.1+ (snake_case only — the field postdates the rename)
    await this.rpc!.torrentSet(hash, { sequential_download: enabled });
    d.sequentialDownload = enabled;
    await db.updateDownloadField(id, 'sequentialDownload', enabled);
  }

  async setSeedRatioLimit(id: string, ratio: number): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    const hash = this.idToHash.get(id);
    // Enforced by the daemon itself when live; persisted either way.
    if (hash) await this.rpc!.torrentSet(hash, { seedRatioLimit: ratio, seedRatioMode: ratio > 0 ? 1 : 0 });
    d.seedRatioLimit = ratio;
    await db.updateDownloadField(id, 'seedRatioLimit', ratio);
  }

  async setSeedTimeLimit(id: string, minutes: number): Promise<void> {
    await this.whenReady();
    const d = this.getRecord(id);
    d.seedTimeLimitMinutes = minutes;
    await db.updateDownloadField(id, 'seedTimeLimitMinutes', minutes); // enforced by the stats tick
  }

  // Blocklist filtering happens engine-side later (session blocklist-url);
  // no-op keeps main's unconditional startup call clean.
  applyIpBlocklist(_ranges: Array<[number, number]>): void {
    log.info('applyIpBlocklist: not wired to the native engine yet (no-op)');
  }

  // ── Not yet ported (explicit, typed errors instead of dispatch crashes) ─────
  addSeed(): never { return notImplemented('Seeding an existing folder'); }
  addTracker(): never { return notImplemented('Editing trackers'); }
  removeTracker(): never { return notImplemented('Editing trackers'); }
  getSwarmGeo(): never { return notImplemented('The swarm map'); }
  getStreamUrl(): never { return notImplemented('In-app streaming'); }
  stopStream(): never { return notImplemented('In-app streaming'); }
  getSubtitleTracks(): never { return notImplemented('Subtitles'); }
  getSubtitleVtt(): never { return notImplemented('Subtitles'); }
  getNetworkHealth(): never { return notImplemented('Network health'); }

  // ── Events ──────────────────────────────────────────────────────────────────
  onStats(cb: (s: DownloadStats[]) => void): () => void { this.statsCbs.add(cb); return () => this.statsCbs.delete(cb); }
  onComplete(cb: (i: { id: string; name: string }) => void): () => void { this.completeCbs.add(cb); return () => this.completeCbs.delete(cb); }
  onListening(cb: () => void): () => void { this.listeningCbs.add(cb); return () => this.listeningCbs.delete(cb); }

  // ── Stats loop ──────────────────────────────────────────────────────────────
  private async tick(): Promise<void> {
    if (!this.rpc) return;
    const torrents = await this.rpc.torrentGet(ENGINE_STAT_FIELDS);
    const byHash = new Map(torrents.map((t) => [t.hashString.toLowerCase(), t]));
    const stats: DownloadStats[] = [];
    for (const d of this.records.values()) {
      if (d.status === 'removed') continue;
      const hash = this.idToHash.get(d.id);
      const t = hash ? byHash.get(hash) : undefined;
      if (t) await this.applyTransitions(d, t);
      stats.push(mapStats(d, t));
    }
    this.lastStats = stats;
    for (const cb of this.statsCbs) { try { cb(stats); } catch { /* ignore */ } }
    if (++this.persistCounter >= PERSIST_EVERY_TICKS) {
      this.persistCounter = 0;
      await db.updateDownloadsProgressBatch(stats.map((s) => ({
        id: s.id, progress: s.progress, downloadedBytes: s.downloadedBytes, uploadedBytes: s.uploadedBytes,
        downSpeedBps: s.downSpeedBps, upSpeedBps: s.upSpeedBps, etaSeconds: s.etaSeconds, peers: s.peers, seeds: s.seeds,
      })));
    }
  }

  /** Detect and persist lifecycle transitions surfaced by the daemon. */
  private async applyTransitions(d: Download, t: TrTorrent): Promise<void> {
    // Metadata arrival (magnets): freeze name/size, warm the cast cache.
    if (!d.totalSize && t.metadataPercentComplete >= 1 && t.sizeWhenDone > 0) {
      d.totalSize = t.sizeWhenDone;
      d.name = t.name;
      await db.updateDownloadFields(d.id, { totalSize: t.sizeWhenDone, name: t.name });
      void this.warmMetaCache(d.id);
    }

    d.progress = t.percentDone;
    d.downloadedBytes = t.downloadedEver;
    d.uploadedBytes = t.uploadedEver;

    const mapped = mapStatus(t, d.status);
    if (mapped !== d.status) {
      const wasDownloading = d.status === 'downloading' || d.status === 'queued';
      if (mapped === 'error') {
        await this.setStatus(d, 'error', t.errorString || 'engine error');
      } else {
        await this.setStatus(d, mapped);
        if (wasDownloading && (mapped === 'seeding' || mapped === 'completed')) {
          d.seedingStartedAt = Date.now();
          await db.updateDownloadFields(d.id, { seedingStartedAt: d.seedingStartedAt });
          void this.warmMetaCache(d.id); // refresh `complete` flags for cast
          log.info('Torrent completed', { id: d.id, name: d.name });
          for (const cb of this.completeCbs) { try { cb({ id: d.id, name: d.name }); } catch { /* ignore */ } }
        }
      }
    }

    // Seeding TIME limit is app-level policy (ratio is enforced by the daemon).
    if (d.status === 'seeding') {
      const limitMin = d.seedTimeLimitMinutes ?? this.settings.defaultSeedTimeLimitMinutes ?? 0;
      if (limitMin > 0 && d.seedingStartedAt && Date.now() - d.seedingStartedAt > limitMin * 60_000) {
        log.info('Seed time limit reached — stopping', { id: d.id, limitMin });
        await this.stopSeeding(d.id);
      }
    }
  }

  private async warmMetaCache(id: string): Promise<void> {
    try {
      const hash = this.idToHash.get(id);
      if (!hash || !this.rpc) return;
      const [t] = await this.rpc.torrentGet(['files'], hash);
      if (t?.files?.length) this.metaCache.set(id, t.files);
    } catch { /* cast cache is best-effort */ }
  }
}

/** Complement of `selected` over the torrent's file list (undefined = keep all). */
function unwantedIndices(torrentBuf: Buffer, selected?: number[]): number[] | undefined {
  if (!selected || selected.length === 0) return undefined;
  try {
    const total = parseTorrent(torrentBuf).files?.length ?? 0;
    const keep = new Set(selected);
    const unwanted = Array.from({ length: total }, (_, i) => i).filter((i) => !keep.has(i));
    return unwanted.length > 0 ? unwanted : undefined;
  } catch {
    return undefined; // unparseable → let the daemon decide; selection can be fixed post-add
  }
}
