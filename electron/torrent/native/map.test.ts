import { describe, it, expect } from 'vitest';
import { mapStatus, mapStats, mapFiles, mapPeers, mapTrackers } from './map';
import { TrStatus, TrTorrent, TrPeer, TrTrackerStat } from './transmission-rpc';
import type { Download } from '../../../shared/types';

const tr = (over: Partial<TrTorrent>): TrTorrent => ({
  id: 1, hashString: 'a'.repeat(40), name: 't', status: TrStatus.Downloading,
  percentDone: 0.5, recheckProgress: 0, totalSize: 100, sizeWhenDone: 100, leftUntilDone: 50,
  rateDownload: 1000, rateUpload: 200, downloadedEver: 50, uploadedEver: 10, uploadRatio: 0.2,
  eta: 60, peersConnected: 5, peersSendingToUs: 3, peersGettingFromUs: 1,
  error: 0, errorString: '', isFinished: false, downloadDir: 'D:/dl', magnetLink: '',
  metadataPercentComplete: 1,
  ...over,
});

const dl = (over: Partial<Download>): Download => ({
  id: 'id1', name: 'n', sourceType: 'magnet', sourceUri: 'magnet:?', torrentFilePath: null,
  savePath: 'D:/dl', status: 'downloading', progress: 0.4, downloadedBytes: 40, uploadedBytes: 4,
  downSpeedBps: 0, upSpeedBps: 0, etaSeconds: null, peers: 0, seeds: 0, totalSize: 100,
  priority: 1, category: null, createdAt: new Date(0), updatedAt: new Date(0), lastError: null,
  ...over,
});

describe('mapStatus', () => {
  it('maps daemon activity to app statuses', () => {
    expect(mapStatus(tr({ status: TrStatus.Downloading }), 'paused')).toBe('downloading');
    expect(mapStatus(tr({ status: TrStatus.DownloadWait }), 'paused')).toBe('downloading');
    expect(mapStatus(tr({ status: TrStatus.Seeding }), 'downloading')).toBe('seeding');
    expect(mapStatus(tr({ status: TrStatus.SeedWait }), 'downloading')).toBe('seeding');
  });
  it('splits Stopped into paused vs completed by wanted bytes', () => {
    expect(mapStatus(tr({ status: TrStatus.Stopped, percentDone: 0.3 }), 'downloading')).toBe('paused');
    expect(mapStatus(tr({ status: TrStatus.Stopped, percentDone: 1 }), 'seeding')).toBe('completed');
    expect(mapStatus(tr({ status: TrStatus.Stopped, percentDone: 0.3, isFinished: true }), 'seeding')).toBe('completed');
  });
  it('error flag wins over activity', () => {
    expect(mapStatus(tr({ status: TrStatus.Downloading, error: 3 }), 'downloading')).toBe('error');
  });
  it('checking keeps a seeding/completed face, else reads as downloading', () => {
    expect(mapStatus(tr({ status: TrStatus.Checking }), 'seeding')).toBe('seeding');
    expect(mapStatus(tr({ status: TrStatus.CheckWait }), 'completed')).toBe('completed');
    expect(mapStatus(tr({ status: TrStatus.Checking }), 'paused')).toBe('downloading');
  });
});

describe('mapStats', () => {
  it('uses live daemon numbers when present', () => {
    const s = mapStats(dl({}), tr({}));
    expect(s).toMatchObject({ id: 'id1', progress: 0.5, downSpeedBps: 1000, peers: 5, seeds: 3, etaSeconds: 60, status: 'downloading' });
  });
  it('falls back to the persisted snapshot with zero speeds when the torrent is not live', () => {
    const s = mapStats(dl({ status: 'paused', progress: 0.4 }), undefined);
    expect(s).toMatchObject({ progress: 0.4, downSpeedBps: 0, upSpeedBps: 0, peers: 0, seeds: 0, etaSeconds: null, status: 'paused' });
  });
  it('normalizes eta sentinels (-1/-2) to null', () => {
    expect(mapStats(dl({}), tr({ eta: -1 })).etaSeconds).toBeNull();
  });
});

describe('mapFiles', () => {
  it('joins files with fileStats and maps skip/priority', () => {
    const t = tr({
      files: [
        { name: 'Show/ep1.mkv', length: 100, bytesCompleted: 50 },
        { name: 'Show/ep2.mkv', length: 100, bytesCompleted: 0 },
      ],
      fileStats: [
        { wanted: true, priority: 1, bytesCompleted: 50 },
        { wanted: false, priority: 0, bytesCompleted: 0 },
      ],
    });
    const files = mapFiles(t);
    expect(files[0]).toMatchObject({ index: 0, name: 'ep1.mkv', path: 'Show/ep1.mkv', progress: 0.5, priority: 'high' });
    expect(files[1].priority).toBe('skip');
  });
});

describe('mapPeers', () => {
  it('maps transport, direction and choke semantics', () => {
    const peer: TrPeer = {
      address: '1.2.3.4', port: 51413, clientName: 'qBittorrent 5.0', isUTP: true, isEncrypted: true,
      isIncoming: false, rateToClient: 500, rateToPeer: 100, progress: 0.8, flagStr: 'DE',
      clientIsChoked: true, clientIsInterested: true, peerIsChoked: false, peerIsInterested: true,
      bytesToClient: 1234, bytesToPeer: 99,
    };
    const [p] = mapPeers(tr({ peers: [peer] }));
    expect(p).toMatchObject({
      address: '1.2.3.4:51413', connType: 'utp-out', downSpeed: 500, upSpeed: 100,
      downloaded: 1234, uploaded: 99,
      flags: { interested: true, choking: false, peerInterested: true, peerChoking: true },
    });
  });
});

describe('mapTrackers', () => {
  const stat = (over: Partial<TrTrackerStat>): TrTrackerStat => ({
    id: 0, host: 'tr.example', announce: 'udp://tr.example/announce', announceState: 1,
    lastAnnounceResult: '', lastAnnounceSucceeded: false, lastAnnounceTime: 0,
    lastAnnouncePeerCount: 0, seederCount: 0, leecherCount: 0, ...over,
  });
  it('classifies connected / error / updating', () => {
    const t = tr({
      trackerStats: [
        stat({ lastAnnounceSucceeded: true, lastAnnounceTime: 1000, lastAnnouncePeerCount: 7 }),
        stat({ lastAnnounceResult: 'Could not connect', lastAnnounceTime: 900 }),
        stat({}),
      ],
    });
    const [ok, err, fresh] = mapTrackers(t);
    expect(ok).toMatchObject({ status: 'connected', peers: 7, lastAnnounce: 1_000_000 });
    expect(err.status).toBe('error');
    expect(fresh.status).toBe('updating');
  });
});
