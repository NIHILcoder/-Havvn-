/**
 * Single source of truth for WebRTC ICE servers (share links, rooms,
 * remote cast). Previously each module carried its own copy.
 *
 * STUN reveals each peer's public address (enough for most home NATs) and is
 * privacy-neutral. TURN relays the (encrypted) traffic through a third-party
 * server so peers behind symmetric NAT can still connect — that third party
 * then sees both IPs, so TURN is opt-out via the "Use TURN relays" setting.
 *
 * NOTE: the openrelay.metered.ca free TURN project has been unreliable /
 * possibly discontinued for a while. Entries are kept (harmless if dead —
 * ICE just falls back to STUN), but for dependable cross-NAT connectivity a
 * self-hosted coturn or a metered.ca account key is the real fix.
 *
 * Keep in sync with the receiver pages (docs/share/index.html,
 * docs/watch/index.html) — those run in the browser and can't import this.
 */

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export const STUN_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export const TURN_SERVERS: IceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];
