import { describe, it, expect } from 'vitest';
import { extensionOf, isWritable } from './writable';

describe('extensionOf', () => {
  it('reads the extension whatever the separators and case', () => {
    expect(extensionOf('C:\\a\\b\\NOTE.MD')).toBe('md');
    expect(extensionOf('/home/me/a.tsx')).toBe('tsx');
  });

  it('never takes a dot from a directory name', () => {
    expect(extensionOf('/home/.claude/projects/session')).toBe('');
  });

  it('treats a dotfile as its own name', () => {
    expect(extensionOf('/repo/.gitignore')).toBe('gitignore');
  });
});

describe('isWritable', () => {
  it('accepts what the host writes back', () => {
    for (const p of ['a.md', 'a.txt', 'a.json', 'a.yml', 'a.csv', 'a.svg', 'a.ts']) {
      expect(isWritable(p), p).toBe(true);
    }
  });

  // The write list is NARROWER than the read list on purpose, and this app
  // does not widen it: reading a .tsx shows a draft, writing one puts code in
  // a tree a build may run. A Save button that fails on press is worse than a
  // sentence saying why there is none.
  it('refuses what the host reads but will not write', () => {
    for (const p of ['a.tsx', 'a.py', 'a.jsonl', 'a.astro', 'a.mjs', 'a.diff', 'a.ps1']) {
      expect(isWritable(p), p).toBe(false);
    }
  });

  it('refuses a file with no extension', () => {
    expect(isWritable('/repo/LICENSE')).toBe(false);
  });
});
