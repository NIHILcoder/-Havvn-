/**
 * TorrentError lives here (not in manager.ts) so the MAIN process can import and
 * `instanceof`-check it without pulling in manager.ts — which imports WebTorrent.
 * Keeping WebTorrent out of main is the whole point of the utilityProcess split.
 */
export class TorrentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly downloadId?: string,
  ) {
    super(message);
    this.name = 'TorrentError';
  }
}
