/**
 * StatusBar Component
 * 
 * Footer status bar showing global stats with expandable speed graph.
 */

import React, { useState } from 'react';
import { Icon, SpeedGraph } from '../components';
import { formatSpeed } from '../utils/format-helpers';

interface StatusBarProps {
  totalDownSpeed?: number;
  totalUpSpeed?: number;
  activeDownloads?: number;
  connectedPeers?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  totalDownSpeed = 0,
  totalUpSpeed = 0,
  activeDownloads = 0,
  connectedPeers = 0,
}) => {
  const [showGraph, setShowGraph] = useState(false);

  return (
    <div className="status-bar-container">
      {showGraph && (
        <div className="status-bar-graph">
          <SpeedGraph
            downloadSpeed={totalDownSpeed}
            uploadSpeed={totalUpSpeed}
            height={100}
          />
        </div>
      )}
      <footer className="status-bar">
        <div className="status-bar-section">
          <div className="status-item">
            <span className="status-dot status-dot-connected" />
            <span>Connected</span>
          </div>
          <div className="status-item">
            <Icon name="activity" size={12} />
            <span>{activeDownloads} active</span>
          </div>
          <div className="status-item">
            <Icon name="users" size={12} />
            <span>{connectedPeers} peers</span>
          </div>
        </div>

        <div className="status-bar-section">
          <button
            className="status-graph-btn"
            onClick={() => setShowGraph(!showGraph)}
            title={showGraph ? 'Hide graph' : 'Show speed graph'}
          >
            <Icon name="activity" size={14} />
          </button>
          <div className="status-item status-item-download">
            <Icon name="download" size={12} />
            <span>{formatSpeed(totalDownSpeed)}</span>
          </div>
          <div className="status-item status-item-upload">
            <Icon name="upload" size={12} />
            <span>{formatSpeed(totalUpSpeed)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};


export default StatusBar;
