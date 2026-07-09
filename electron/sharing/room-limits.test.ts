/**
 * Integration test for per-room speed limits.
 *
 * Same harness as room-revive/room-autofetch: REAL room-engine instances with
 * the Electron/WebTorrent/tracker boundaries mocked. Rooms now get a WebTorrent
 * client EACH — that's what makes per-room throttling real — so the fake
 * captures constructor options and throttle calls per instance.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Sent = { channel: string; payload: any };
type EngineCtx = {
  listeners: Record<string, (e: any, msg: any) => void>;
  sent: Sent[];
};

const H = vi.hoisted(() => ({
  trackers: [] as any[],
  clients: [] as any[],    // FakeWebTorrent instances in creation order
}));

vi.mock('webtorrent', async () => {
  const { default: fsMod } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  class FakeTorrent {
    handlers: Record<string, any[]> = {};
    infoHash: string; magnetURI: string; length: number; progress: number; done: boolean;
    constructor(infoHash: string, length: number, done: boolean) {
      this.infoHash = infoHash;
      this.magnetURI = 'magnet:?xt=urn:btih:' + infoHash;
      this.length = length; this.done = done; this.progress = done ? 1 : 0;
    }
    on(ev: string, fn: any): void { (this.handlers[ev] ??= []).push(fn); }
    once(ev: string, fn: any): void { this.on(ev, fn); }
  }
  class FakeWebTorrent {
    torrents = new Map<string, FakeTorrent>();
    handlers: Record<string, any[]> = {};
    opts: any;
    throttleCalls: Array<[string, number]> = [];
    destroyed = false;
    constructor(opts: any) { this.opts = opts; H.clients.push(this); }
    on(ev: string, fn: any): void { (this.handlers[ev] ??= []).push(fn); }
    once(ev: string, fn: any): void { this.on(ev, fn); }
    removeListener(ev: string, fn: any): void {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
    }
    throttleUpload(rate: number): void { this.throttleCalls.push(['up', rate]); }
    throttleDownload(rate: number): void { this.throttleCalls.push(['down', rate]); }
    destroy(): void { this.destroyed = true; }
    seed(p: string, _opts: any, cb: (t: any) => void): void {
      const content = fsMod.readFileSync(p);
      const infoHash = createHash('sha1').update(content).digest('hex');
      const t = this.torrents.get(infoHash) ?? new FakeTorrent(infoHash, content.length, true);
      this.torrents.set(infoHash, t);
      cb(t);
    }
    add(magnet: string, _opts: any, cb: (t: any) => void): void {
      const infoHash = /btih:([0-9a-f]+)/.exec(magnet)?.[1] ?? '';
      const t = new FakeTorrent(infoHash, 0, false);
      this.torrents.set(infoHash, t);
      cb(t);
    }
    get(infoHash: string): FakeTorrent | null {
      return (infoHash && this.torrents.get(infoHash)) || null;
    }
    remove(t: FakeTorrent): void { this.torrents.delete(t.infoHash); }
  }
  return { default: FakeWebTorrent };
});

vi.mock('bittorrent-tracker', () => {
  class FakeTracker {
    handlers: Record<string, any[]> = {};
    constructor() { H.trackers.push(this); }
    on(ev: string, fn: any): void { (this.handlers[ev] ??= []).push(fn); }
    emitPeer(peer: any): void { for (const fn of this.handlers['peer'] ?? []) fn(peer); }
    start(): void { /* no-op */ }
    stop(): void { /* no-op */ }
    destroy(): void { /* no-op */ }
  }
  return { default: FakeTracker };
});

const flush = async (rounds = 25): Promise<void> => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

type Engine = EngineCtx;

let reqSeq = 3000;
async function cmd<T = any>(inst: Engine, msg: Record<string, unknown>): Promise<T> {
  const reqId = ++reqSeq;
  inst.listeners['room-cmd'](null, { reqId, ...msg });
  await flush();
  const res = inst.sent
    .filter((s) => s.channel === 'room-res')
    .map((s) => s.payload)
    .find((p) => p?.reqId === reqId);
  if (!res) throw new Error('engine sent no response');
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

async function makeEngine(): Promise<Engine> {
  const ctx: Engine = { listeners: {}, sent: [] };
  vi.resetModules();
  vi.doMock('electron', () => ({
    ipcRenderer: {
      on: (channel: string, fn: any) => { ctx.listeners[channel] = fn; },
      send: (channel: string, ...args: any[]) => { ctx.sent.push({ channel, payload: args[0] }); },
    },
  }));
  await import('./room-engine');
  return ctx;
}

function joinPayload(roomId: string, code: string, memberId: string, folder: string, limits?: { upKbps?: number; downKbps?: number }) {
  return {
    type: 'join',
    payload: {
      roomId, name: 'Limits ' + roomId, code, folder,
      self: { memberId, name: memberId, avatarSeed: memberId, pub: '', priv: '' },
      useTurn: false, turnServers: [],
      tombstones: {}, manifest: [], ownerId: memberId, mutes: [], history: [], chat: [],
      identities: {}, e2e: false, secret: '', cacheDir: '',
      ...(limits ?? {}),
    },
  };
}

let dir: string;
let fileA: string;
let fileB: string;

beforeAll(() => {
  (globalThis as any).window = globalThis;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-limits-'));
  fileA = path.join(dir, 'a.mkv');
  fileB = path.join(dir, 'b.mkv');
  fs.writeFileSync(fileA, 'limits test content A');
  fs.writeFileSync(fileB, 'limits test content B');
  for (const d of ['r1', 'r2']) fs.mkdirSync(path.join(dir, d));
});
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('per-room speed limits', () => {
  let E: Engine;

  it("the room's client is created with the persisted ceilings (KB/s → bytes/s)", async () => {
    E = await makeEngine();
    const state = await cmd(E, joinPayload('room-1', 'code-one-alpha', 'A', path.join(dir, 'r1'), { upKbps: 500, downKbps: 100 }));
    expect(state.upKbps).toBe(500);
    expect(state.downKbps).toBe(100);

    // The client is lazy — seeding the first file constructs it.
    await cmd(E, { type: 'addFiles', roomId: 'room-1', paths: [fileA] });
    const c1 = H.clients[H.clients.length - 1];
    expect(c1.opts.uploadLimit).toBe(500 * 1024);
    expect(c1.opts.downloadLimit).toBe(100 * 1024);
  });

  it('setLimits throttles the live client and 0 lifts the limit (-1)', async () => {
    const c1 = H.clients[H.clients.length - 1];
    await cmd(E, { type: 'setLimits', roomId: 'room-1', upKbps: 256, downKbps: 0 });
    expect(c1.throttleCalls).toContainEqual(['up', 256 * 1024]);
    expect(c1.throttleCalls).toContainEqual(['down', -1]);

    const state = await cmd(E, { type: 'snapshot', roomId: 'room-1' });
    expect(state.upKbps).toBe(256);
    expect(state.downKbps).toBe(0);
  });

  it('each room gets its own client with its own ceilings', async () => {
    await cmd(E, joinPayload('room-2', 'code-two-bravo', 'A', path.join(dir, 'r2'))); // no limits
    await cmd(E, { type: 'addFiles', roomId: 'room-2', paths: [fileB] });
    const c2 = H.clients[H.clients.length - 1];
    const c1 = H.clients[H.clients.length - 2];
    expect(c2).not.toBe(c1);
    expect(c2.opts.uploadLimit).toBe(-1);   // unlimited by default
    expect(c2.opts.downloadLimit).toBe(-1);

    // Throttling room-2 must not touch room-1's client.
    const before = c1.throttleCalls.length;
    await cmd(E, { type: 'setLimits', roomId: 'room-2', upKbps: 64, downKbps: 32 });
    expect(c2.throttleCalls).toContainEqual(['up', 64 * 1024]);
    expect(c1.throttleCalls.length).toBe(before);
  });

  it("leaving a room destroys ITS client only", async () => {
    const c1 = H.clients[H.clients.length - 2];
    const c2 = H.clients[H.clients.length - 1];
    await cmd(E, { type: 'leave', roomId: 'room-1' });
    await new Promise((r) => setTimeout(r, 300)); // teardown is deferred ~200ms
    expect(c1.destroyed).toBe(true);
    expect(c2.destroyed).toBe(false);
  });
});
