/**
 * Pop-out window hook — detach a piece of UI into its own OS window.
 *
 * Mirrors the theme editor's proven pattern: window.open('about:blank', <name>)
 * (allowed per-frameName by main.ts setWindowOpenHandler; every child is locked
 * down + closed with the owner there), then the caller `createPortal`s its JSX
 * into `popout.document.body`. The React tree stays in the MAIN window's realm —
 * state, IPC subscriptions and refs keep working; only the DOM moves.
 *
 * Handled here (the fiddly parts):
 * - stylesheet cloning (dev <style> tags AND prod <link>s — hrefs absolutized,
 *   the child's base URL is about:blank where relative hrefs don't resolve);
 * - mirroring the root html attributes (inline token overrides, data-theme,
 *   data-density, data-reduce-motion) via MutationObserver so theming follows;
 * - beforeunload → treat as closed (fires on close AND navigate; a navigated
 *   child keeps the window name but loses the portal DOM, so force-close it);
 * - pagehide/unmount cleanup so a child never outlives its JS context.
 */
import { useEffect, useRef, useState } from 'react';

const MIRROR_ATTRS = ['style', 'data-theme', 'data-density', 'data-reduce-motion'];

export function usePopout(frameName: string, title: string): {
  popout: Window | null;
  openPopout: () => boolean;
  closePopout: () => void;
} {
  const [popout, setPopout] = useState<Window | null>(null);
  const popoutRef = useRef<Window | null>(null);
  useEffect(() => { popoutRef.current = popout; }, [popout]);

  const openPopout = (): boolean => {
    const existing = popoutRef.current;
    if (existing && !existing.closed) { existing.focus(); return true; }
    const w = window.open('about:blank', frameName);
    if (!w) return false; // blocked / denied by the window-open handler
    w.document.title = title;
    for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
      const clone = node.cloneNode(true) as HTMLElement;
      if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
      w.document.head.appendChild(clone);
    }
    const base = w.document.createElement('style');
    base.textContent = 'body { margin: 0; overflow: hidden; background: var(--color-bg-primary); }';
    w.document.head.appendChild(base);
    setPopout(w);
    return true;
  };

  const closePopout = (): void => {
    const w = popoutRef.current;
    popoutRef.current = null;
    setPopout(null);
    if (w && !w.closed) w.close();
  };

  // Never leave an orphan child: React cleanups don't run on unload, so pagehide
  // is needed too (theme-editor precedent).
  useEffect(() => {
    const closeOnUnload = () => { popoutRef.current?.close(); };
    window.addEventListener('pagehide', closeOnUnload);
    return () => {
      window.removeEventListener('pagehide', closeOnUnload);
      popoutRef.current?.close();
    };
  }, []);

  // Theme/token mirroring + user-closed detection.
  useEffect(() => {
    if (!popout) return;
    const src = document.documentElement;
    const sync = () => {
      if (popout.closed) return;
      const dst = popout.document.documentElement;
      for (const a of MIRROR_ATTRS) {
        const v = src.getAttribute(a);
        if (v === null) dst.removeAttribute(a); else dst.setAttribute(a, v);
      }
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(src, { attributes: true, attributeFilter: MIRROR_ATTRS });
    const onGone = () => {
      const w = popoutRef.current;
      popoutRef.current = null;
      setPopout(null);
      // beforeunload also fires on a NAVIGATE (reload): the portal DOM dies with
      // the document and the named window would be reused blank next time.
      setTimeout(() => { try { if (w && !w.closed) w.close(); } catch { /* gone */ } }, 0);
    };
    popout.addEventListener('beforeunload', onGone);
    return () => { mo.disconnect(); popout.removeEventListener('beforeunload', onGone); };
  }, [popout]);

  return { popout, openPopout, closePopout };
}
