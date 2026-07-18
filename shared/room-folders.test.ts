import { describe, it, expect } from 'vitest';
import {
  mergeFolderUpsert, applyFolderDelete, applyAssignment, groupFilesByFolder, groupFilesByHierarchy, sanitizeFolderIcon, FOLDER_ICONS, wantAutoFetch,
} from './room-folders';
import type { RoomFile, RoomFolder } from './types';

const folder = (id: string, at: number, name = id): RoomFolder => ({ id, name, icon: 'folder', color: '#888', at });
const file = (fileId: string, over: Partial<RoomFile> = {}): RoomFile => ({
  fileId, name: fileId, size: 1, infoHash: fileId, magnetURI: `magnet:?xt=urn:btih:${fileId}`,
  addedBy: 'm1', addedByName: 'M', addedAt: 1, ...over,
});

describe('mergeFolderUpsert', () => {
  it('adds a new folder', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, folder('a', 10))).toBe(true);
    expect(folders.get('a')?.at).toBe(10);
  });
  it('keeps the newer edit (LWW), rejects the older', () => {
    const folders = new Map([['a', folder('a', 20, 'new')]]); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, folder('a', 10, 'old'))).toBe(false);
    expect(folders.get('a')?.name).toBe('new');
    expect(mergeFolderUpsert(folders, tombs, folder('a', 30, 'newer'))).toBe(true);
    expect(folders.get('a')?.name).toBe('newer');
  });
  it('stays deleted when the upsert predates the tombstone', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map([['a', 50]]);
    expect(mergeFolderUpsert(folders, tombs, folder('a', 40))).toBe(false);
    expect(folders.has('a')).toBe(false);
  });
  it('revives when the upsert is newer than the tombstone', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map([['a', 50]]);
    expect(mergeFolderUpsert(folders, tombs, folder('a', 60))).toBe(true);
    expect(folders.has('a')).toBe(true);
    expect(tombs.has('a')).toBe(false);
  });
  it('ignores malformed input', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, { id: '', name: 'x', icon: '', color: '', at: 1 })).toBe(false);
    expect(mergeFolderUpsert(folders, tombs, { id: 'a', name: 'x', icon: '', color: '', at: NaN })).toBe(false);
  });
  it('does not clear an existing tombstone when the upsert is rejected as stale', () => {
    // Guards the reorder fix: mutating tombs then returning false would desync
    // the in-memory map from the persisted one.
    const folders = new Map([['a', folder('a', 60)]]); const tombs = new Map([['a', 40]]);
    expect(mergeFolderUpsert(folders, tombs, folder('a', 50))).toBe(false);
    expect(tombs.get('a')).toBe(40); // still there
  });
});

describe('sanitizeFolderIcon', () => {
  it('passes a known icon through', () => {
    for (const ic of FOLDER_ICONS) expect(sanitizeFolderIcon(ic)).toBe(ic);
  });
  it('falls back to folder for unknown / empty / non-string', () => {
    expect(sanitizeFolderIcon('definitely-not-an-icon')).toBe('folder');
    expect(sanitizeFolderIcon('')).toBe('folder');
    expect(sanitizeFolderIcon(undefined)).toBe('folder');
    expect(sanitizeFolderIcon(42)).toBe('folder');
    expect(sanitizeFolderIcon({ evil: true })).toBe('folder');
  });
});

describe('applyFolderDelete', () => {
  it('tombstones and removes a folder', () => {
    const folders = new Map([['a', folder('a', 10)]]); const tombs = new Map<string, number>();
    expect(applyFolderDelete(folders, tombs, 'a', 20)).toBe(true);
    expect(folders.has('a')).toBe(false);
    expect(tombs.get('a')).toBe(20);
  });
  it('a folder edited AFTER the delete survives', () => {
    const folders = new Map([['a', folder('a', 30)]]); const tombs = new Map<string, number>();
    expect(applyFolderDelete(folders, tombs, 'a', 20)).toBe(true); // tombstone still advances
    expect(folders.has('a')).toBe(true);                            // but the newer edit keeps it
  });
  it('is idempotent once tombstoned at/after the time', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map([['a', 50]]);
    expect(applyFolderDelete(folders, tombs, 'a', 40)).toBe(false);
    expect(applyFolderDelete(folders, tombs, 'a', 50)).toBe(false);
  });
});

describe('applyAssignment', () => {
  it('assigns and clears with LWW by folderAt', () => {
    const f = file('x');
    expect(applyAssignment(f, 'a', 10)).toBe(true);
    expect(f.folderId).toBe('a'); expect(f.folderAt).toBe(10);
    expect(applyAssignment(f, 'b', 5)).toBe(false);   // stale
    expect(f.folderId).toBe('a');
    expect(applyAssignment(f, 'b', 20)).toBe(true);
    expect(f.folderId).toBe('b');
  });
  it('null / empty clears to Uncategorized', () => {
    const f = file('x', { folderId: 'a', folderAt: 10 });
    expect(applyAssignment(f, null, 20)).toBe(true);
    expect(f.folderId).toBeUndefined();
    expect(applyAssignment(f, '', 30)).toBe(true);
    expect(f.folderId).toBeUndefined();
  });
  it('rejects an assignment equal to or older than the current clock', () => {
    const f = file('x', { folderId: 'a', folderAt: 20 });
    expect(applyAssignment(f, 'b', 20)).toBe(false);
    expect(applyAssignment(f, 'b', 19)).toBe(false);
  });
});

describe('groupFilesByFolder', () => {
  const folders = [folder('a', 1, 'Movies'), folder('b', 2, 'Music')];
  it('groups by folderId, preserves folder order, keeps empty sections', () => {
    const files = [file('1', { folderId: 'b' }), file('2', { folderId: 'a' })];
    const groups = groupFilesByFolder(files, folders);
    expect(groups.map((g) => g.folder?.id)).toEqual(['a', 'b']); // no uncategorized bucket
    expect(groups[0].files.map((f) => f.fileId)).toEqual(['2']);
    expect(groups[1].files.map((f) => f.fileId)).toEqual(['1']);
  });
  it('unknown / empty folderId lands in an Uncategorized bucket placed last', () => {
    const files = [file('1', { folderId: 'a' }), file('2'), file('3', { folderId: 'ghost' })];
    const groups = groupFilesByFolder(files, folders);
    const last = groups[groups.length - 1];
    expect(last.folder).toBeNull();
    expect(last.files.map((f) => f.fileId)).toEqual(['2', '3']);
  });
  it('no folders → single Uncategorized bucket (or none when empty)', () => {
    expect(groupFilesByFolder([file('1')], [])).toEqual([{ folder: null, files: [expect.objectContaining({ fileId: '1' })] }]);
    expect(groupFilesByFolder([], [])).toEqual([]);
  });
});

describe('wantAutoFetch', () => {
  it('inherits the room toggle when there is no override', () => {
    expect(wantAutoFetch(true, {}, 'a')).toBe(true);
    expect(wantAutoFetch(false, {}, 'a')).toBe(false);
    expect(wantAutoFetch(true, undefined, 'a')).toBe(true);
  });
  it('a per-folder override beats the room toggle both ways', () => {
    expect(wantAutoFetch(true, { a: false }, 'a')).toBe(false);
    expect(wantAutoFetch(false, { a: true }, 'a')).toBe(true);
  });
  it('uncategorized (no folderId) always inherits the room toggle', () => {
    expect(wantAutoFetch(true, { a: false }, undefined)).toBe(true);
    expect(wantAutoFetch(false, { a: true }, null)).toBe(false);
    expect(wantAutoFetch(false, { a: true }, '')).toBe(false);
  });
  it('an override for a DIFFERENT folder does not leak', () => {
    expect(wantAutoFetch(true, { b: false }, 'a')).toBe(true);
    expect(wantAutoFetch(false, { b: true }, 'a')).toBe(false);
  });
  it('only a literal true forces fetching on (garbage-safe)', () => {
    expect(wantAutoFetch(false, { a: 1 as unknown as boolean }, 'a')).toBe(false);
  });
});

// ── 2.23 hierarchy: parentId preserve-semantics, one-hop inheritance, grouping ──

const child = (id: string, at: number, parentId: string, name = id): RoomFolder => ({ ...folder(id, at, name), parentId });

describe('mergeFolderUpsert parentId semantics', () => {
  it('an upsert WITHOUT the property preserves the current placement (legacy edit)', () => {
    const folders = new Map([['a', child('a', 10, 'sec')]]); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, folder('a', 20, 'renamed'))).toBe(true);
    expect(folders.get('a')?.name).toBe('renamed');
    expect(folders.get('a')?.parentId).toBe('sec'); // survived the whole-object LWW
  });
  it('an explicit empty parentId moves the folder to root — stored as EMPTY STRING (JSON-survivable)', () => {
    const folders = new Map([['a', child('a', 10, 'sec')]]); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, { ...folder('a', 20), parentId: '' })).toBe(true);
    expect(folders.get('a')?.parentId).toBe('');
    // The whole point: a JSON round-trip (hello wire / disk) must keep the
    // explicit-root marker, or stale placements could never be corrected.
    const roundTripped = JSON.parse(JSON.stringify(folders.get('a')));
    expect(Object.prototype.hasOwnProperty.call(roundTripped, 'parentId')).toBe(true);
  });
  it('an explicit parentId places the folder', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, child('a', 10, 'sec'))).toBe(true);
    expect(folders.get('a')?.parentId).toBe('sec');
  });
  it('a self-parent is normalized to root (empty string)', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map<string, number>();
    expect(mergeFolderUpsert(folders, tombs, child('a', 10, 'a'))).toBe(true);
    expect(folders.get('a')?.parentId).toBe('');
  });
  it('absent property on a NEW folder stays absent (root)', () => {
    const folders = new Map<string, RoomFolder>(); const tombs = new Map<string, number>();
    mergeFolderUpsert(folders, tombs, folder('a', 10));
    expect(Object.prototype.hasOwnProperty.call(folders.get('a'), 'parentId')).toBe(false);
  });
});

describe('wantAutoFetch one-hop inheritance', () => {
  const parentOf = (m: Record<string, string | undefined>) => (id: string) => m[id];
  it('own override wins over the section override', () => {
    expect(wantAutoFetch(true, { f: false, s: true }, 'f', parentOf({ f: 's' }))).toBe(false);
    expect(wantAutoFetch(false, { f: true, s: false }, 'f', parentOf({ f: 's' }))).toBe(true);
  });
  it('falls back to the section override, then the room toggle', () => {
    expect(wantAutoFetch(true, { s: false }, 'f', parentOf({ f: 's' }))).toBe(false);
    expect(wantAutoFetch(false, { s: true }, 'f', parentOf({ f: 's' }))).toBe(true);
    expect(wantAutoFetch(true, {}, 'f', parentOf({ f: 's' }))).toBe(true);
  });
  it('one hop only — the grand-section override does not apply', () => {
    expect(wantAutoFetch(true, { g: false }, 'f', parentOf({ f: 's', s: 'g' }))).toBe(true);
  });
  it('a self-referential parent cannot loop or apply its own entry twice', () => {
    expect(wantAutoFetch(true, { f: false }, 'f', parentOf({ f: 'f' }))).toBe(false);
    expect(wantAutoFetch(true, {}, 'f', parentOf({ f: 'f' }))).toBe(true);
  });
  it('no resolver behaves exactly like 2.22', () => {
    expect(wantAutoFetch(true, { s: false }, 'f')).toBe(true);
  });
});

describe('groupFilesByHierarchy', () => {
  it('nests children under their sections, uncategorized last', () => {
    const folders = [folder('s1', 1, 'S1'), child('c1', 2, 's1', 'C1'), folder('s2', 3, 'S2')];
    const files = [file('a', { folderId: 's1' }), file('b', { folderId: 'c1' }), file('c'), file('d', { folderId: 's2' })];
    const out = groupFilesByHierarchy(files, folders);
    expect(out.map((g) => g.section?.id ?? null)).toEqual(['s1', 's2', null]);
    expect(out[0].files.map((f) => f.fileId)).toEqual(['a']);
    expect(out[0].children.map((c) => c.folder?.id)).toEqual(['c1']);
    expect(out[0].children[0].files.map((f) => f.fileId)).toEqual(['b']);
    expect(out[2].files.map((f) => f.fileId)).toEqual(['c']);
  });
  it('dangling parentId renders the folder at root', () => {
    const out = groupFilesByHierarchy([], [child('c1', 1, 'ghost')]);
    expect(out.map((g) => g.section?.id)).toEqual(['c1']);
  });
  it('a folder pointing at a NESTED parent flattens to root (one level max)', () => {
    const folders = [folder('top', 1), child('mid', 2, 'top'), child('leaf', 3, 'mid')];
    const out = groupFilesByHierarchy([], folders);
    expect(out.map((g) => g.section?.id)).toEqual(['top', 'leaf']);
    expect(out[0].children.map((c) => c.folder?.id)).toEqual(['mid']);
  });
  it('a two-folder parent cycle degrades both to root', () => {
    const folders = [child('a', 1, 'b'), child('b', 2, 'a')];
    const out = groupFilesByHierarchy([], folders);
    expect(out.map((g) => g.section?.id)).toEqual(['a', 'b']);
    expect(out.every((g) => g.children.length === 0)).toBe(true);
  });
  it('empty sections and empty children stay visible', () => {
    const out = groupFilesByHierarchy([], [folder('s', 1), child('c', 2, 's')]);
    expect(out).toHaveLength(1);
    expect(out[0].children).toHaveLength(1);
    expect(out[0].files).toEqual([]);
    expect(out[0].children[0].files).toEqual([]);
  });
});
