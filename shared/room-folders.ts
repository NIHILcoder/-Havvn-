/**
 * Room folders — pure convergence + grouping logic for the optional
 * folder/section overlay on a room's flat file manifest.
 *
 * No Node/Electron imports, so the room engine (hidden-window preload) and the
 * renderer both use it, and vitest runs it directly. Convergence is
 * last-writer-wins by an explicit `at` clock, mirroring the file tombstone
 * model in room-engine.ts (applyTombstone) — a room with no folders behaves
 * exactly as before, and a peer that strips the new fields degrades to the flat
 * list rather than breaking.
 */

import type { RoomFile, RoomFolder } from './types';

/**
 * Apply an incoming folder create/edit with last-writer-wins by `at`, honoring a
 * later tombstone. Mutates `folders`/`tombs` in place; returns true if anything
 * changed (so the caller can decide whether to push/persist).
 */
export function mergeFolderUpsert(
  folders: Map<string, RoomFolder>,
  tombs: Map<string, number>,
  incoming: RoomFolder,
): boolean {
  if (!incoming || !incoming.id || !Number.isFinite(incoming.at)) return false;
  const deletedAt = tombs.get(incoming.id) ?? 0;
  if (deletedAt >= incoming.at) return false;      // deleted at/after this edit — stays gone
  if (deletedAt) tombs.delete(incoming.id);        // re-created after a deletion — revive
  const cur = folders.get(incoming.id);
  if (cur && cur.at >= incoming.at) return false;  // we already hold a newer/equal edit
  folders.set(incoming.id, { ...incoming });
  return true;
}

/**
 * Tombstone a folder with last-writer-wins by `at`. Files that pointed at it are
 * left untouched — their now-dangling folderId resolves to Uncategorized via
 * groupFilesByFolder, so no per-file reassignment gossip is needed. A folder
 * edited AFTER this delete (cur.at > at) survives (the edit wins). Mutates in
 * place; returns true if anything changed.
 */
export function applyFolderDelete(
  folders: Map<string, RoomFolder>,
  tombs: Map<string, number>,
  id: string,
  at: number,
): boolean {
  if (!id || !Number.isFinite(at)) return false;
  const prevTomb = tombs.get(id) ?? 0;
  const nextTomb = Math.max(prevTomb, at);
  const cur = folders.get(id);
  const removes = !!cur && cur.at <= at;
  if (nextTomb === prevTomb && !removes) return false;
  tombs.set(id, nextTomb);
  if (removes) folders.delete(id);
  return true;
}

/**
 * Assign a file to a folder (or clear it) with last-writer-wins by `folderAt`.
 * `folderId` null / '' / undefined all mean Uncategorized. Mutates `file`;
 * returns true if the assignment advanced (a newer one already won → false).
 */
export function applyAssignment(
  file: RoomFile,
  folderId: string | null | undefined,
  at: number,
): boolean {
  if (!file || !Number.isFinite(at) || at <= (file.folderAt ?? 0)) return false;
  file.folderId = folderId || undefined;
  file.folderAt = at;
  return true;
}

export interface FolderGroup {
  folder: RoomFolder | null;   // null = the Uncategorized bucket
  files: RoomFile[];
}

/**
 * Group files under the given folders (folder order preserved) with an
 * Uncategorized bucket LAST for files whose folderId is empty or resolves to no
 * live folder. Pure — the renderer maps the result into sections. Folders with
 * no files are still returned (empty sections stay visible so pre-created
 * structure doesn't vanish).
 */
export function groupFilesByFolder(files: RoomFile[], folders: RoomFolder[]): FolderGroup[] {
  const buckets = new Map<string, RoomFile[]>();
  for (const f of folders) buckets.set(f.id, []);
  const uncategorized: RoomFile[] = [];
  for (const file of files) {
    const fid = file.folderId;
    const bucket = fid ? buckets.get(fid) : undefined;
    if (bucket) bucket.push(file);
    else uncategorized.push(file);
  }
  const out: FolderGroup[] = folders.map((f) => ({ folder: f, files: buckets.get(f.id) as RoomFile[] }));
  if (uncategorized.length) out.push({ folder: null, files: uncategorized });
  return out;
}
