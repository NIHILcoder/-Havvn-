/**
 * Settings → Seeding section.
 *
 * Two cards:
 *  1. Default seeding limits (ratio / time NumberFields) with the conditional
 *     "seeding will stop when…" summary and a compact note that per-torrent
 *     overrides live in the download context menu.
 *  2. "Now seeding" — a live snapshot built from window.api.getDownloads():
 *     active-seed count, total uploaded, overall ratio, plus a refresh button.
 *     Guards for the stubbed api (undefined result → zeros everywhere).
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { Download } from '../../../../shared/types';
import { useSettings } from '../SettingsContext';
import { SettingsCard, SettingRow, NumberField, StatusPill } from '../controls';
import { Icon } from '../../../components';
import { useTranslation } from '../../../utils/i18nContext';
import { formatBytes } from '../../../utils/format-helpers';

export const SeedingSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    defaultSeedRatioLimit, setDefaultSeedRatioLimit,
    defaultSeedTimeLimitMinutes, setDefaultSeedTimeLimitMinutes,
  } = useSettings();

  const [downloads, setDownloads] = useState<Download[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDownloads = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await window.api.getDownloads();
      setDownloads(Array.isArray(list) ? list : []);
    } catch {
      setDownloads([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);

  // Live stats — all guarded so a stubbed/empty api renders zeros.
  const seedingCount = downloads.filter((d) => d?.status === 'seeding').length;
  const totalUploaded = downloads.reduce((sum, d) => sum + (d?.uploadedBytes || 0), 0);
  const totalDownloaded = downloads.reduce((sum, d) => sum + (d?.downloadedBytes || 0), 0);
  const overallRatio =
    totalDownloaded > 0
      ? (totalUploaded / totalDownloaded).toFixed(2)
      : totalUploaded > 0
        ? '∞'
        : '0.00';

  return (
    <>
      <SettingsCard title={t('settings.grp.seedingLimits')} icon="upload">
        <SettingRow
          label={t('settings.seedRatio')}
          description={t('settings.seedRatio.desc')}
          control={
            <NumberField
              value={defaultSeedRatioLimit}
              onChange={setDefaultSeedRatioLimit}
              unit={t('settings.unit.ratio')}
              min={0}
              step={0.1}
              ariaLabel={t('settings.seedRatio')}
            />
          }
        />

        <SettingRow
          label={t('settings.seedTime')}
          description={t('settings.seedTime.desc')}
          control={
            <NumberField
              value={defaultSeedTimeLimitMinutes}
              onChange={(v) => setDefaultSeedTimeLimitMinutes(Math.round(v))}
              unit={t('settings.unit.min')}
              min={0}
              step={5}
              ariaLabel={t('settings.seedTime')}
            />
          }
        />

        {(defaultSeedRatioLimit > 0 || defaultSeedTimeLimitMinutes > 0) && (
          <div className="setting-info-box">
            <Icon name="info" size={14} />
            <span>
              {t('settings.seedStopWhen')}{' '}
              {defaultSeedRatioLimit > 0 && <><strong>{t('settings.seedRatioReached')} {defaultSeedRatioLimit}</strong></>}
              {defaultSeedRatioLimit > 0 && defaultSeedTimeLimitMinutes > 0 && ` ${t('settings.or')} `}
              {defaultSeedTimeLimitMinutes > 0 && <><strong>{defaultSeedTimeLimitMinutes} {t('settings.seedMinElapsed')}</strong></>}
            </span>
          </div>
        )}

        {/* How limits work: these are global defaults; per-torrent overrides
            live in the download's context menu. */}
        <div className="settings-notice-compact">
          <Icon name="info" size={14} />
          <span>{t('settings.seedGlobalNote')}</span>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('settings.seedNow')}
        icon="activity"
        description={t('settings.seedNow.desc')}
      >
        <SettingRow
          label={t('settings.seedNow.active')}
          description={t('settings.seedNow.active.desc')}
          control={
            <StatusPill tone={seedingCount > 0 ? 'ok' : 'muted'}>
              {seedingCount}
            </StatusPill>
          }
        />

        <SettingRow
          label={t('settings.seedNow.uploaded')}
          description={t('settings.seedNow.uploaded.desc')}
          control={<StatusPill tone="muted">{formatBytes(totalUploaded)}</StatusPill>}
        />

        <SettingRow
          label={t('settings.seedNow.ratio')}
          description={t('settings.seedNow.ratio.desc')}
          control={<StatusPill tone="muted">{overallRatio}</StatusPill>}
        />

        <SettingRow
          label={t('downloads.refresh')}
          description={t('settings.seedNow.refresh.desc')}
          control={
            <button
              className="doh-mini-btn"
              onClick={() => void loadDownloads()}
              disabled={refreshing}
              title={t('downloads.refresh')}
              aria-label={t('downloads.refresh')}
            >
              <Icon name="refresh-cw" size={13} />
            </button>
          }
        />
      </SettingsCard>
    </>
  );
};
