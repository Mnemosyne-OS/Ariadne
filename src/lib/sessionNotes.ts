/**
 * Which notes belong to a session.
 *
 * There are two answers and they are NOT the same claim. Measured over 40
 * sessions on 2026-08-27: 32 links by artifact, 278 by time window, and only
 * 12 in both. Collapsing them into one list would present a guess and a record
 * as the same fact.
 */
import type { Artifact, DocState, SessionState } from '@mnemosyne_os/agent-transcripts';

/** A note the session itself produced, and how strong the evidence is. */
export interface LinkedNote {
  doc: DocState;
  /** Same meaning as on Artifact: `tool` is a record, `shell` is read out of a
   *  command the session ran. Both say the session did it; only one was
   *  written down by the harness. */
  origin: Artifact['origin'];
}

export interface SessionNotes {
  /** The session's own tool calls or commands wrote this file. */
  written: LinkedNote[];
  /** The file changed while the session was open. Circumstantial: another
   *  session running at the same time produces exactly the same evidence, and
   *  parallel sessions are routine here. */
  during: DocState[];
}

/** A tolerance on the closing edge: a write started in the last seconds of a
 *  session lands on disk just after its final logged line. */
const TAIL_MS = 60_000;

export function notesForSession(session: SessionState, docs: DocState[]): SessionNotes {
  const written: LinkedNote[] = [];
  const during: DocState[] = [];

  // Keyed by path, valued by how it is known. A file the session both wrote
  // with a tool and touched from a shell keeps the record, not the inference:
  // artifacts arrive tool-first per line (see connector.addArtifact).
  const touched = new Map<string, Artifact['origin']>();
  for (const a of session.artifacts) {
    const key = normalise(a.path);
    if (!touched.has(key)) touched.set(key, a.origin);
  }

  const from = session.firstEventAt ? Date.parse(session.firstEventAt) : NaN;
  const to = session.lastEventAt ? Date.parse(session.lastEventAt) + TAIL_MS : NaN;
  const windowKnown = Number.isFinite(from) && Number.isFinite(to);

  for (const doc of docs) {
    const origin = touched.get(normalise(doc.path));
    if (origin) { written.push({ doc, origin }); continue; }
    if (windowKnown && doc.mtime >= from && doc.mtime <= to) during.push(doc);
  }

  written.sort((a, b) => b.doc.mtime - a.doc.mtime);
  during.sort((a, b) => b.mtime - a.mtime);
  return { written, during };
}

/** Windows hands back both separators and either case, and the same file must
 *  not miss its own match over a backslash. */
function normalise(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}
