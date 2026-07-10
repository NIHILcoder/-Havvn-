/**
 * Settings navigation rail — grouped sections with a live search that filters by
 * label + keywords, so you can find a setting without knowing its tab.
 */
import React, { useState } from 'react';
import { Icon, LogoMark } from '../../components';
import { useTranslation } from '../../utils/i18nContext';
import { SETTINGS_GROUPS, SETTINGS_NAV } from './nav';
import './SettingsNav.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TKey = any;

export const SettingsNav: React.FC<{
  active: string;
  onSelect: (id: string) => void;
}> = ({ active, onSelect }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const matches = (id: string, keywords: string) => {
    if (!query) return true;
    return t(`settings.${id}` as TKey).toLowerCase().includes(query) || keywords.toLowerCase().includes(query);
  };
  const visible = SETTINGS_NAV.filter((i) => matches(i.id, i.keywords));

  return (
    <aside className="stg-nav">
      <div className="stg-nav-head">
        <LogoMark size={24} />
        <h2>{t('nav.settings')}</h2>
      </div>

      <div className="stg-nav-search">
        <Icon name="search" size={14} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.searchPlaceholder')}
        />
        {q && (
          <button className="stg-nav-clear" onClick={() => setQ('')} aria-label={t('common.close')}>
            <Icon name="x" size={13} />
          </button>
        )}
      </div>

      <nav className="stg-nav-list">
        {!visible.length && <p className="stg-nav-empty">{t('settings.searchEmpty')}</p>}
        {SETTINGS_GROUPS.map((g) => {
          const items = visible.filter((i) => i.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="stg-nav-grp">
              <div className="stg-nav-grp-h">{t(`settings.group.${g}` as TKey)}</div>
              {items.map((item) => (
                <button
                  key={item.id}
                  className={`stg-nav-item${active === item.id ? ' on' : ''}`}
                  onClick={() => onSelect(item.id)}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="stg-nav-item-label">{t(`settings.${item.id}` as TKey)}</span>
                  {active === item.id && <span className="stg-nav-dot" />}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};
