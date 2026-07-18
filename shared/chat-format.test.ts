import { describe, it, expect } from 'vitest';
import { parseChatSegments, isCopyworthy } from './chat-format';

describe('parseChatSegments', () => {
  it('plain text passes through as one segment', () => {
    expect(parseChatSegments('hello world')).toEqual([{ kind: 'text', text: 'hello world' }]);
  });

  it('empty input yields no segments', () => {
    expect(parseChatSegments('')).toEqual([]);
  });

  it('splits a fenced block with surrounding text', () => {
    expect(parseChatSegments('look:\n```\necho hi\n```\ndone')).toEqual([
      { kind: 'text', text: 'look:' },
      { kind: 'code', text: 'echo hi' },
      { kind: 'text', text: 'done' },
    ]);
  });

  it('discards a language tag on the opening fence', () => {
    expect(parseChatSegments('```bat\n@echo off\n```')).toEqual([
      { kind: 'code', text: '@echo off' },
    ]);
  });

  it('an unclosed fence swallows the rest as code', () => {
    expect(parseChatSegments('intro\n```\ncd /d "%~dp0"\nstart me3.exe')).toEqual([
      { kind: 'text', text: 'intro' },
      { kind: 'code', text: 'cd /d "%~dp0"\nstart me3.exe' },
    ]);
  });

  it('preserves tabs and indentation inside code', () => {
    const code = '\tif exist ".\\SeamlessCoop\\ersc.dll" (\n\t\techo hi\n\t)';
    expect(parseChatSegments('```\n' + code + '\n```')).toEqual([{ kind: 'code', text: code }]);
  });

  it('handles multiple fences and drops empty in-between runs', () => {
    expect(parseChatSegments('```\na\n```\n\n```\nb\n```')).toEqual([
      { kind: 'code', text: 'a' },
      { kind: 'code', text: 'b' },
    ]);
  });

  it('keeps an empty code fence out of the output', () => {
    expect(parseChatSegments('x\n```\n```\ny')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'text', text: 'y' },
    ]);
  });

  it('a body of bare fences falls back to raw text (never an empty bubble)', () => {
    expect(parseChatSegments('```')).toEqual([{ kind: 'text', text: '```' }]);
    expect(parseChatSegments('```\n```')).toEqual([{ kind: 'text', text: '```\n```' }]);
  });
});

describe('isCopyworthy', () => {
  it('true for fences and multiline, false for one-liners', () => {
    expect(isCopyworthy('```\nx\n```')).toBe(true);
    expect(isCopyworthy('line1\nline2')).toBe(true);
    expect(isCopyworthy('short message')).toBe(false);
  });
});
