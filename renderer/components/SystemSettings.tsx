import React from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../utils/i18nContext';
import './SystemSettings.css';

interface SystemSettingsProps {
  autoLaunch: boolean;
  autoUpdate: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  onAutoLaunchChange: (enabled: boolean) => void;
  onAutoUpdateChange: (enabled: boolean) => void;
  onMinimizeToTrayChange: (enabled: boolean) => void;
  onCloseToTrayChange: (enabled: boolean) => void;
  isDefaultClient: boolean;
  onSetDefaultClient: () => void;
  onCheckForUpdates: () => void;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  autoLaunch,
  autoUpdate,
  minimizeToTray,
  closeToTray,
  onAutoLaunchChange,
  onAutoUpdateChange,
  onMinimizeToTrayChange,
  onCloseToTrayChange,
  isDefaultClient,
  onSetDefaultClient,
  onCheckForUpdates,
}) => {
  const { t } = useTranslation();
  return (
    <div className="system-settings">
      <div className="setting-item">
        <div className="setting-info">
          <label className="setting-label">
            <Icon name="power" size={16} />
            {t('settings.autoLaunchWin')}
          </label>
          <p className="setting-description">
            {t('settings.autoLaunchWin.desc')}
          </p>
        </div>
        <div className="setting-control">
          <button
            className={`toggle-switch ${autoLaunch ? 'active' : ''}`}
            onClick={() => onAutoLaunchChange(!autoLaunch)}
          >
            <span className="toggle-slider" />
          </button>
        </div>
      </div>

      <div className="setting-divider" />

      <div className="setting-item">
        <div className="setting-info">
          <label className="setting-label">
            <Icon name="download-cloud" size={16} />
            {t('settings.autoUpdates')}
          </label>
          <p className="setting-description">
            {t('settings.autoUpdates.desc')}
          </p>
        </div>
        <div className="setting-control">
          <button
            className={`toggle-switch ${autoUpdate ? 'active' : ''}`}
            onClick={() => onAutoUpdateChange(!autoUpdate)}
          >
            <span className="toggle-slider" />
          </button>
        </div>
      </div>

      <div className="setting-divider" />

      <div className="setting-item">
        <div className="setting-info">
          <label className="setting-label">{t('settings.minTray')}</label>
          <p className="setting-description">
            {t('settings.minToTray.desc')}
          </p>
        </div>
        <div className="setting-control">
          <button
            className={`toggle-switch ${minimizeToTray ? 'active' : ''}`}
            onClick={() => onMinimizeToTrayChange(!minimizeToTray)}
          >
            <span className="toggle-slider" />
          </button>
        </div>
      </div>

      <div className="setting-divider" />

      <div className="setting-item">
        <div className="setting-info">
          <label className="setting-label">{t('settings.closeTray')}</label>
          <p className="setting-description">
            {t('settings.closeToTray.desc')}
          </p>
        </div>
        <div className="setting-control">
          <button
            className={`toggle-switch ${closeToTray ? 'active' : ''}`}
            onClick={() => onCloseToTrayChange(!closeToTray)}
          >
            <span className="toggle-slider" />
          </button>
        </div>
      </div>

      <div className="setting-divider" />

      <div className="setting-item">
        <div className="setting-info">
          <label className="setting-label">
            <Icon name="link" size={16} />
            {t('settings.defaultClient')}
          </label>
          <p className="setting-description">
            {t('settings.defaultClient.desc')}
          </p>
        </div>
        <div className="setting-control">
          {isDefaultClient ? (
            <span className="status-badge success" style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
              <Icon name="check-circle" size={14} />
              {t('settings.currentDefault')}
            </span>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={onSetDefaultClient}>
              {t('settings.setDefault')}
            </button>
          )}
        </div>
      </div>

      <div className="setting-divider" />

      <div className="update-check">
        <button className="btn-check-updates" onClick={onCheckForUpdates}>
          <Icon name="refresh-cw" size={16} />
          {t('settings.checkUpdates')}
        </button>
        <p className="update-info">{t('settings.lastChecked')}</p>
      </div>
    </div>
  );
};
