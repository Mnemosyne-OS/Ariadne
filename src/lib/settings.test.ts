import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadSettings, saveSettings, resetSettings, rememberSaved, savedKey,
  DEFAULTS, MAX_SAVED,
} from './settings';

/** The key currently written. The older ones are read once and carried over. */
const CUR = 'ariadne.settings.v4';
const V3 = 'ariadne.settings.v3';
const V2 = 'ariadne.settings.v2';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('loadSettings', () => {
  it('starts with everything that spends tokens turned off', () => {
    const s = loadSettings();
    expect(s.summaries).toBe(false);
    expect(s.tone).toBe(false);
    expect(s.folders).toEqual({});
  });

  it('merges over the defaults, so a key added later is not undefined', () => {
    localStorage.setItem(CUR, JSON.stringify({ ownerName: 'Tony' }));
    const s = loadSettings();
    expect(s.ownerName).toBe('Tony');
    expect(s.summaries).toBe(false);   // absent in the stored blob, not undefined
    expect(s.folders).toEqual({});
  });

  it('returns the defaults rather than throwing on an unreadable blob', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(CUR, '{ not json');
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  describe('migration from v2', () => {
    it('carries the single folder into the Claude Code slot', () => {
      localStorage.setItem(V2, JSON.stringify({
        folder: 'C:/Users/x/.claude/projects', summaries: true, tone: true, ownerName: 'Tony',
      }));
      const s = loadSettings();
      expect(s.folders).toEqual({ 'claude-code': 'C:/Users/x/.claude/projects' });
      expect(s.summaries).toBe(true);
      expect(s.ownerName).toBe('Tony');
    });

    it('writes the migration back, so it happens once', () => {
      localStorage.setItem(V2, JSON.stringify({ folder: 'C:/f' }));
      loadSettings();
      expect(localStorage.getItem(CUR)).not.toBeNull();
    });

    it('migrates a v2 blob that never chose a folder', () => {
      localStorage.setItem(V2, JSON.stringify({ summaries: true }));
      expect(loadSettings().folders).toEqual({});
    });

    it('prefers the newer blob when several exist', () => {
      localStorage.setItem(V2, JSON.stringify({ folder: 'C:/old' }));
      localStorage.setItem(V3, JSON.stringify({ folders: { 'claude-code': 'C:/mid' } }));
      localStorage.setItem(CUR, JSON.stringify({ folders: { 'claude-code': 'C:/new' } }));
      expect(loadSettings().folders['claude-code']).toBe('C:/new');
    });
  });

  // v3 is v4 minus the memory keys. Sending someone back through the folder
  // picker to gain a feature would be a punishment for upgrading.
  describe('migration from v3', () => {
    it('carries the folders and the settings across whole', () => {
      localStorage.setItem(V3, JSON.stringify({
        folders: { 'claude-code': 'C:/f' }, summaries: true, ownerName: 'Tony',
      }));
      const s = loadSettings();
      expect(s.folders).toEqual({ 'claude-code': 'C:/f' });
      expect(s.summaries).toBe(true);
      expect(s.ownerName).toBe('Tony');
    });

    it('gives the keys v3 never had their defaults, not undefined', () => {
      localStorage.setItem(V3, JSON.stringify({ ownerName: 'Tony' }));
      const s = loadSettings();
      expect(s.saved).toEqual({});
      expect(s.lastVault).toBe('');
    });

    it('writes the migration back, so it happens once', () => {
      localStorage.setItem(V3, JSON.stringify({ ownerName: 'Tony' }));
      loadSettings();
      expect(localStorage.getItem(CUR)).not.toBeNull();
    });
  });
});

describe('saveSettings', () => {
  it('round-trips', () => {
    saveSettings({ ...DEFAULTS, ownerName: 'Tony', folders: { a: 'C:/a' } });
    const s = loadSettings();
    expect(s.ownerName).toBe('Tony');
    expect(s.folders).toEqual({ a: 'C:/a' });
  });

  it('warns instead of throwing when the store refuses', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveSettings(DEFAULTS)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('resetSettings', () => {
  it('leaves no version of the blob behind', () => {
    for (const k of [CUR, V3, V2, 'ariadne.settings.v1']) localStorage.setItem(k, '{}');
    expect(resetSettings()).toEqual(DEFAULTS);
    for (const k of [CUR, V3, V2, 'ariadne.settings.v1']) {
      expect(localStorage.getItem(k), k).toBeNull();
    }
  });

  it('does not resurrect a migration on the next load', () => {
    localStorage.setItem(V2, JSON.stringify({ folder: 'C:/f' }));
    resetSettings();
    expect(loadSettings().folders).toEqual({});
  });
});

describe('savedKey', () => {
  // Windows hands back both separators and either case, and one file must not
  // read as two rows in a list whose whole job is "have I already kept this".
  it('is the same key whatever the separators and case', () => {
    expect(savedKey('C:\\Notes\\A.md')).toBe(savedKey('c:/notes/a.md'));
  });
});

describe('rememberSaved', () => {
  const mark = (at: string) => ({ vault: 'WORK', at });

  it('records the save and remembers the vault for next time', () => {
    const s = rememberSaved(DEFAULTS, 'C:/a.md', mark('2026-08-29T10:00:00Z'));
    expect(s.saved[savedKey('C:/a.md')].vault).toBe('WORK');
    expect(s.lastVault).toBe('WORK');
  });

  it('does not mutate what it was given', () => {
    const before = { ...DEFAULTS, saved: {} };
    rememberSaved(before, 'C:/a.md', mark('2026-08-29T10:00:00Z'));
    expect(before.saved).toEqual({});
  });

  it('overwrites the mark for a file kept twice rather than adding a row', () => {
    let s = rememberSaved(DEFAULTS, 'C:/a.md', mark('2026-08-29T10:00:00Z'));
    s = rememberSaved(s, 'C:/A.MD', { vault: 'ARCHIVE', at: '2026-08-29T11:00:00Z' });
    expect(Object.keys(s.saved)).toHaveLength(1);
    expect(s.saved[savedKey('C:/a.md')].vault).toBe('ARCHIVE');
  });

  // The host mirror caps a cartridge's store at 256 KB (doc 73). A blob that
  // grows without limit would one day fail to save, taking the folder settings
  // with it — so the oldest marks fall off, never the newest.
  it('drops the oldest marks past the cap and keeps the newest', () => {
    let s: typeof DEFAULTS = { ...DEFAULTS };
    for (let i = 0; i < MAX_SAVED + 20; i++) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      s = rememberSaved(s, `C:/f${String(i).padStart(4, '0')}.md`, { vault: 'WORK', at });
    }
    expect(Object.keys(s.saved)).toHaveLength(MAX_SAVED);
    expect(s.saved[savedKey('C:/f0000.md')]).toBeUndefined();
    expect(s.saved[savedKey(`C:/f${String(MAX_SAVED + 19).padStart(4, '0')}.md`)]).toBeDefined();
  });
});
