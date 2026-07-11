/**
 * Settings → System section (new card-based layout).
 *
 * Ports renderSystemSettings() from the old SettingsPage monolith: the
 * default-client row, check-for-updates / restart-and-install row, clear
 * cache, and export/import settings — reading everything from useSettings()
 * and rendered on the shared SettingsCard/SettingRow primitives.
 */

import React from 'react';
import { useSettings } from '../SettingsContext';
import { SettingsCard, SettingRow, StatusPill } from '../controls';
import { Button, Icon, Select } from '../../../components';
import { useTranslation } from '../../../utils/i18nContext';

export const SystemSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    isDefaultClient, handleSetDefaultClient,
    updateReady, handleCheckForUpdates,
    handleClearCache, clearingCache,
    handleExportSettings, handleImportSettings,
    settings, setSettings,
  } = useSettings();

  const updateChannel = settings?.updateChannel ?? 'stable';

  // Instant-apply, optimistic — mirrors selectDohTemplate in SettingsContext.
  const selectUpdateChannel = async (next: 'stable' | 'beta') => {
    if (next === updateChannel) return;
    setSettings(prev => (prev ? { ...prev, updateChannel: next } : prev));
    try { await window.api.updateSettings({ updateChannel: next }); }
    catch (err) { console.error('Failed to set update channel:', err); }
  };

  return (
    <>
      <SettingsCard title={t('settings.grp.osIntegration')} icon="monitor">
        <SettingRow
          label={t('settings.defaultClient')}
          description={t('settings.defaultClient.desc')}
          control={
            isDefaultClient ? (
              <StatusPill tone="ok">
                <Icon name="check-circle" size={14} />
                {t('settings.currentDefault')}
              </StatusPill>
            ) : (
              <Button variant="secondary" onClick={handleSetDefaultClient}>
                {t('settings.setDefault')}
              </Button>
            )
          }
        />
      </SettingsCard>

      <SettingsCard title={t('settings.grp.updates')} icon="refresh-cw">
        <SettingRow
          label={t('settings.updateChannel')}
          description={t('settings.updateChannel.desc')}
          control={
            <div style={{ width: 150 }}>
              <Select
                options={[
                  { value: 'stable', label: t('settings.updateChannel.stable') },
                  { value: 'beta', label: t('settings.updateChannel.beta') },
                ]}
                value={updateChannel}
                onChange={(v) => selectUpdateChannel(v as 'stable' | 'beta')}
              />
            </div>
          }
        />
        <SettingRow
          label={updateReady ? t('settings.updateReady') : t('settings.checkUpdates')}
          description={
            updateReady
              ? `${t('settings.versionWord')} ${updateReady} ${t('settings.downloadedRestart')}`
              : t('settings.checkUpdatesDesc')
          }
          control={
            updateReady ? (
              <Button
                variant="primary"
                icon={<Icon name="refresh" size={16} />}
                onClick={() => window.api.quitAndInstallUpdate()}
              >
                {t('settings.restartInstall')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={handleCheckForUpdates}>
                {t('settings.checkNow')}
              </Button>
            )
          }
        />
      </SettingsCard>

      <SettingsCard title={t('settings.grp.maintenance')} icon="database">
        <SettingRow
          label={t('settings.clearCache')}
          description={t('settings.clearCache.desc')}
          control={
            <Button
              variant="secondary"
              icon={<Icon name="trash" size={16} />}
              onClick={handleClearCache}
              loading={clearingCache}
              disabled={clearingCache}
            >
              {t('settings.clear')}
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title={t('settings.grp.backup')} icon="archive">
        <SettingRow
          label={t('settings.exportSettings')}
          description={t('settings.exportSettings.desc')}
          control={
            <Button variant="secondary" onClick={handleExportSettings}>
              {t('settings.export')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.importSettings')}
          description={t('settings.importSettings.desc')}
          control={
            <Button variant="secondary" onClick={handleImportSettings}>
              {t('settings.import')}
            </Button>
          }
        />
      </SettingsCard>
    </>
  );
};
