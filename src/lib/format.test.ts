import { describe, it, expect, vi, afterEach } from 'vitest';
import { ago, baseName, sessionLabel, shortPath } from './format';

afterEach(() => { vi.useRealTimers(); });

/** Freezes the clock so elapsed-time assertions are not a race. */
function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('ago', () => {
  it('renders an em dash for an absent timestamp, never "NaN"', () => {
    expect(ago(null)).toBe('—');
  });

  it('counts seconds, then minutes, then hours, then days', () => {
    at('2026-08-28T12:00:00Z');
    expect(ago('2026-08-28T11:59:30Z')).toBe('30 s');
    expect(ago('2026-08-28T11:45:00Z')).toBe('15 min');
    expect(ago('2026-08-28T08:00:00Z')).toBe('4 h');
    expect(ago('2026-08-25T12:00:00Z')).toBe('3 j');
  });

  it('never goes negative on a clock that drifted forward', () => {
    at('2026-08-28T12:00:00Z');
    expect(ago('2026-08-28T12:00:10Z')).toBe('0 s');
  });
});

describe('baseName and shortPath', () => {
  it('reads a Windows path', () => {
    expect(baseName('C:\\Users\\x\\_MNEMOSYNE OS')).toBe('_MNEMOSYNE OS');
  });

  it('reads a POSIX path', () => {
    expect(baseName('/home/x/project')).toBe('project');
  });

  it('is null for an absent path rather than an empty label', () => {
    expect(baseName(null)).toBeNull();
  });

  it('keeps the last two segments of a file path', () => {
    expect(shortPath('C:\\a\\b\\c\\file.ts')).toBe('c/file.ts');
  });
});

describe('sessionLabel', () => {
  it('prefers the real title and says so', () => {
    expect(sessionLabel('Real title', 'first message')).toEqual({
      text: 'Real title', titled: true,
    });
  });

  it('falls back to the first message and marks it as NOT a title', () => {
    const r = sessionLabel(null, 'what the person typed');
    expect(r.text).toBe('what the person typed');
    expect(r.titled).toBe(false);
  });

  it('collapses whitespace in the fallback so a pasted block stays one line', () => {
    expect(sessionLabel(null, 'a\n\n  b').text).toBe('a b');
  });

  it('clips with an ellipsis rather than overflowing the cell', () => {
    const r = sessionLabel('x'.repeat(200), undefined, 20);
    expect(r.text).toHaveLength(20);
    expect(r.text.endsWith('…')).toBe(true);
  });

  it('returns empty when there is neither a title nor a message', () => {
    expect(sessionLabel(null, undefined)).toEqual({ text: '', titled: false });
  });
});
