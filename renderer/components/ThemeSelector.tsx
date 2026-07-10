import React from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../utils/i18nContext';
import './ThemeSelector.css';

type Theme = 'light' | 'dark' | 'system';

interface ThemeSelectorProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  const { t } = useTranslation();
  const themes: { id: Theme; label: string; icon: string }[] = [
    { id: 'light', label: t('theme.light'), icon: '☀️' },
    { id: 'dark', label: t('theme.dark'), icon: '🌙' },
    { id: 'system', label: t('settings.system'), icon: '💻' },
  ];

  return (
    <div className="theme-selector-grid">
      {themes.map((theme) => (
        <button
          key={theme.id}
          className={`theme-card ${currentTheme === theme.id ? 'active' : ''}`}
          onClick={() => onThemeChange(theme.id)}
        >
          <div className="theme-preview">
            <div className={`theme-preview-window ${theme.id}`}>
              <div className="theme-preview-header">
                <div className="theme-preview-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              <div className="theme-preview-body">
                <div className="theme-preview-sidebar">
                  <div className="theme-preview-nav"></div>
                  <div className="theme-preview-nav"></div>
                  <div className="theme-preview-nav active"></div>
                  <div className="theme-preview-nav"></div>
                </div>
                <div className="theme-preview-content">
                  <div className="theme-preview-bar"></div>
                  <div className="theme-preview-card">
                    <div className="theme-preview-line"></div>
                    <div className="theme-preview-line short"></div>
                  </div>
                  <div className="theme-preview-card">
                    <div className="theme-preview-line"></div>
                    <div className="theme-preview-line short"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="theme-info">
            <div className="theme-icon">{theme.icon}</div>
            <div className="theme-label">{theme.label}</div>
          </div>
          {currentTheme === theme.id && (
            <div className="theme-check">
              <Icon name="check" size={16} />
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
