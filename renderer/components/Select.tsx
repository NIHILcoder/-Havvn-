import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../utils/i18nContext';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  // Open upward when the trigger sits near the bottom of the window, so the
  // menu is never clipped by the viewport or a scroll container's edge.
  const [dropUp, setDropUp] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const openMenu = () => {
    const el = selectRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const menuH = Math.min(options.length, 6) * 40 + 16; // rough menu height
      const below = window.innerHeight - r.bottom;
      setDropUp(below < menuH && r.top > below);
    }
    setIsOpen(true);
  };

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) setIsOpen(false); else openMenu();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      
      const currentIndex = options.findIndex((opt) => opt.value === value);
      let nextIndex = currentIndex;
      
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      }
      
      onChange(options[nextIndex].value);
    }
  };

  return (
    <div 
      className={`custom-select-container ${className} ${disabled ? 'disabled' : ''}`} 
      ref={selectRef}
    >
      <div
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => { if (!disabled) { if (isOpen) setIsOpen(false); else openMenu(); } }}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="custom-select-value">
          {selectedOption ? (
            <>
              {selectedOption.icon && <Icon name={selectedOption.icon as any} size={16} />}
              <span>{selectedOption.label}</span>
            </>
          ) : (
            <span className="placeholder">{placeholder ?? t('select.placeholder')}</span>
          )}
        </div>
        <div className="custom-select-icon">
          <Icon name="chevron-down" size={16} />
        </div>
      </div>

      {isOpen && (
        <div className={`custom-select-dropdown${dropUp ? ' drop-up' : ''}`}>
          <ul role="listbox" className="custom-select-list">
            {options.map((option) => (
              <li
                key={option.value}
                className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={option.value === value}
              >
                {option.icon && <Icon name={option.icon as any} size={16} />}
                <span>{option.label}</span>
                {option.value === value && (
                  <div className="custom-select-check">
                    <Icon name="check" size={14} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
