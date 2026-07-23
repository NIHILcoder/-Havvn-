/**
 * Custom HUD title bar for the frameless window (main.ts sets frame:false on
 * Win/Linux, hiddenInset on macOS). Draws the brand lockup on a draggable bar and
 * drives minimize/maximize/close over IPC — replacing the OS caption so the app
 * owns its whole chrome (no accent-coloured native frame).
 */
import React, { useEffect, useState } from 'react';
import { LogoMark, Wordmark } from '../components';

// macOS keeps its native traffic lights (hiddenInset), so we don't draw our own
// controls there — just reserve room for them on the left.
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');

export const TitleBar: React.FC = () => {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const w = window.api?.win;
    if (!w) return;
    w.isMaximized().then(setMaximized).catch(() => { /* ignore */ });
    return w.onMaximizeChange(setMaximized);
  }, []);

  const w = window.api?.win;

  return (
    <div className={`titlebar${isMac ? ' titlebar--mac' : ''}`}>
      <div className="titlebar-brand" aria-hidden="true">
        <LogoMark size={19} />
        <Wordmark height={12} className="titlebar-wm" />
      </div>
      {/* The flexible middle IS the drag handle; double-click toggles maximize. */}
      <div className="titlebar-drag" onDoubleClick={() => w?.toggleMaximize()} />
      {!isMac && (
        <div className="titlebar-controls">
          <button type="button" className="tb-ctrl" onClick={() => w?.minimize()} aria-label="Свернуть" title="Свернуть">
            <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1" y="5" width="9" height="1" fill="currentColor" /></svg>
          </button>
          <button type="button" className="tb-ctrl" onClick={() => w?.toggleMaximize()} aria-label={maximized ? 'Восстановить' : 'Развернуть'} title={maximized ? 'Восстановить' : 'Развернуть'}>
            {maximized ? (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1"><rect x="1.5" y="3.5" width="6" height="6" /><path d="M3.5 3.5V1.5h6v6h-2" /></svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1"><rect x="1.5" y="1.5" width="8" height="8" /></svg>
            )}
          </button>
          <button type="button" className="tb-ctrl tb-close" onClick={() => w?.close()} aria-label="Закрыть" title="Закрыть">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" /></svg>
          </button>
        </div>
      )}
    </div>
  );
};
