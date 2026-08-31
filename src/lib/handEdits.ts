/**
 * Which files were touched by something that is not a recorded agent action.
 *
 * ## The claim has to be exact
 *
 * "Modified by a human" is not provable from here. What IS provable is that a
 * file changed AFTER the last agent action we know about — and that change
 * could be a person, a build step, a formatter, or an agent whose transcript
 * this app is not reading. Calling that "a human did it" would be the doc 93
 * §2 mistake again: naming an actor the evidence does not identify.
 *
 * So there are two marks, and they are different kinds of fact:
 *
 *  - `here`  — Ariadne itself wrote this file, on a press. A RECORD.
 *  - `after` — the file's mtime is later than the last agent action we saw on
 *              it. An INFERENCE, and the label says "changed after the agent",
 *              never "changed by you".
 *
 * A file with neither mark is not "untouched by humans"; it is a file with no
 * evidence either way, and the view shows nothing rather than a green tick.
 */
import type { ArtifactRow } from './artifactRows';
import type { DocState } from '@mnemosyne_os/agent-transcripts';
import type { Settings } from './settings';
import { savedKey } from './settings';

export type EditMark = 'here' | 'after' | null;

/**
 * A file's mtime may be a second or two past the transcript line that wrote
 * it: the harness logs the call, then the write lands. Below this, "later"
 * means nothing.
 */
const CLOCK_SLACK_MS = 5_000;

/**
 * The mark for one file.
 *
 * `agentTouchedAt` is when an agent action last named it, ISO, or null when
 * nothing did. `mtime` is what the directory listing gave back, or null when
 * the file was never listed — an unknown mtime yields NO mark, never `after`:
 * an absent measurement must not produce a claim.
 */
export function editMark(
  path: string,
  mtime: number | null,
  agentTouchedAt: string | null,
  settings: Settings,
): EditMark {
  const own = settings.edited[savedKey(path)];
  if (own) return 'here';
  if (mtime === null || !agentTouchedAt) return null;
  const touched = Date.parse(agentTouchedAt);
  if (!Number.isFinite(touched)) return null;
  return mtime > touched + CLOCK_SLACK_MS ? 'after' : null;
}

/** The mark for a note in the notes list. */
export function markForDoc(doc: DocState, sessions: { artifacts: { path: string; at: string | null }[]; lastEventAt: string | null }[], settings: Settings): EditMark {
  return editMark(doc.path, doc.mtime, lastAgentTouch(doc.path, sessions), settings);
}

/** The mark for a row in the files list. The row already carries when an agent
 *  last named it, so no scan is needed. */
export function markForRow(row: ArtifactRow, mtime: number | null, settings: Settings): EditMark {
  return editMark(row.path, mtime, row.at, settings);
}

/**
 * When an agent action last named this path, across every session read.
 *
 * Compared case-insensitively over forward slashes: Windows hands back both
 * separators and either case, and the same file must not miss its own match.
 */
export function lastAgentTouch(
  path: string,
  sessions: { artifacts: { path: string; at: string | null }[]; lastEventAt: string | null }[],
): string | null {
  const key = savedKey(path);
  let best: string | null = null;
  for (const s of sessions) {
    for (const a of s.artifacts) {
      if (savedKey(a.path) !== key) continue;
      // A tool call with no timestamp still proves the session touched it, so
      // the session's own last event stands in — it is a real upper bound.
      const at = a.at ?? s.lastEventAt;
      if (at && (!best || at > best)) best = at;
    }
  }
  return best;
}
