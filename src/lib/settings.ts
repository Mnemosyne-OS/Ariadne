/**
 * Cartridge settings. Persisted in localStorage, which the host mirrors
 * (doc 73), so they survive the iframe's origin changing between the dev
 * server and an installed build.
 *
 * Everything that costs tokens is OFF by default. A cartridge that starts
 * spending on first open is a cartridge nobody trusts twice.
 */
export interface Settings {
  /** One folder per agent, keyed by source id. Each agent writes somewhere
   *  different, so there is no single root to share. */
  folders: Record<string, string>;
  /** Ask the model for a first-person session summary. Costs tokens. */
  summaries: boolean;
  /** Add a reading of the session's tone to that summary. Rides the same call
   *  — no extra spend — but it is a separate consent. */
  tone: boolean;
  /** Whose assistant the summary speaks as. Empty is fine; the phrasing then
   *  simply omits the name rather than inventing one. */
  ownerName: string;
  /**
   * The vault "Keep this" last wrote to, so the second draft of an afternoon
   * is one click. A standing preference, never a standing authorisation: each
   * save is still a press, and the vault is named on the button.
   */
  lastVault: string;
  /**
   * Drafts already sent to memory, keyed by lowercased path with forward
   * slashes. Its whole job is that a list of hundreds of files can show you
   * which ones you already kept — without it, choosing is a memory exercise.
   *
   * Only saves are recorded, so this stays small; `rememberSaved` trims it
   * anyway, because the host mirror caps a cartridge's store at 256 KB
   * (doc 73) and a silently dropped write would lose the settings with it.
   */
  saved: Record<string, SavedMark>;
  /**
   * Files Ariadne itself wrote, keyed the same way. This is what turns
   * "changed after the last agent action" — an inference — into "edited here",
   * a record. Same trimming as `saved`, same reason.
   */
  edited: Record<string, EditedMark>;
  /**
   * Conversations Ariadne wrote out as documents, keyed by the SESSION's path
   * the same way.
   *
   * 🚨 What Ariadne itself did, never a claim about the disk. The file may have
   * been moved or deleted since, so a mark means "I wrote one here", and the
   * screen that shows it must survive opening a file that is gone — which the
   * drawer already does, because a refusal is never rendered as an empty file.
   *
   * ⛔ Not merged into `saved` or `edited`: those are about files an AGENT
   * produced and what became of them. This one is about a document Ariadne
   * produced, from a transcript. Same shape, different claim.
   */
  exported: Record<string, ExportedMark>;
}

export interface ExportedMark {
  /** Where the document was written. */
  file: string;
  /** ISO timestamp of the export. */
  at: string;
  /** What the host reported writing. Kept so the row can say how much of the
   *  conversation is in there without opening it. */
  turns: number;
  /** Tool results, thinking and images left out, as the host counted them.
   *  The header of the document says the same thing; this is so the LIST can
   *  say it too, rather than a document that reads as complete. */
  skipped: number;
}

export interface EditedMark {
  /** ISO timestamp of the edit. */
  at: string;
}

export interface SavedMark {
  /** The vault it went into, as the human saw it named. */
  vault: string;
  /** ISO timestamp of the save. */
  at: string;
  /** What the host gave back. Absent when it returned no id — an ingest that
   *  succeeded without one is still a save, and inventing an id would make a
   *  later "find it again" point at nothing. */
  chronicleId?: string;
}

const KEY = 'ariadne.settings.v4';
const KEY_V3 = 'ariadne.settings.v3';
const KEY_V2 = 'ariadne.settings.v2';

/** How many saves to remember. Oldest fall off the list, never the memory:
 *  the chronicle stays in the vault, only the "already kept" mark is lost. */
export const MAX_SAVED = 600;

export const DEFAULTS: Settings = {
  folders: {},
  summaries: false,
  tone: false,
  ownerName: '',
  lastVault: '',
  saved: {},
  edited: {},
  exported: {},
};

/** One key for one file, whatever separators and case the OS handed back. */
export function savedKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/** Drop the oldest marks past the cap, newest kept. Shared by both maps. */
function trimMarks<T extends { at: string }>(marks: Record<string, T>): Record<string, T> {
  const keys = Object.keys(marks);
  if (keys.length <= MAX_SAVED) return marks;
  const out = { ...marks };
  keys
    .sort((a, b) => (marks[a].at ?? '').localeCompare(marks[b].at ?? ''))
    .slice(0, keys.length - MAX_SAVED)
    .forEach(k => delete out[k]);
  return out;
}

/**
 * Record a save, trimming the oldest marks past the cap.
 *
 * Returns a NEW settings object: the caller persists it, so a failed write
 * leaves the previous state intact rather than a half-updated one.
 */
export function rememberSaved(s: Settings, path: string, mark: SavedMark): Settings {
  return {
    ...s,
    saved: trimMarks({ ...s.saved, [savedKey(path)]: mark }),
    lastVault: mark.vault,
  };
}

/**
 * Record that Ariadne wrote this file.
 *
 * It is what makes "edited here" a record rather than the weaker "changed
 * after the last agent action" the mtime alone can support (see handEdits).
 */
/**
 * Records a conversation Ariadne just wrote. Trimmed like the others: the host
 * mirror caps a cartridge's store at 256 KB (doc 73), and a silently dropped
 * write would take the settings with it.
 */
export function rememberExported(s: Settings, sessionPath: string, mark: ExportedMark): Settings {
  return { ...s, exported: trimMarks({ ...s.exported, [savedKey(sessionPath)]: mark }) };
}

export function rememberEdited(s: Settings, path: string, mark: EditedMark): Settings {
  return { ...s, edited: trimMarks({ ...s.edited, [savedKey(path)]: mark }) };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // Merge over defaults: a blob written by an older version is missing
      // keys, and a missing boolean must read as OFF, not undefined.
      return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    }
    // v3 is v4 minus the memory keys, so it carries over whole. Sending
    // someone back through the folder picker to gain a feature would be a
    // punishment for upgrading.
    const v3 = localStorage.getItem(KEY_V3);
    if (v3) {
      const migrated: Settings = { ...DEFAULTS, ...(JSON.parse(v3) as Partial<Settings>) };
      saveSettings(migrated);
      return migrated;
    }
    // v2 held one folder for one agent. It IS the Claude Code folder, so it
    // carries over rather than sending the person back through the picker.
    const old = localStorage.getItem(KEY_V2);
    if (old) {
      const prev = JSON.parse(old) as { folder?: string | null; summaries?: boolean; tone?: boolean; ownerName?: string };
      const migrated: Settings = {
        ...DEFAULTS,
        summaries: prev.summaries ?? false,
        tone: prev.tone ?? false,
        ownerName: prev.ownerName ?? '',
        folders: prev.folder ? { 'claude-code': prev.folder } : {},
      };
      saveSettings(migrated);
      return migrated;
    }
    return { ...DEFAULTS };
  } catch (err) {
    console.warn('[Ariadne] settings unreadable, using defaults:', err);
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (err) {
    // A full or blocked store must not break the app; the user just loses the
    // preference, and they should be able to see that in the console.
    console.warn('[Ariadne] settings could not be saved:', err);
  }
}

/** Forget everything, every version of it, so a reset leaves nothing behind. */
export function resetSettings(): Settings {
  try {
    for (const k of [KEY, KEY_V3, KEY_V2, 'ariadne.settings.v1']) localStorage.removeItem(k);
  } catch (err) {
    console.warn('[Ariadne] settings could not be cleared:', err);
  }
  return { ...DEFAULTS };
}
