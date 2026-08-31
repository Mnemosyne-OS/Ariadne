/**
 * Every file the connected agents produced, as one browsable list.
 *
 * Pure, and separate from the view, because this is where the honesty lives:
 * the old list silently kept 30 rows under a counter announcing thousands, and
 * a rule you cannot test is a rule that comes back.
 */
import type { Artifact, SessionState } from '@mnemosyne_os/agent-transcripts';
import type { SavedMark, Settings } from './settings';
import { savedKey } from './settings';
import { isMarkdownPath } from './mdFile';

export interface ArtifactRow {
  path: string;
  /** How the file is known to belong to a session — see Artifact. */
  origin: Artifact['origin'];
  /** Most recent touch, ISO. Null when no line carried a timestamp. */
  at: string | null;
  /** Which project it was written under, for the row's second column. */
  project: string | null;
  /** The session it came from, so the drawer can name its provenance. */
  sessionPath: string;
  sessionTitle: string | null;
  sessionAt: string | null;
  /** Already sent to memory, with the vault it went to. */
  saved: SavedMark | undefined;
}

export type OriginFilter = 'all' | 'tool' | 'shell';

/**
 * One row per PATH, newest session first.
 *
 * A file edited across four sessions is one line carrying the last touch, not
 * four lines that each look like separate work. The first sighting wins, and
 * sessions are walked newest first, so that line is the most recent one.
 */
export function buildArtifactRows(sessions: SessionState[], settings: Settings): ArtifactRow[] {
  const byPath = new Map<string, ArtifactRow>();
  const ordered = [...sessions].sort(
    (a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));

  for (const s of ordered) {
    const project = s.projectPath?.split(/[\\/]/).filter(Boolean).pop() ?? null;
    for (const a of s.artifacts) {
      if (byPath.has(a.path)) continue;
      byPath.set(a.path, {
        path: a.path,
        origin: a.origin,
        // A tool call without a timestamp falls back to the session's last
        // event: the file WAS touched during it, and an empty time column on
        // a real row reads as a broken list. Never the other way round — the
        // session time is a bound, so it can only be as recent or older.
        at: a.at ?? s.lastEventAt,
        project,
        sessionPath: s.path,
        sessionTitle: s.title,
        sessionAt: s.lastEventAt,
        saved: settings.saved[savedKey(a.path)],
      });
    }
  }

  return [...byPath.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export interface RowFilter {
  query: string;
  origin: OriginFilter;
  /** Show only the files already kept in memory. */
  savedOnly: boolean;
  /** Show only the markdown an agent wrote. The documents in the notes pane
   *  come from a folder the human designated; these come from a path a
   *  transcript recorded, anywhere on disk, which is a different claim and
   *  stays a different list. */
  mdOnly?: boolean;
}

/** Rows matching a filter. Search is a plain substring over the whole path —
 *  a folder name is as good a way to find a draft as its file name. */
export function filterArtifactRows(rows: ArtifactRow[], f: RowFilter): ArtifactRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(r => {
    if (f.origin !== 'all' && r.origin !== f.origin) return false;
    if (f.savedOnly && !r.saved) return false;
    if (f.mdOnly && !isMarkdownPath(r.path)) return false;
    if (q && !r.path.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** How many of these rows are markdown, for the chip that filters to them. A
 *  chip with no number tells you to click to find out whether it is empty. */
export function countMarkdown(rows: readonly ArtifactRow[]): number {
  return rows.filter(r => isMarkdownPath(r.path)).length;
}

/**
 * How many sessions the numbers above the list were built from, and whether
 * any of them stopped short.
 *
 * `capped` is the number that must reach the screen: 42 of 211 sessions on
 * this machine hit the old per-session ceiling, and each one presented 40 of
 * its files as if that were all of them.
 */
export function countCapped(sessions: SessionState[]): number {
  return sessions.filter(s => s.artifactsCapped).length;
}
