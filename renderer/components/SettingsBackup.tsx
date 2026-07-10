import React from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../utils/i18nContext';
import './SettingsBackup.css';

interface SettingsBackupProps {
  onExport: () => void;
  onImport: () => void;
}

export const SettingsBackup: React.FC<SettingsBackupProps> = ({ onExport, onImport }) => {
  const { t } = useTranslation();
  return (
    <div className="settings-backup">
      <div className="backup-card">
        <div className="backup-icon">
          <Icon name="upload-cloud" size={32} />
        </div>
        <div className="backup-info">
          <h3>{t('settings.exportSettings')}</h3>
          <p>{t('settings.backup.exportDesc')}</p>
        </div>
        <button className="btn-backup" onClick={onExport}>
          <Icon name="upload" size={16} />
          {t('settings.export')}
        </button>
      </div>

      <div className="backup-card">
        <div className="backup-icon">
          <Icon name="download-cloud" size={32} />
        </div>
        <div className="backup-info">
          <h3>{t('settings.importSettings')}</h3>
          <p>{t('settings.backup.importDesc')}</p>
        </div>
        <button className="btn-backup secondary" onClick={onImport}>
          <Icon name="download" size={16} />
          {t('settings.import')}
        </button>
      </div>

      <div className="backup-notice">
        <Icon name="info" size={16} />
        <span>
          {t('settings.backup.notice')}
        </span>
      </div>
    </div>
  );
};
