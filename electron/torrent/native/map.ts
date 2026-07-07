/**
 * Pure mapping between transmission RPC shapes and the app's shared types
 * (DownloadStats / TorrentFile / PeerInfo / TrackerInfo). No I/O — unit-tested.
 */

import path from 'node:path';
import type { Download, DownloadStats, DownloadStatus, TorrentFile, PeerInfo, TrackerInfo, FilePriority } from '../../../shared/types';
import { TrStatus, TrTorrent } from './transmission-rpc';

/** torrent-get fields the 750ms stats tick requests (request only what you read). */
export const ENGINE_STAT_FIELDS = [
  'hashString', 'name', 'status', 'percentDone', 'metadataPercentComplete',
  'rateDownload', 'rateUpload', 'peersConnected', 'peersSendingToUs',
  'sizeWhenDone', 'downloadedEver', 'uploadedEver', 'eta', 'isFinished',
  'error', 'errorString',
];

/**
 * Daemon activity → app DownloadStatus. `prev` (the persisted status) breaks the
 * ties the daemon can't express: a stopped torrent is 'completed' only when all
 * wanted bytes exist, and a checking torrent keeps its seeding/downloading face.
 */
export function mapStatus(t: TrTorrent, prev: DownloadStatus): DownloadStatus {
  if (t.error !== 0) return 'error';
  switch (t.status) {
    case TrStatus.Stopped:
      return t.isFinished || t.percentDone >= 1 ? 'completed' : 'paused';
    case TrStatus.Downloading:
    case TrStatus.DownloadWait:
      return 'downloading';
    case TrStatus.Seeding:
    case TrStatus.SeedWait:
      return 'seeding';
    case TrStatus.Checking:
    case TrStatus.CheckWait:
      return prev === 'seeding' || prev === 'completed' ? prev : 'downloading';
    default:
      return prev;
  }
}

/**
 * One stats row. `t` undefined = the torrent has no live daemon entry (paused /
 * completed / error rows kept only in the DB) → persisted snapshot, zero speeds,
 * mirroring the webtorrent manager's semantics.
 */
export function mapStats(d: Download, t?: TrTorrent): DownloadStats {
  if (!t) {
    return {
      id: d.id,
      progress: d.progress,
      downloadedBytes: d.downloadedBytes,
      uploadedBytes: d.uploadedBytes,
      downSpeedBps: 0,
      upSpeedBps: 0,
      etaSeconds: null,
      peers: 0,
      seeds: 0,
      status: d.status,
    };
  }
  return {
    id: d.id,
    progress: t.percentDone,
    downloadedBytes: t.downloadedEver,
    uploadedBytes: t.uploadedEver,
    downSpeedBps: t.rateDownload,
    upSpeedBps: t.rateUpload,
    etaSeconds: t.eta > 0 ? t.eta : null,
    peers: t.peersConnected,
    // Unlike webtorrent, transmission tells us who actually feeds us. While
    // seeding this is naturally 0 (we download nothing).
    seeds: t.peersSendingToUs,
    status: mapStatus(t, d.status),
  };
}

const TR_PRIORITY: Record<number, FilePriority> = { [-1]: 'low', 0: 'normal', 1: 'high' };

/** files + fileStats (parallel arrays) → the app's TorrentFile list. */
export function mapFiles(t: TrTorrent): TorrentFile[] {
  const files = t.files ?? [];
  const stats = t.fileStats ?? [];
  return files.map((f, i) => {
    const st = stats[i];
    return {
      index: i,
      name: path.basename(f.name),
      path: f.name, // torrent-relative, includes the root folder — same as webtorrent's file.path
      length: f.length,
      downloaded: f.bytesCompleted,
      progress: f.length > 0 ? f.bytesCompleted / f.length : 1,
      priority: st ? (st.wanted ? TR_PRIORITY[st.priority] ?? 'normal' : 'skip') : 'normal',
    };
  });
}

export function mapPeers(t: TrTorrent): PeerInfo[] {
  return (t.peers ?? []).map((p) => ({
    address: `${p.address}:${p.port}`,
    client: p.clientName || undefined,
    connType: p.isUTP ? (p.isIncoming ? 'utp-in' : 'utp-out') : (p.isIncoming ? 'tcp-in' : 'tcp-out'),
    downSpeed: p.rateToClient,
    upSpeed: p.rateToPeer,
    downloaded: p.bytesToClient ?? 0,
    uploaded: p.bytesToPeer ?? 0,
    progress: p.progress,
    // transmission naming: client* = our side of the link, peer* = theirs.
    flags: {
      interested: p.clientIsInterested,
      choking: p.peerIsChoked,
      peerInterested: p.peerIsInterested,
      peerChoking: p.clientIsChoked,
    },
  }));
}

export function mapTrackers(t: TrTorrent): TrackerInfo[] {
  return (t.trackerStats ?? []).map((s) => ({
    url: s.announce,
    status: s.lastAnnounceSucceeded
      ? 'connected'
      : s.lastAnnounceTime > 0 || s.lastAnnounceResult
        ? 'error'
        : 'updating',
    peers: Math.max(0, s.lastAnnouncePeerCount || s.seederCount + s.leecherCount || 0),
    lastAnnounce: s.lastAnnounceTime > 0 ? s.lastAnnounceTime * 1000 : undefined,
  }));
}
