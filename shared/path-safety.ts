/**
 * Path-safety helpers shared across processes.
 *
 * These exist because several code paths take an UNTRUSTED, peer-supplied name
 * (a room member's file name, a torrent's internal name) and feed it to
 * path.join(baseDir, name) before writing bytes there. path.join normalizes
 * '..', so a name like `..\\..\\..\\Startup\\evil.exe` escapes baseDir and gives
 * an arbitrary-file-write. Reducing the name to a bare basename removes any
 * directory component and closes that.
 */
import path from 'path';

/**
 * Reduce an untrusted filename to a bare, traversal-free basename.
 * path.win32.basename treats BOTH '/' and '\\' as separators on every OS, so a
 * mixed-separator payload can't sneak a directory component through. Returns ''
 * for non-strings and for empty / '.' / '..' (callers should treat '' as "no
 * usable name" and reject the entry rather than writing to the bare base dir).
 */
export function safeBaseName(name: unknown): string {
  if (typeof name !== 'string' || !name) return '';
  const base = path.win32.basename(name);
  if (!base || base === '.' || base === '..') return '';
  return base;
}
