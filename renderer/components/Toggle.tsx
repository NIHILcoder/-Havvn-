/**
 * Toggle Component - Modern 2026 Switch
 */

import React from 'react';
import './Toggle.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Visible text next to the switch (also used for aria). */
  label?: string;
  /** Screen-reader-only name — use inside SettingRow, where the row already shows the label. */
  ariaLabel?: string;
  size?: 'small' | 'medium' | 'large';
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  ariaLabel,
  size = 'medium',
}) => {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div className={`toggle-container ${disabled ? 'disabled' : ''}`}>
      <div
        className={`toggle-switch ${size} ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        tabIndex={disabled ? -1 : 0}
      >
        <span className="toggle-slider" />
      </div>
      {label && <span className="toggle-label">{label}</span>}
    </div>
  );
};
