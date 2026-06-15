// getTorrentManager() returns the main-process proxy; the real TorrentManager +
// WebTorrent run in the torrent-host utilityProcess. TorrentManager is exported as
// a TYPE only (importing its value would pull WebTorrent into the main process).
export type { TorrentManager } from './manager';
export type { TorrentManagerProxy } from './host/manager-proxy';
export { getTorrentManager } from './host/manager-proxy';
export { TorrentError } from './errors';
export { createTorrentFile, getDefaultTrackers, DEFAULT_TRACKERS } from './creator';
