/**
 * VPN Kill-Switch / Guard
 *
 * Periodically re-checks VPN status while torrents are active. If the VPN drops
 * (was up, now down) it auto-pauses ALL torrents so the user's real IP isn't
 * exposed to the swarm, fires an OS notification, and tells the renderer to show
 * a warning banner. Resume is manual by design (the user decides when it's safe).
 *
 * Enabled via PrivacyConfig.vpnKillSwitch.
 */

import { BrowserWindow, Notification } from 'electron';
import { detectVPN } from './vpn-detector';
import { logger } from './logger';
import { getAppIconPath } from './index';
import * as db from '../db/store';
import { getTorrentManager } from '../torrent';
import { t } from '../i18n';

const log = logger.child('VPNGuard');

const CHECK_INTERVAL_MS = 20_000; // re-check every 20s

let timer: NodeJS.Timeout | null = null;
let lastVpnActive: boolean | null = null; // null = unknown / not yet checked
let tripped = false;                       // already auto-paused this outage
let mainWindowRef: BrowserWindow | null = null;

export function initVpnGuard(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
  // Re-evaluate whenever settings might have changed or on start
  void restartGuardFromConfig();
}

/** (Re)start or stop the guard loop based on the persisted privacy config. */
export async function restartGuardFromConfig(): Promise<void> {
  let enabled = false;
  try {
    const cfg = await db.getPrivacyConfig();
    enabled = cfg.vpnKillSwitch === true;
  } catch {
    enabled = false;
  }

  stopVpnGuard();
  if (!enabled) {
    log.info('VPN kill-switch disabled');
    return;
  }

  log.info('VPN kill-switch enabled — monitoring');
  lastVpnActive = null;
  tripped = false;
  timer = setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
  // Run one check shortly after enabling
  setTimeout(() => { void tick(); }, 2_000);
}

export function stopVpnGuard(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  try {
    // Only act when there is something to protect
    const manager = getTorrentManager();
    const downloads = await manager.getDownloads();
    const hasActive = downloads.some(
      d => d.status === 'downloading' || d.status === 'queued' || d.status === 'seeding'
    );

    const result = await detectVPN();
    const vpnActive = result.isVPNActive;

    // VPN dropped: was active (or known) and now inactive, with active torrents
    if (lastVpnActive !== false && !vpnActive && hasActive && !tripped) {
      tripped = true;
      const count = await manager.pauseAllActive();
      log.warn('VPN dropped — auto-paused all torrents', { paused: count });
      notifyDropped(count);
      sendToRenderer('app:vpnDropped', { paused: count, publicIP: result.details.publicIP });
    }

    // VPN restored: clear the tripped latch so a future drop trips again.
    // Resume stays manual — we only inform the renderer.
    if (vpnActive && tripped) {
      tripped = false;
      log.info('VPN restored — kill-switch re-armed (resume is manual)');
      sendToRenderer('app:vpnRestored', {});
    }

    lastVpnActive = vpnActive;
  } catch (e) {
    log.error('VPN guard tick failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

function notifyDropped(count: number): void {
  try {
    if (!Notification.isSupported()) return;
    const iconPath = getAppIconPath();
    const n = new Notification({
      title: t('notify.vpnLost.title'),
      body: count > 0
        ? t(count === 1 ? 'notify.vpnLost.bodyOne' : 'notify.vpnLost.bodyMany', { count })
        : t('notify.vpnLost.bodyNone'),
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
