/**
 * The two fallback ORDERS are the thing under test.
 *
 * A title falls back note → file → session, a subtitle falls back
 * session → file → note. They look symmetric and are not, and while they lived
 * as inline ternaries the only way to check either was to re-read it.
 *
 * The second rule defended here: a target that no longer exists still gets a
 * name. A blank label reads as a broken control, so every path ends on the file
 * name rather than on an empty string.
 */
import { describe, it, expect } from 'vitest';
import { panelTitle, panelSubtitle, entryLabel, type OpenedPanel } from './panelLabels';
import type { ArtifactRow } from './artifactRows';
import type { DocState, SessionState } from '@mnemosyne_os/agent-transcripts';

const NOTHING: OpenedPanel = { note: null, file: null, session: null };

const doc = (over: Partial<DocState> = {}): DocState => ({
  file: 'a.md', path: 'C:/notes/a.md', name: 'Alpha', description: null, type: 'task',
  links: [], body: '', sizeBytes: 1, mtime: 0, ...over,
});

const row = (over: Partial<ArtifactRow> = {}): ArtifactRow => ({
  path: 'C:/w/src/App.tsx', origin: 'tool', at: null, project: 'w',
  sessionPath: 'C:/s.jsonl', sessionTitle: null, sessionAt: null, saved: undefined, ...over,
});

const session = (over: Partial<SessionState> = {}): SessionState => ({
  file: 's.jsonl', path: 'C:/s.jsonl', sessionId: 'S1', title: 'Refactor the panel',
  model: null, projectPath: 'C:/work/mnemosyne', branch: 'main', isSidechain: false,
  firstEventAt: null, lastEventAt: null, tool: null, sizeBytes: 1,
  artifacts: [], artifactsCapped: false, humanTurns: [], tokens: null, ...over,
});

describe('panelTitle', () => {
  it('renders nothing when the panel is closed', () => {
    expect(panelTitle(NOTHING, '—')).toBe('');
  });

  it('prefers the note, then the file, then the session', () => {
    const all: OpenedPanel = { note: doc(), file: row(), session: session() };
    expect(panelTitle(all, '—')).toBe('Alpha');
    expect(panelTitle({ ...all, note: null }, '—')).toBe('App.tsx');
    expect(panelTitle({ ...all, note: null, file: null }, '—')).toBe('Refactor the panel');
  });

  // Type artifact, pinned so a later tidy-up has to be deliberate: readDoc
  // fills the name from the file name, so nothing reaches this in practice.
  it('passes a nameless note through as null rather than inventing a word', () => {
    expect(panelTitle({ ...NOTHING, note: doc({ name: null }) }, 'unknown')).toBeNull();
  });

  it('falls back to the whole path when a file path has no last segment', () => {
    expect(panelTitle({ ...NOTHING, file: row({ path: '/' }) }, '—')).toBe('/');
  });

  it('names an untitled session with its first message', () => {
    const s = session({ title: null, humanTurns: [{ at: null, text: 'why is the list short' }] });
    expect(panelTitle({ ...NOTHING, session: s }, '—')).toBe('why is the list short');
  });

  // sessionLabel legitimately returns '', and an empty drawer headline reads as
  // a rendering failure rather than as a session nobody named.
  it('renders unknown for a session with neither a title nor a first message', () => {
    const s = session({ title: null, humanTurns: [] });
    expect(panelTitle({ ...NOTHING, session: s }, 'unknown')).toBe('unknown');
  });

  it('clips a long title, at a wider budget than a history button', () => {
    const s = session({ title: 'x'.repeat(80) });
    const title = panelTitle({ ...NOTHING, session: s }, '—') ?? '';
    expect(title).toHaveLength(46);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('panelSubtitle', () => {
  it('renders nothing when the panel is closed', () => {
    expect(panelSubtitle(NOTHING, 'Claude Code', '—')).toBe('');
  });

  it('names the harness, the project and the branch for a session', () => {
    expect(panelSubtitle({ ...NOTHING, session: session() }, 'Claude Code', '—'))
      .toBe('Claude Code · mnemosyne · main');
  });

  it('says unknown for a project and a branch the agent never recorded', () => {
    const s = session({ projectPath: null, branch: null });
    expect(panelSubtitle({ ...NOTHING, session: s }, 'Antigravity', 'unknown'))
      .toBe('Antigravity · unknown · unknown');
  });

  // The order that is NOT the title's: a session wins over a file here.
  it('prefers the session, then the file, then the note', () => {
    const all: OpenedPanel = { note: doc(), file: row(), session: session() };
    expect(panelSubtitle(all, 'Claude Code', '—')).toBe('Claude Code · mnemosyne · main');
    expect(panelSubtitle({ ...all, session: null }, 'Claude Code', '—')).toBe('w');
    expect(panelSubtitle({ ...all, session: null, file: null }, 'Claude Code', '—')).toBe('task');
  });

  // Without an agent the session line would be two thirds of a sentence, so it
  // is not rendered at all.
  it('skips the session line entirely when no agent is open', () => {
    const both: OpenedPanel = { note: doc(), file: null, session: session() };
    expect(panelSubtitle(both, null, '—')).toBe('task');
  });

  it('says unknown for a file whose project was never recorded', () => {
    expect(panelSubtitle({ ...NOTHING, file: row({ project: null }) }, null, 'unknown'))
      .toBe('unknown');
  });

  it('renders nothing for a note with no type, rather than the word unknown', () => {
    expect(panelSubtitle({ ...NOTHING, note: doc({ type: null }) }, null, 'unknown')).toBe('');
  });
});

describe('entryLabel', () => {
  const docs = [doc()];
  const sessions = [session()];

  it('names a note by its name', () => {
    expect(entryLabel({ kind: 'note', file: 'C:/notes/a.md' }, docs, sessions)).toBe('Alpha');
  });

  it('names a file by its last segment', () => {
    expect(entryLabel({ kind: 'file', file: 'C:/w/src/App.tsx' }, docs, sessions)).toBe('App.tsx');
  });

  it('names a session by its label', () => {
    expect(entryLabel({ kind: 'session', file: 'C:/s.jsonl' }, docs, sessions))
      .toBe('Refactor the panel');
  });

  // A note deleted on disk, or a session from an agent you switched away from.
  it('keeps the file name when the target is gone', () => {
    expect(entryLabel({ kind: 'note', file: 'C:/notes/gone.md' }, docs, sessions))
      .toBe('gone.md');
    expect(entryLabel({ kind: 'session', file: 'C:/gone.jsonl' }, docs, sessions))
      .toBe('gone.jsonl');
  });

  it('keeps the file name for a session that exists but has no label', () => {
    const blank = [session({ path: 'C:/blank.jsonl', title: null, humanTurns: [] })];
    expect(entryLabel({ kind: 'session', file: 'C:/blank.jsonl' }, docs, blank))
      .toBe('blank.jsonl');
  });

  it('clips a session label shorter than the drawer headline does', () => {
    const long = [session({ path: 'C:/long.jsonl', title: 'y'.repeat(80) })];
    expect(entryLabel({ kind: 'session', file: 'C:/long.jsonl' }, docs, long)).toHaveLength(40);
  });
});
