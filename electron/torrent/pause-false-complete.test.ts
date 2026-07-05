/**
 * Regression test: pausing a PARTIAL download must not be reported as "complete".
 *
 * Root cause (pinned here against real WebTorrent loopback wires): the app pauses
 * by clearing torrent._selections (manager.haltTorrent). But WebTorrent's
 * _checkDone() treats "no selections" as DONE — its own comment says "if all
 * current selections are satisfied, OR there are no selections, then torrent is
 * done" — and fires a spurious 'done' when the next in-flight piece verifies.
 * With the old ordering (status still 'downloading' at halt time), the manager's
 * 'done' handler then falsely marked the half-finished torrent as seeding/100%.
 *
 * This test proves the WebTorrent behaviour our fix guards against, so a
 * webtorrent upgrade that changes it can't silently rot the guard:
 *   1) a genuinely partial torrent (progress < 1) still has t.done === false;
 *   2) after clearing _selections, _checkDone() reports done === true and t.done
 *      flips true — the false completion — even though progress is still < 1;
 *   3) the exact condition the manager's backstop keys on (_selections.length===0
 *      while progress < 1) holds at that moment.
 */
import { describe, it, expect, afterAll } from 'vitest';
import WebTorrent from 'webtorrent';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-falsecomplete-'));
const seedDir = path.join(dir, 'seed');
const dlDir = path.join(dir, 'dl');
fs.mkdirSync(seedDir);
fs.mkdirSync(dlDir);

// 2 x 16MB — big enough that the leecher is still partial when we pause.
for (const name of ['a.bin', 'b.bin']) {
  const fd = fs.openSync(path.join(seedDir, name), 'w');
  for (let i = 0; i < 4; i++) fs.writeSync(fd, crypto.randomBytes(4 * 1024 * 1024));
  fs.closeSync(fd);
}

const quiet = { dht: false, tracker: false, lsd: false, webSeeds: false, natUpnp: false, natPmp: false } as any;
const seeder = new WebTorrent({ ...quiet, uploadLimit: 2 * 1024 * 1024 } as any);
const leecher = new WebTorrent({ ...quiet } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  await new Promise<void>((r) => leecher.destroy(() => r()));
  await new Promise<void>((r) => seeder.destroy(() => r()));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('pause must not falsely complete a partial download', () => {
  it('clearing _selections makes WebTorrent report a partial torrent as done', async () => {
    const seedTorrent: any = await new Promise((resolve) =>
      seeder.seed([path.join(seedDir, 'a.bin'), path.join(seedDir, 'b.bin')],
        { name: 'falsecomplete', announce: [] } as any, resolve),
    );
    const port = (seeder as any).torrentPort;

    const t: any = await new Promise((resolve) =>
      leecher.add(seedTorrent.torrentFile, { path: dlDir, announce: [] } as any, resolve),
    );
    t.addPeer('127.0.0.1:' + port);
    t.files.forEach((f: any) => f.select());

    // Download a bit, but nowhere near complete (seeder throttled to 2MB/s, 32MB total).
    const started = Date.now();
    while (t.received < 1024 * 1024) {
      if (Date.now() - started > 30000) throw new Error('no data flowing — loopback setup broken');
      await sleep(200);
    }

    // Sanity: we are genuinely partial and WebTorrent agrees it is not done.
    expect(t.progress).toBeLessThan(1);
    expect(t.done).toBe(false);

    // Pause the way manager.haltTorrent does: clear the selection list.
    try { t.pause(); } catch { /* ignore */ }
    t._selections.length = 0;
    t._critical = [];
    t._updateInterest();

    // The false completion: with no selections, _checkDone() reports done — and
    // flips t.done true — even though the torrent is still partial.
    const reportedDone = t._checkDone();
    expect(t.progress).toBeLessThan(1);          // still NOT actually complete
    expect(reportedDone).toBe(true);             // ...yet WebTorrent says "done"
    expect(t.done).toBe(true);

    // This is precisely the condition the manager's 'done' backstop keys on.
    expect(Array.isArray(t._selections) && t._selections.length === 0).toBe(true);
  }, 60000);
});
