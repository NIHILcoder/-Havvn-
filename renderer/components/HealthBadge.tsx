import React from 'react';
import { computeTorrentHealth } from '../utils/torrent-health';
import './HealthBadge.css';

interface HealthBadgeProps {
  status: string;
  seeds: number;
  peers: number;
  downSpeedBps: number;
  progress: number;
  /** 'dot' = just the coloured dot (compact rows); 'full' = dot + label */
  variant?: 'dot' | 'full';
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({
  status, seeds, peers, downSpeedBps, progress, variant = 'full',
}) => {
  const health = computeTorrentHealth({ status, seeds, peers, downSpeedBps, progress });

  // Don't show a health pill for states where it's meaningless
  if (health.level === 'unknown') return null;

  const title = `Health: ${health.label} (${health.score}/100) — ${health.reason}`;

  return (
    <span className={`health-badge health-${health.level} ${variant === 'dot' ? 'health-dot-only' : ''}`} title={title}>
      <span className="health-dot" />
      {variant === 'full' && <span className="health-label">{health.label}</span>}
    </span>
  );
};
