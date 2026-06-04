/**
 * ShareManager — "Instant Share Links" (Phase 2 of the P2P hub).
 *
 * This is a thin PROXY in the main process. The actual WebTorrent + WebRTC work
 * runs in an isolated utilityProcess (see share-worker.ts), because the native
 * WebRTC module can crash the whole process when a browser peer connects.
 * Isolating it means such a crash only kills the worker — the app survives and
 * respawns it on the next share.
 */

import path from 'path';
import { utilityProcess, UtilityProcess } from 'electron';
import { logger } from '../utils';
import { ShareInfo } from '../../shared/types';

const log = logger.child('ShareManager');

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class ShareManager {
  private worker: UtilityProcess | null = null;
  private pending: Map<number, Pending> = new Map();
  private reqSeq = 0;

  private ensureWorker(): UtilityProcess {
    if (this.worker) return this.worker;
    // share-worker.js is compiled next to this file and stays INSIDE the asar,
    // so it resolves node_modules exactly like the main process does (the native
    // WebRTC module is redirected to app.asar.unpacked automatically). Forking
    // from the unpacked copy would break `require('webtorrent')`.
    const workerPath = path.join(__dirname, 'share-worker.js');
    const child = utilityProcess.fork(workerPath, [], { serviceName: 'th-share', stdio: 'pipe' });

    // Surface worker stdout/stderr into our log so load-time failures are visible.
    (child as any).stderr?.on('data', (d: any) => log.warn('Worker stderr', { out: String(d).slice(0, 800) }));
    (child as any).stdout?.on('data', (d: any) => log.info('Worker stdout', { out: String(d).slice(0, 800) }));

    child.on('message', (msg: any) => this.onMessage(msg));
    child.on('exit', (code: number) => this.onExit(code));

    this.worker = child;
    log.info('Share worker spawned', { workerPath });
    return child;
  }

  private onMessage(msg: any): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'result') {
      const p = this.pending.get(msg.reqId);
      if (!p) return;
      this.pending.delete(msg.reqId);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.error || 'Share worker error'));
    } else if (msg.type === 'log') {
      const level = msg.level === 'warn' ? 'warn' : 'info';
      (log as any)[level]('Worker', { msg: msg.msg });
    }
  }

  private onExit(code: number): void {
    log.warn('Share worker exited', { code });
    // The worker (and its native WebRTC) died — reject everything in flight but
    // keep the app alive. Shares are gone; a new share respawns the worker.
    for (const [, p] of this.pending) {
      p.reject(new Error('Sharing stopped unexpectedly (the share process crashed). Please try again.'));
    }
    this.pending.clear();
    this.worker = null;
  }

  private call<T = any>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 0): Promise<T> {
    const child = this.ensureWorker();
    const reqId = ++this.reqSeq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (this.pending.has(reqId)) {
            this.pending.delete(reqId);
            reject(new Error('Share worker did not respond'));
          }
        }, timeoutMs);
      }
      child.postMessage({ type, reqId, ...payload });
    });
  }

  /** Start sharing a completed download's content (seeded from disk). */
  share(downloadId: string, contentPath: string, name: string): Promise<ShareInfo> {
    // No timeout: seeding hashes the file, which can take a while for big files.
    return this.call<ShareInfo>('share', { downloadId, contentPath, name });
  }

  stop(downloadId: string): Promise<{ ok: boolean }> {
    return this.call('stop', { downloadId }, 8000);
  }

  /** Returns the share + live peer count, or null if not shared. */
  get(downloadId: string): Promise<(ShareInfo & { peers: number }) | null> {
    return this.call('get', { downloadId }, 8000);
  }

  list(): Promise<ShareInfo[]> {
    return this.call('list', {}, 8000);
  }

  destroy(): void {
    for (const [, p] of this.pending) p.reject(new Error('Shutting down'));
    this.pending.clear();
    if (this.worker) {
      try { this.worker.kill(); } catch { /* ignore */ }
      this.worker = null;
    }
    log.info('ShareManager destroyed');
  }
}

let shareManager: ShareManager | null = null;
export function getShareManager(): ShareManager {
  if (!shareManager) shareManager = new ShareManager();
  return shareManager;
}

/** Helper: absolute path to a download's content on disk. */
export function downloadContentPath(savePath: string, name: string): string {
  return path.join(savePath, name);
}
