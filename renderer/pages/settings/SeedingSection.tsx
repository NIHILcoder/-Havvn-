/**
 * Settings → Seeding section.
 *
 * Extracted verbatim from SettingsPage's renderSeedingSettings(): the two
 * default seeding-limit inputs (ratio / time) plus the summary info box. The
 * shared renderSettingItem helper and the two numeric states + setters are
 * passed in as props; behaviour is identical. Relies on the global
 * SettingsPage.css.
 */

import React from 'react';
import { Icon } from '../../components';
import { useTranslation } from '../../utils/i18nContext';

interface SeedingSectionProps {
  renderSettingItem: (
    label: string,
    description: string,
    control: React.ReactNode,
    icon?: React.ReactNode
  ) => React.ReactNode;
  defaultSeedRatioLimit: number;
  setDefaultSeedRatioLimit: (v: number) => void;
  defaultSeedTimeLimitMinutes: number;
  setDefaultSeedTimeLimitMinutes: (v: number) => void;
}

export const SeedingSection: React.FC<SeedingSectionProps> = ({
  renderSettingItem,
  defaultSeedRatioLimit,
  setDefaultSeedRatioLimit,
  defaultSeedTimeLimitMinutes,
  setDefaultSeedTimeLimitMinutes,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="settings-category-header">
        <h1 className="settings-category-title">{t('settings.hdr.seeding')}</h1>
        <p className="settings-category-subtitle">{t('settings.sub.seeding')}</p>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">{t('settings.grp.seedingLimits')}</h3>
        <p className="settings-group-desc">
          {t('settings.seedGlobalNote')}
        </p>

        {renderSettingItem(
          t('settings.seedRatio'),
          t('settings.seedRatio.desc'),
          <div className="speed-input-compact">
            <input
              type="number"
              className="input-compact input-mono"
              min="0"
              step="0.1"
              placeholder="0"
              value={defaultSeedRatioLimit}
              onChange={e => setDefaultSeedRatioLimit(parseFloat(e.target.value) || 0)}
            />
            <span className="input-unit">{t('settings.unit.ratio')}</span>
          </div>
        )}

        {renderSettingItem(
          t('settings.seedTime'),
          t('settings.seedTime.desc'),
          <div className="speed-input-compact">
            <input
              type="number"
              className="input-compact input-mono"
              min="0"
              step="5"
              placeholder="0"
              value={defaultSeedTimeLimitMinutes}
              onChange={e => setDefaultSeedTimeLimitMinutes(parseInt(e.target.value) || 0)}
            />
            <span className="input-unit">{t('settings.unit.min')}</span>
          </div>
        )}

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
      </div>
    </>
  );
};
