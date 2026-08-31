/**
 * The two links are different CLAIMS, and the whole point of this module is
 * that they never collapse into one list. Every test here defends that.
 */
import { describe, it, expect } from 'vitest';
import { notesForSession } from './sessionNotes';
import type { Artifact, DocState, SessionState } from '@mnemosyne_os/agent-transcripts';

/** A file the harness recorded the session writing. */
const art = (path: string, origin: Artifact['origin'] = 'tool'): Artifact =>
  ({ path, origin, at: null });

const session = (over: Partial<SessionState> = {}): SessionState => ({
  file: 's.jsonl', path: 'C:/s.jsonl', sessionId: 'S1', title: null, model: null,
  projectPath: 'C:/w', branch: 'main', isSidechain: false,
  firstEventAt: '2026-08-28T10:00:00Z',
  lastEventAt: '2026-08-28T11:00:00Z',
  tool: null, sizeBytes: 1, artifacts: [], artifactsCapped: false, humanTurns: [], ...over,
});

const doc = (path: string, mtime: number): DocState => ({
  file: path.split('/').pop()!, path, name: 'n', description: null, type: null,
  links: [], body: '', sizeBytes: 1, mtime,
});

const T = (h: number, m = 0) => Date.parse(`2026-08-28T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

describe('notesForSession', () => {
  it('calls a note WRITTEN when the session tool-called that exact path', () => {
    const s = session({ artifacts: [art('C:/notes/a.md')] });
    const r = notesForSession(s, [doc('C:/notes/a.md', T(3))]);
    expect(r.written).toHaveLength(1);
    expect(r.written[0].origin).toBe('tool');
    expect(r.during).toHaveLength(0);
  });

  // The case from the screenshot that started this: MEMORY.md was rewritten by
  // a python heredoc inside Bash, and landed under "changed while it was open"
  // — a coincidence of timing — when the session had demonstrably written it.
  it('calls a note WRITTEN when a shell command wrote it, and marks the inference', () => {
    const s = session({ artifacts: [art('C:/notes/a.md', 'shell')] });
    const r = notesForSession(s, [doc('C:/notes/a.md', T(3))]);
    expect(r.written).toHaveLength(1);
    expect(r.written[0].origin).toBe('shell');
    expect(r.during).toHaveLength(0);
  });

  it('keeps the record when a file is both tool-written and shell-touched', () => {
    const s = session({ artifacts: [art('C:/notes/a.md', 'tool'), art('C:/notes/a.md', 'shell')] });
    expect(notesForSession(s, [doc('C:/notes/a.md', T(3))]).written[0].origin).toBe('tool');
  });

  it('matches across separators and case, so Windows does not lose its own file', () => {
    const s = session({ artifacts: [art('C:\\Notes\\A.md')] });
    const r = notesForSession(s, [doc('C:/notes/a.md', T(3))]);
    expect(r.written).toHaveLength(1);
  });

  it('never counts the same note twice', () => {
    const s = session({ artifacts: [art('C:/notes/a.md')] });
    // Inside the window AND written: it is a record, so it belongs to written only.
    const r = notesForSession(s, [doc('C:/notes/a.md', T(10, 30))]);
    expect(r.written).toHaveLength(1);
    expect(r.during).toHaveLength(0);
  });

  it('calls a note DURING when only its timestamp falls inside the run', () => {
    const r = notesForSession(session(), [doc('C:/notes/b.md', T(10, 30))]);
    expect(r.written).toHaveLength(0);
    expect(r.during).toHaveLength(1);
  });

  it('excludes a note written before the session started', () => {
    expect(notesForSession(session(), [doc('C:/notes/b.md', T(9))]).during).toHaveLength(0);
  });

  it('allows a minute of grace after the last line, for a write still landing', () => {
    const r = notesForSession(session(), [doc('C:/notes/b.md', T(11, 0) + 30_000)]);
    expect(r.during).toHaveLength(1);
  });

  it('excludes a note written well after the session ended', () => {
    expect(notesForSession(session(), [doc('C:/notes/b.md', T(12))]).during).toHaveLength(0);
  });

  it('claims nothing by time when the session has no known start', () => {
    const s = session({ firstEventAt: null, lastEventAt: null });
    const r = notesForSession(s, [doc('C:/notes/b.md', T(10, 30))]);
    expect(r.during).toHaveLength(0);
  });

  it('orders each group newest first', () => {
    const r = notesForSession(session(), [
      doc('C:/notes/old.md', T(10, 10)),
      doc('C:/notes/new.md', T(10, 50)),
    ]);
    expect(r.during.map(d => d.file)).toEqual(['new.md', 'old.md']);
  });
});
