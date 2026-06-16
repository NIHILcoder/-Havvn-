/**
 * Torrent health scoring.
 *
 * Combines the few signals WebTorrent exposes (seeds, peers, download speed)
 * into a single 0–100 score + label, so the user can tell at a glance whether
 * a torrent is alive and likely to finish. This is a heuristic — peer/seed
 * counts from WebTorrent are approximate — so we keep it coarse (4 buckets).
 */

export type HealthLevel = 'healthy' | 'ok' | 'weak' | 'dead' | 'unknown';

export interface TorrentHealth {
  score: number;        // 0–100
  level: HealthLevel;
  label: string;        // English fallback
  // i18n key suffix → health.<labelKey>
  labelKey: 'complete' | 'paused' | 'error' | 'queued' | 'noPeers' | 'healthy' | 'ok' | 'weak' | 'poor';
  reason: string;       // short tooltip explanation (English)
}

interface HealthInput {
  status: string;
  seeds: number;
  peers: number;
  downSpeedBps: number;
  progress: number;     // 0–1
}

export function computeTorrentHealth(s: HealthInput): TorrentHealth {
  // States where a swarm score is meaningless
  if (s.status === 'completed' || s.status === 'seeding') {
    return { score: 100, level: 'healthy', label: 'Complete', labelKey: 'complete', reason: 'Download finished.' };
  }
  if (s.status === 'paused') {
    return { score: 0, level: 'unknown', label: 'Paused', labelKey: 'paused', reason: 'Paused — no live swarm data.' };
  }
  if (s.status === 'error') {
    return { score: 0, level: 'dead', label: 'Error', labelKey: 'error', reason: 'Torrent is in an error state.' };
  }
  if (s.status === 'queued') {
    return { score: 0, level: 'unknown', label: 'Queued', labelKey: 'queued', reason: 'Waiting to start.' };
  }

  const seeds = Math.max(0, s.seeds || 0);
  const peers = Math.max(0, s.peers || 0);
  const downloading = s.downSpeedBps > 1024; // >1 KB/s counts as real movement

  // No connections at all and not moving → effectively dead
  if (seeds === 0 && peers === 0 && !downloading) {
    return { score: 5, level: 'dead', label: 'No peers', labelKey: 'noPeers', reason: 'No seeds or peers found — this torrent may be dead.' };
  }

  // Seed availability is the dominant factor (need someone with the full file)
  let score = 0;
  if (seeds >= 10) score += 55;
  else if (seeds >= 4) score += 45;
  else if (seeds >= 1) score += 30;
  else score += 5; // peers only — pieces might still complete, but risky

  // More peers help (swarm activity / piece exchange)
  if (peers >= 20) score += 25;
  else if (peers >= 5) score += 18;
  else if (peers >= 1) score += 10;

  // Actual download movement is the strongest proof of life
  if (downloading) score += 20;

  score = Math.min(100, score);

  let level: HealthLevel;
  let label: string;
  let labelKey: TorrentHealth['labelKey'];
  if (score >= 70) { level = 'healthy'; label = 'Healthy'; labelKey = 'healthy'; }
  else if (score >= 45) { level = 'ok'; label = 'OK'; labelKey = 'ok'; }
  else if (score >= 20) { level = 'weak'; label = 'Weak'; labelKey = 'weak'; }
  else { level = 'dead'; label = 'Poor'; labelKey = 'poor'; }

  const reason = `${seeds} seed${seeds === 1 ? '' : 's'}, ${peers} peer${peers === 1 ? '' : 's'}` +
    (downloading ? ', downloading' : ', stalled');

  return { score, level, label, labelKey, reason };
}
