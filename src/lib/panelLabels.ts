/**
 * What the one panel is called, and what one step of its history is called.
 *
 * Pure, and out of the shell, because these are the strings a person reads to
 * decide whether to press a button. They used to be three inline ternaries in
 * App.tsx, where the only way to check the fallback order was to re-read them:
 * a title falls back note → file → session, and a subtitle falls back
 * session → file → note, which is NOT the same order and never was.
 *
 * The rule underneath all of them: a target that is gone still gets a name.
 * A note deleted on disk, or a session belonging to an agent you switched away
 * from, keeps its file name rather than rendering blank — the step happened,
 * and an empty label reads as a broken control.
 */
import type { DocState, SessionState } from '@mnemosyne_os/agent-transcripts';
import type { ArtifactRow } from './artifactRows';
import type { PanelRef } from './panelHistory';
import { baseName, sessionLabel } from './format';

/** The panel's ref, already resolved against what is currently loaded. All
 *  three are null when the panel is closed, and at most one is ever set. */
export interface OpenedPanel {
  note: DocState | null;
  file: ArtifactRow | null;
  session: SessionState | null;
}

/** Truncation widths. The drawer header has more room than a history button,
 *  and the two were already different numbers before they moved here. */
const TITLE_CHARS = 46;
const HISTORY_CHARS = 40;

/**
 * The drawer's headline.
 *
 * A session with neither a title nor a first message renders `unknown` rather
 * than an empty bar: `sessionLabel` can legitimately return an empty string,
 * and `||` is what catches it.
 *
 * The `null` in the return type comes from `DocState.name` alone, and it is a
 * type artifact rather than a state anyone reaches: `readDoc` falls back to the
 * file name, so a note only reaches here nameless if its file is nothing but an
 * extension. Widening it to `unknown` would be a behaviour change dressed up as
 * a tidy-up, so it stays as it was.
 */
export function panelTitle(opened: OpenedPanel, unknown: string): string | null {
  if (opened.note) return opened.note.name;
  if (opened.file) return baseName(opened.file.path) ?? opened.file.path;
  if (opened.session) {
    return sessionLabel(
      opened.session.title, opened.session.humanTurns[0]?.text, TITLE_CHARS).text || unknown;
  }
  return '';
}

/**
 * The line under it: where the thing came from.
 *
 * `agentLabel` is null when no agent is open, and that is not a cosmetic
 * detail — a session's subtitle names its harness, its project and its branch,
 * so without the harness the whole line would be two thirds of a sentence.
 * With no agent it falls through to the file's project, then the note's type.
 */
export function panelSubtitle(
  opened: OpenedPanel, agentLabel: string | null, unknown: string,
): string {
  if (opened.session && agentLabel !== null) {
    const project = baseName(opened.session.projectPath) ?? unknown;
    return `${agentLabel} · ${project} · ${opened.session.branch ?? unknown}`;
  }
  if (opened.file) return opened.file.project ?? unknown;
  return opened.note?.type ?? '';
}

/**
 * What to call one entry of the history, so back and forward can NAME where
 * they lead. A button labelled only with an arrow makes you press it to find
 * out where it goes, which is the thing being fixed.
 */
export function entryLabel(
  ref: PanelRef, docs: DocState[], sessions: SessionState[],
): string {
  const fallback = baseName(ref.file) ?? ref.file;
  if (ref.kind === 'note') return docs.find(d => d.path === ref.file)?.name ?? fallback;
  if (ref.kind === 'file') return fallback;
  const session = sessions.find(x => x.path === ref.file);
  if (!session) return fallback;
  return sessionLabel(
    session.title, session.humanTurns[0]?.text, HISTORY_CHARS).text || fallback;
}
