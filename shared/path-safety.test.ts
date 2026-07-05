import { describe, it, expect } from 'vitest';
import { safeBaseName } from './path-safety';

describe('safeBaseName (room path-traversal guard)', () => {
  it('passes a normal filename through unchanged', () => {
    expect(safeBaseName('movie.mkv')).toBe('movie.mkv');
    expect(safeBaseName('My Show S01E01.mp4')).toBe('My Show S01E01.mp4');
  });

  it('strips POSIX traversal to a bare basename', () => {
    expect(safeBaseName('../../../etc/passwd')).toBe('passwd');
    expect(safeBaseName('a/b/c/evil.exe')).toBe('evil.exe');
  });

  it('strips Windows traversal (backslashes) to a bare basename', () => {
    expect(safeBaseName('..\\..\\..\\Startup\\evil.exe')).toBe('evil.exe');
    expect(safeBaseName('C:\\Windows\\System32\\x.dll')).toBe('x.dll');
  });

  it('strips mixed separators', () => {
    expect(safeBaseName('../a\\b/../evil.bin')).toBe('evil.bin');
  });

  it('rejects empty / dot / dotdot as unusable', () => {
    expect(safeBaseName('')).toBe('');
    expect(safeBaseName('.')).toBe('');
    expect(safeBaseName('..')).toBe('');
    expect(safeBaseName('a/..')).toBe('');
  });

  it('tolerates a trailing separator (strips it)', () => {
    expect(safeBaseName('foo/')).toBe('foo');
  });

  it('rejects non-strings', () => {
    expect(safeBaseName(undefined)).toBe('');
    expect(safeBaseName(null)).toBe('');
    expect(safeBaseName(42)).toBe('');
  });

  it('keeps dots INSIDE a name (not a traversal once it has no separators)', () => {
    expect(safeBaseName('my..file.txt')).toBe('my..file.txt');
  });
});
