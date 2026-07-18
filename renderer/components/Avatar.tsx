/**
 * Avatar — a member's face: their custom uploaded image when they have one
 * (a capped data: URL carried by the signed 'profile' gossip), otherwise the
 * deterministic Identicon. Same box/ring/online-dot chrome as Identicon so the
 * two are interchangeable at every call site.
 *
 * The data URL is re-validated here (defense-in-depth — the engine clamps
 * inbound gossip with the same shared rules) so a malformed value can never
 * reach the <img> src.
 */
import React, { useMemo } from 'react';
import Identicon from './Identicon';
import { sanitizeProfileImg } from '../../shared/profile';

interface AvatarProps {
  seed: string;
  img?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
  className?: string;
  title?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ seed, img, size = 40, online, ring, className, title }) => {
  // Full shared validation (format + size + declared-dimension cap) — memoized,
  // it base64-decodes the payload once per distinct image string.
  const valid = useMemo(() => !!img && sanitizeProfileImg(img) === img, [img]);
  if (!valid) return <Identicon seed={seed} size={size} online={online} ring={ring} className={className} title={title} />;
  const dot = Math.max(7, Math.round(size * 0.22));
  return (
    <span
      className={`identicon${ring ? ' identicon-ring' : ''}${className ? ' ' + className : ''}`}
      style={{ width: size, height: size }}
      title={title}
    >
      <img
        className="avatar-img"
        src={img}
        width={size}
        height={size}
        alt={title || ''}
        draggable={false}
        style={{ borderRadius: Math.round(size * 0.28) }}
      />
      {online !== undefined && (
        <span className={`identicon-status ${online ? 'online' : 'offline'}`} style={{ width: dot, height: dot }} aria-hidden="true" />
      )}
    </span>
  );
};

export default Avatar;
