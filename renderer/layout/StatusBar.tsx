/**
 * StatusBar Component
 * 
 * Footer status bar showing global stats with expandable speed graph.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, SpeedGraph } from '../components';
import { formatSpeed } from '../utils/i18n-helpers';

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
  const { t, i18n } = useTranslation();
  const [showGraph, setShowGraph] = useState(false);

  const languageFlags: Record<string, string> = {
    en: '🇬🇧',
    ru: '🇷🇺',
    zh: '🇨🇳',
  };

  const cycleLanguage = () => {
    const languages = ['en', 'ru', 'zh'];
    const currentIndex = languages.indexOf(i18n.language);
    const nextIndex = (currentIndex + 1) % languages.length;
    i18n.changeLanguage(languages[nextIndex]);
  };

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
            <span>{t('statusBar.connected', 'Connected')}</span>
          </div>
          <div className="status-item">
            <Icon name="activity" size={12} />
            <span>{activeDownloads} {t('statusBar.active', 'active')}</span>
          </div>
          <div className="status-item">
            <Icon name="users" size={12} />
            <span>{connectedPeers} {t('statusBar.peers', 'peers')}</span>
          </div>
        </div>

        <div className="status-bar-section">
          <button
            className="status-graph-btn"
            onClick={() => setShowGraph(!showGraph)}
            title={showGraph ? t('statusBar.hideGraph', 'Hide graph') : t('statusBar.showGraph', 'Show speed graph')}
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
          <button
            className="status-language-btn"
            onClick={cycleLanguage}
            title={t('settings.language', 'Language')}
          >
            <span className="status-language-flag">
              {languageFlags[i18n.language] || '🌐'}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};


export default StatusBar;
