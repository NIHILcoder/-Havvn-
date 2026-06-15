/**
 * Disk-Space Guard
 *
 * Periodically checks free space on the download directory while torrents are
 * active. If free space falls below the configured threshold, it auto-pauses
 * ALL torrents (so a full disk can't corrupt writes or wedge the client),
 * fires an OS notification, and tells the renderer to show a warning banner.
 *
 * Resume is manual — the user frees space, then resumes. Re-arms automatically
 * once free space recovers above the threshold.
 *
 * Enabled via AppSettings.diskGuardEnabled / diskGuardMinFreeMB.
 */

import { BrowserWindow, Notification } from 'electron';
import { logger, checkDiskSpace, formatBytes, getAppIconPath } from './index';
import * as db from '../db/store';
import { getTorrentManager } from '../torrent';

const log = logger.child('DiskGuard');

const CHECK_INTERVAL_MS = 30_000; // re-check every 30s

let timer: NodeJS.Timeout | null = null;
let tripped = false; // already auto-paused this low-space episode
let mainWindowRef: BrowserWindow | null = null;

export function initDiskGuard(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
  void restartGuardFromConfig();
}

/** (Re)start or stop the guard loop based on persisted settings. */
export async function restartGuardFromConfig(): Promise<void> {
  let enabled = false;
  try {
    const settings = await db.getSettings();
    enabled = settings.diskGuardEnabled !== false; // default on
  } catch {
    enabled = false;
  }

  stopDiskGuard();
  if (!enabled) {
    log.info('Disk-space guard disabled');
    return;
  }

  log.info('Disk-space guard enabled — monitoring');
  tripped = false;
  timer = setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
  setTimeout(() => { void tick(); }, 3_000);
}

export function stopDiskGuard(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  try {
    const settings = await db.getSettings();
    const thresholdBytes = Math.max(0, (settings.diskGuardMinFreeMB ?? 2048)) * 1024 * 1024;

    const manager = getTorrentManager();
    const downloads = await manager.getDownloads();
    const active = downloads.filter(
      d => d.status === 'downloading' || d.status === 'queued'
    );
    if (active.length === 0) {
      // Nothing writing to disk → reset latch and skip
      tripped = false;
      return;
    }

    const free = await checkDiskSpace(settings.defaultDownloadDir);
    if (free === null) return; // couldn't determine — don't act blindly

    if (free < thresholdBytes && !tripped) {
      tripped = true;
      const count = await manager.pauseAllActive();
      log.warn('Low disk space — auto-paused all torrents', {
        free: formatBytes(free),
        threshold: formatBytes(thresholdBytes),
        paused: count,
      });
      notifyLowSpace(free, count);
      sendToRenderer('app:diskLow', {
        paused: count,
        freeBytes: free,
        thresholdBytes,
      });
    } else if (free >= thresholdBytes && tripped) {
      // Space recovered — re-arm (resume stays manual)
      tripped = false;
      log.info('Disk space recovered — guard re-armed (resume is manual)');
      sendToRenderer('app:diskRecovered', { freeBytes: free });
    }
  } catch (e) {
    log.error('Disk guard tick failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

function notifyLowSpace(free: number, count: number): void {
  try {
    if (!Notification.isSupported()) return;
    const iconPath = getAppIconPath();
    const n = new Notification({
      title: 'Low disk space — torrents paused',
      body: count > 0
        ? `Only ${formatBytes(free)} free. Paused ${count} torrent${count === 1 ? '' : 's'}. Free up space, then resume manually.`
        : `Only ${formatBytes(free)} free on the download drive.`,
      ...(iconPath ? { icon: iconPath } : {}),
      urgency: 'critical',
    });
    n.show();
  } catch {
    /* best-effort */
  }
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload);
  }
}
