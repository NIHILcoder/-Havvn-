/**
 * Settings Sidebar - Desktop-native navigation
 * 
 * Fixed sidebar with category groups for Settings page.
 */

import React from 'react';
import { Icon, IconName } from './Icon';
import './SettingsSidebar.css';

export interface SettingsCategory {
  id: string;
  label: string;
  icon: IconName;
  group?: string;
}

interface SettingsSidebarProps {
  categories: SettingsCategory[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  categories,
  activeCategory,
  onCategoryChange,
}) => {
  // Group categories
  const grouped: Record<string, SettingsCategory[]> = {};
  categories.forEach((cat) => {
    const group = cat.group || 'default';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(cat);
  });

  const groupOrder = ['core', 'advanced', 'security', 'appearance', 'system', 'other'];
  const sortedGroups = groupOrder.filter((g) => grouped[g]);

  return (
    <aside className="settings-sidebar">
      <div className="settings-sidebar-inner">
        {sortedGroups.map((groupKey, idx) => (
          <div key={groupKey} className="settings-sidebar-group">
            {grouped[groupKey].map((category) => (
              <button
                key={category.id}
                className={`settings-sidebar-item ${
                  activeCategory === category.id ? 'active' : ''
                }`}
                onClick={() => onCategoryChange(category.id)}
              >
                <Icon name={category.icon} size={16} />
                <span className="settings-sidebar-label">{category.label}</span>
              </button>
            ))}
            {idx < sortedGroups.length - 1 && <div className="settings-sidebar-divider" />}
          </div>
        ))}
      </div>
    </aside>
  );
};
