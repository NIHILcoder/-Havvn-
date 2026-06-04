/**
 * Share worker — runs in an Electron utilityProcess (separate OS process).
 *
 * The WebRTC native module (@roamhq/wrtc) can crash hard (native segfault) when
 * a browser peer connects. Running it here, isolated from the main process,
 * means such a crash only kills THIS process — the app keeps running and simply
 * respawns the worker on the next share.
 *
 * Protocol (over utilityProcess MessagePort):
 *   main → worker: { type:'share'|'stop'|'get'|'list', reqId, ... }
 *   worker → main: { type:'result', reqId, ok, data|error }  and  { type:'log', ... }
 */

import fs from 'fs';
import WebTorrent from 'webtorrent';

const SHARE_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.files.fm:7073/announce',
];
const RECEIVER_BASE = 'https://nihilcoder.github.io/TorrentHunt/share/';

const parentPort: any = (process as any).parentPort;

interface ShareEntry {
  downloadId: string;
  name: string;
  infoHash: string;
  magnetURI: string;
  link: string;
  createdAt: number;
}

let client: any = null;
const shares = new Map<string, ShareEntry>(); // downloadId -> entry

function post(msg: any): void {
  try { parentPort.postMessage(msg); } catch { /* parent gone */ }
}
function logWarn(msg: string): void { post({ type: 'log', level: 'warn', msg }); }

function ensureClient(): any {
  if (!client) {
    const wrtc = require('@roamhq/wrtc');
    // utp:false (native utp-native crashes Windows); dht:false — browser peers
    // can't use DHT anyway, they meet us at the wss trackers over WebRTC.
    client = new WebTorrent({ utp: false, dht: false, tracker: { wrtc } } as any);
    client.on('error', (e: any) => logWarn('share client error: ' + (e?.message || e)));
    post({ type: 'log', level: 'info', msg: 'Share client created (WebRTC, isolated)' });
  }
  return client;
}

function entryToInfo(e: ShareEntry) {
  return { downloadId: e.downloadId, name: e.name, infoHash: e.infoHash, magnetURI: e.magnetURI, link: e.link, createdAt: e.createdAt };
}

function doShare(downloadId: string, contentPath: string, name: string): Promise<ShareEntry> {
  const existing = shares.get(downloadId);
  if (existing) return Promise.resolve(existing);
  if (!fs.existsSync(contentPath)) {
    return Promise.reject(new Error('File not found on disk — the download must be complete to share'));
  }
  const c = ensureClient();
  return new Promise<ShareEntry>((resolve, reject) => {
    let settled = false;
    const onError = (err: any) => {
      if (settled) return; settled = true;
      c.removeListener('error', onError);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    c.once('error', onError);
    try {
      c.seed(contentPath, { announce: SHARE_TRACKERS, name } as any, (torrent: any) => {
        if (settled) return; settled = true;
        c.removeListener('error', onError);
        torrent.on('error', (e: any) => logWarn('share torrent error: ' + (e?.message || e)));
        torrent.on('warning', () => { /* tracker/peer noise */ });
        const entry: ShareEntry = {
          downloadId, name,
          infoHash: torrent.infoHash,
          magnetURI: torrent.magnetURI,
          link: RECEIVER_BASE + '#' + encodeURIComponent(torrent.magnetURI),
          createdAt: Date.now(),
        };
        shares.set(downloadId, entry);
        post({ type: 'log', level: 'info', msg: 'Sharing started: ' + name });
        resolve(entry);
      });
    } catch (e) { onError(e); }
  });
}

function doStop(downloadId: string): void {
  const entry = shares.get(downloadId);
  if (!entry || !client) return;
  shares.delete(downloadId);
  try {
    const t = client.torrents.find((x: any) => x.infoHash === entry.infoHash);
    if (t) client.remove(t);
  } catch (e) { logWarn('stop failed: ' + String(e)); }
}

function getInfo(downloadId: string): any {
  const entry = shares.get(downloadId);
  if (!entry) return null;
  let peers = 0;
  if (client) {
    const t = client.torrents.find((x: any) => x.infoHash === entry.infoHash);
    peers = t ? (t.numPeers || 0) : 0;
  }
  return { ...entryToInfo(entry), peers };
}

async function handle(msg: any): Promise<void> {
  const { type, reqId } = msg;
  try {
    let data: any;
    if (type === 'share') data = entryToInfo(await doShare(msg.downloadId, msg.contentPath, msg.name));
    else if (type === 'stop') { doStop(msg.downloadId); data = { ok: true }; }
    else if (type === 'get') data = getInfo(msg.downloadId);
    else if (type === 'list') data = Array.from(shares.values()).map(entryToInfo).sort((a, b) => b.createdAt - a.createdAt);
    else throw new Error('Unknown command: ' + type);
    post({ type: 'result', reqId, ok: true, data });
  } catch (e: any) {
    post({ type: 'result', reqId, ok: false, error: e?.message || String(e) });
  }
}

parentPort.on('message', (e: any) => { void handle(e.data); });
