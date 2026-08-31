import { describe, it, expect } from 'vitest';
import { buildKeptBody, vaultChoices, MAX_CONTENT_CHARS } from './keep';

const src = {
  path: 'C:/w/scratch/draft.md',
  sessionTitle: 'Post Reddit Mnemosyne',
  agent: 'Claude Code',
  at: '2026-08-29T10:00:00.000Z',
};

describe('buildKeptBody', () => {
  it('keeps the file text verbatim under a provenance header', () => {
    const out = buildKeptBody(src, 'hello\nworld');
    expect(out.truncated).toBe(false);
    expect(out.originalChars).toBe(11);
    expect(out.content).toContain('File: C:/w/scratch/draft.md');
    expect(out.content).toContain('From: Claude Code — Post Reddit Mnemosyne');
    expect(out.content).toContain('Session last active: 2026-08-29T10:00:00.000Z');
    expect(out.content.endsWith('hello\nworld')).toBe(true);
  });

  it('omits the lines it has no value for, never invents them', () => {
    const out = buildKeptBody({ ...src, sessionTitle: null, at: null }, 'x');
    expect(out.content).toContain('From: Claude Code\n');
    expect(out.content).not.toContain('Session last active');
    expect(out.content).not.toContain('null');
    expect(out.content).not.toContain('undefined');
  });

  it('stays under the host ceiling and SAYS it cut', () => {
    const huge = 'a'.repeat(120_000);
    const out = buildKeptBody(src, huge);
    expect(out.truncated).toBe(true);
    expect(out.originalChars).toBe(120_000);
    expect(out.content.length).toBeLessThanOrEqual(MAX_CONTENT_CHARS);
    expect(out.content).toContain('[cut here: 120000 characters in the file');
  });

  it('does not claim a cut when the file only just fits', () => {
    const out = buildKeptBody(src, 'a'.repeat(1000));
    expect(out.truncated).toBe(false);
    expect(out.content).not.toContain('[cut here');
  });
});

describe('vaultChoices', () => {
  it('reads the status payload and sorts by name', () => {
    const out = vaultChoices({
      vaults: [
        { vaultId: 'WORK', displayName: 'Work', chronicleCount: 12 },
        { vaultId: 'ARCHIVE', displayName: 'Archive', chronicleCount: 4 },
      ],
    });
    expect(out.map(v => v.id)).toEqual(['ARCHIVE', 'WORK']);
  });

  it('drops a vault with no id: an option that fails when pressed', () => {
    expect(vaultChoices({ vaults: [{ displayName: 'Ghost', chronicleCount: 3 }] })).toEqual([]);
  });

  it('falls back to the id when there is no display name', () => {
    expect(vaultChoices({ vaults: [{ vaultId: 'CODE' }] })[0].displayName).toBe('CODE');
  });

  // ABSENT is not ZERO. A missing count rendered as 0 tells someone their
  // vault is empty on the strength of a field that never arrived.
  it('marks an absent count as unknown rather than zero', () => {
    expect(vaultChoices({ vaults: [{ vaultId: 'CODE' }] })[0].chronicles).toBe(-1);
    expect(vaultChoices({ vaults: [{ vaultId: 'CODE', chronicleCount: 0 }] })[0].chronicles).toBe(0);
  });

  it('answers with an empty list for anything unexpected', () => {
    expect(vaultChoices(null)).toEqual([]);
    expect(vaultChoices({})).toEqual([]);
    expect(vaultChoices({ vaults: 'nope' })).toEqual([]);
  });
});
