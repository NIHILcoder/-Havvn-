/**
 * Chat message formatting — splits a message body into text and fenced-code
 * segments. Pure and dependency-free so it unit-tests without a DOM and could be
 * reused by the engine (e.g. notification previews) if ever needed.
 *
 * Supported syntax: triple-backtick fences on their own lines:
 *   ```
 *   code here
 *   ```
 * An optional language tag after the opening fence (```bat) is accepted and
 * DISCARDED (no highlighting — the tag just must not leak into the code body).
 * An unclosed fence swallows the rest of the message as code (forgiving — people
 * forget the closing fence). Everything else renders as plain text; whitespace
 * preservation is the renderer's job (white-space: pre-wrap).
 */

export type ChatSegment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string };

export function parseChatSegments(body: string): ChatSegment[] {
  const src = String(body ?? '');
  if (!src.includes('```')) return src ? [{ kind: 'text', text: src }] : [];
  const segments: ChatSegment[] = [];
  const lines = src.split('\n');
  let buf: string[] = [];
  let inCode = false;
  const flush = (kind: 'text' | 'code') => {
    const text = buf.join('\n');
    buf = [];
    // Drop empty TEXT runs (an empty line between two fences); keep empty code
    // blocks out too — an empty fence pair renders as nothing.
    if (text.trim() || (kind === 'code' && text)) segments.push({ kind, text });
  };
  for (const line of lines) {
    // A fence line: ``` optionally followed by a language tag (no spaces inside).
    if (/^```[^`]*$/.test(line.trim())) {
      flush(inCode ? 'code' : 'text');
      inCode = !inCode;
      continue;
    }
    buf.push(line);
  }
  flush(inCode ? 'code' : 'text'); // unclosed fence → rest is code
  // Everything was stripped (a body of bare fences like '```') — fall back to the
  // raw text so the message never renders as an empty bubble.
  if (segments.length === 0) return [{ kind: 'text', text: src }];
  return segments;
}

/** True when the message benefits from a copy button (code or multiline). */
export function isCopyworthy(body: string): boolean {
  const s = String(body ?? '');
  return s.includes('```') || s.includes('\n');
}
