/**
 * Havvn logomark — the "Double-V": the vv of Ha·vv·n drawn as two valleys
 * meeting at a node. Single source of truth for the brand mark; colors ride
 * the accent tokens so it re-skins with the theme.
 */

import React from 'react';

interface LogoMarkProps {
  size?: number;
  /** Render stroke-only in the current text color (for places that tint via CSS). */
  mono?: boolean;
  className?: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({ size = 22, mono = false, className }) => {
  // Below ~18px the thin stroke muddies — thicken it.
  const tiny = size <= 18;
  const stroke = mono ? 'currentColor' : 'var(--color-accent-primary)';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* The node dot was dropped from the mark everywhere (it never made it
          into the .ico, so the brand read inconsistently). Bare Double-V only. */}
      <path
        className="logo-mark-path"
        d="M4 9 L10.5 21 L16 12 L21.5 21 L28 9"
        stroke={stroke}
        strokeWidth={tiny ? 3.2 : 2.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface WordmarkProps {
  className?: string;
}

/** "Havvn" with the double-v picked out in the accent — pairs with LogoMark. */
export const Wordmark: React.FC<WordmarkProps> = ({ className }) => (
  <span className={className}>
    Ha<b style={{ color: 'var(--color-accent-primary)', fontWeight: 'inherit' }}>vv</b>n
  </span>
);

export default LogoMark;
