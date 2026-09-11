/**
 * The list that used to lie about its own length.
 *
 * It rendered 30 rows under a counter showing the true total, with nothing to
 * explain the gap. Every test here defends one of the three facts a row now
 * carries: which file, how it is known, and whether it already went to memory.
 */
import { describe, it, expect } from 'vitest';
import {
  buildArtifactRows, countCapped, countMarkdown, filterArtifactRows,
  documentRows, recentDocuments, notePathSet, fileName,
} from './artifactRows';
import type { Artifact, SessionState } from '@mnemosyne_os/agent-transcripts';
import { DEFAULTS, savedKey, type Settings } from './settings';

const art = (path: string, origin: Artifact['origin'] = 'tool', at: string | null = null): Artifact =>
  ({ path, origin, at });

const session = (over: Partial<SessionState> = {}): SessionState => ({
  file: 's.jsonl', path: 'C:/s.jsonl', sessionId: 'S1', title: 'A session', model: null,
  projectPath: 'C:/w/proj', branch: 'main', isSidechain: false,
  firstEventAt: '2026-08-28T10:00:00Z', lastEventAt: '2026-08-28T11:00:00Z',
  tool: null, sizeBytes: 1, artifacts: [], artifactsCapped: false, humanTurns: [], ...over,
});

const withSaved = (path: string, vault = 'WORK'): Settings => ({
  ...DEFAULTS,
  saved: { [savedKey(path)]: { vault, at: '2026-08-29T09:00:00Z' } },
});

describe('buildArtifactRows', () => {
  it('carries the file, its origin and the session that produced it', () => {
    const rows = buildArtifactRows([session({ artifacts: [art('C:/a.ts', 'shell', '2026-08-28T10:30:00Z')] })], DEFAULTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      path: 'C:/a.ts', origin: 'shell', at: '2026-08-28T10:30:00Z',
      project: 'proj', sessionTitle: 'A session', sessionPath: 'C:/s.jsonl',
    });
  });

  it('shows one line per file, keeping the most recent session that touched it', () => {
    const rows = buildArtifactRows([
      session({ path: 'C:/old.jsonl', lastEventAt: '2026-08-01T00:00:00Z', artifacts: [art('C:/a.ts')] }),
      session({ path: 'C:/new.jsonl', lastEventAt: '2026-08-28T00:00:00Z', artifacts: [art('C:/a.ts')] }),
    ], DEFAULTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionPath).toBe('C:/new.jsonl');
  });

  // A row with an empty time column reads as a broken list. The session's last
  // event is a real bound on when the file was touched, never later than it.
  it('falls back to the session time when the tool call carried none', () => {
    const rows = buildArtifactRows([session({ artifacts: [art('C:/a.ts', 'tool', null)] })], DEFAULTS);
    expect(rows[0].at).toBe('2026-08-28T11:00:00Z');
  });

  it('marks a file already kept, with the vault it went to', () => {
    const rows = buildArtifactRows(
      [session({ artifacts: [art('C:/notes/a.md')] })],
      withSaved('C:/NOTES/A.MD', 'ARCHIVE'),
    );
    expect(rows[0].saved?.vault).toBe('ARCHIVE');
  });

  it('leaves a file nobody kept unmarked', () => {
    const rows = buildArtifactRows([session({ artifacts: [art('C:/a.ts')] })], DEFAULTS);
    expect(rows[0].saved).toBeUndefined();
  });

  it('sorts newest first across sessions', () => {
    const rows = buildArtifactRows([
      session({ path: 'C:/1.jsonl', lastEventAt: '2026-08-01T00:00:00Z', artifacts: [art('C:/old.ts')] }),
      session({ path: 'C:/2.jsonl', lastEventAt: '2026-08-28T00:00:00Z', artifacts: [art('C:/new.ts')] }),
    ], DEFAULTS);
    expect(rows.map(r => r.path)).toEqual(['C:/new.ts', 'C:/old.ts']);
  });

  it('answers with an empty list when nothing was written', () => {
    expect(buildArtifactRows([session()], DEFAULTS)).toEqual([]);
    expect(buildArtifactRows([], DEFAULTS)).toEqual([]);
  });
});

describe('filterArtifactRows', () => {
  const rows = buildArtifactRows([session({
    artifacts: [art('C:/w/src/App.tsx'), art('C:/w/scratch/draft.md', 'shell')],
  })], withSaved('C:/w/src/App.tsx'));

  const f = (over: Partial<Parameters<typeof filterArtifactRows>[1]> = {}) =>
    filterArtifactRows(rows, { query: '', origin: 'all', savedOnly: false, ...over });

  it('shows everything by default', () => {
    expect(f()).toHaveLength(2);
  });

  it('separates a record from an inference', () => {
    expect(f({ origin: 'tool' }).map(r => r.path)).toEqual(['C:/w/src/App.tsx']);
    expect(f({ origin: 'shell' }).map(r => r.path)).toEqual(['C:/w/scratch/draft.md']);
  });

  it('searches the whole path, so a folder name finds a draft', () => {
    expect(f({ query: 'scratch' }).map(r => r.path)).toEqual(['C:/w/scratch/draft.md']);
    expect(f({ query: 'APP.TSX' })).toHaveLength(1);
    expect(f({ query: 'nothing here' })).toEqual([]);
  });

  it('narrows to what already went to memory', () => {
    expect(f({ savedOnly: true }).map(r => r.path)).toEqual(['C:/w/src/App.tsx']);
  });

  it('combines the filters rather than letting one win', () => {
    expect(f({ savedOnly: true, origin: 'shell' })).toEqual([]);
  });

  it('narrows to the markdown an agent wrote', () => {
    expect(f({ mdOnly: true }).map(r => r.path)).toEqual(['C:/w/scratch/draft.md']);
  });

  it('keeps the markdown filter combinable with the others', () => {
    expect(f({ mdOnly: true, origin: 'tool' })).toEqual([]);
    expect(f({ mdOnly: true, query: 'scratch' })).toHaveLength(1);
  });
});

describe('countMarkdown', () => {
  // The chip carries its number. Without it, a filter is a press that tells
  // you whether it was worth pressing.
  it('counts the markdown rows, and nothing that merely looks like one', () => {
    const rows = buildArtifactRows([session({
      artifacts: [art('C:/w/plan.md'), art('C:/w/task.md.metadata.json'), art('C:/w/App.tsx')],
    })], DEFAULTS);
    expect(countMarkdown(rows)).toBe(1);
  });
});

describe('countCapped', () => {
  // 42 of 211 real sessions hit the old ceiling and each showed 40 files as if
  // that were all of them. The number has to reach the screen.
  it('counts the sessions whose own file list stopped short', () => {
    expect(countCapped([
      session({ artifactsCapped: true }),
      session({ artifactsCapped: false }),
      session({ artifactsCapped: true }),
    ])).toBe(2);
  });

  it('is zero when every session listed all of its files', () => {
    expect(countCapped([session(), session()])).toBe(0);
  });
});

describe('documents — markdown written for a person', () => {
  /**
   * 🚨 The defect this exists to prevent, and it reached the screen once
   * (2026-09-09: « j'ai pas les 3 markdown dans ma fenêtre »). A single
   * working session writes half a dozen memory notes into the folder its
   * connector reads, and several sessions run at once — so ranked by recency
   * with those in, the newest markdown are ALWAYS the machine's own notes and
   * the document someone asked for is never on screen. It existed. It was
   * fifth.
   */
  const rows = (paths: string[]) => buildArtifactRows(
    [session({ artifacts: paths.map(p => art(p, 'tool', '2026-08-28T11:00:00Z')) })],
    DEFAULTS,
  );

  it('leaves out the agent\u2019s own notes, from the RECORD and not from the name', () => {
    const all = rows([
      'C:/w/proj/plan.md',
      'C:/mem/silence-is-not-doubt.md',
      'C:/w/proj/index.ts',
    ]);
    // Nothing in the NAME says which is a note — only the connector's document
    // list does, so that is what decides.
    const notes = notePathSet([{ path: 'C:/mem/silence-is-not-doubt.md' }]);
    expect(documentRows(all, notes).map(r => r.path)).toEqual(['C:/w/proj/plan.md']);
    // With no document list, nothing is a note and every markdown counts.
    expect(documentRows(all, notePathSet([])).map(r => r.path))
      .toEqual(['C:/w/proj/plan.md', 'C:/mem/silence-is-not-doubt.md']);
  });

  it('matches a note through Windows separators and case', () => {
    // 🪤 The same file arrives as `C:\\mem\\N.md` from one place and
    // `C:/mem/n.md` from another; a note missed over a backslash is a note
    // that lands in the tile.
    const all = rows(['C:\\mem\\Note.md']);
    expect(documentRows(all, notePathSet([{ path: 'C:/mem/note.md' }]))).toEqual([]);
  });

  it('counts and lists the SAME population', () => {
    // The tile shows `documents.length` and slices `documents`: one array, so
    // a number and a list that describe different things is not expressible.
    const all = rows(['C:/w/a.md', 'C:/w/b.md', 'C:/w/c.md', 'C:/w/d.md', 'C:/w/e.md']);
    const docs = documentRows(all, notePathSet([]));
    expect(docs.length).toBe(5);
    expect(recentDocuments(all, notePathSet([]), 4)).toEqual(docs.slice(0, 4));
  });

  it('keeps the newest, and never re-sorts', () => {
    const older = session({
      path: 'C:/old.jsonl', lastEventAt: '2026-08-27T10:00:00Z',
      artifacts: [art('C:/w/old.md', 'tool', '2026-08-27T10:00:00Z')],
    });
    const newer = session({
      path: 'C:/new.jsonl', lastEventAt: '2026-08-29T10:00:00Z',
      artifacts: [art('C:/w/new.md', 'tool', '2026-08-29T10:00:00Z')],
    });
    const all = buildArtifactRows([older, newer], DEFAULTS);
    expect(recentDocuments(all, notePathSet([]), 1).map(r => r.path)).toEqual(['C:/w/new.md']);
  });

  it('asks for none and gets none', () => {
    const all = rows(['C:/w/a.md']);
    expect(recentDocuments(all, notePathSet([]), 0)).toEqual([]);
    expect(recentDocuments(all, notePathSet([]), -3)).toEqual([]);
  });
});

describe('fileName', () => {
  it('is the file, whichever separator the OS handed back', () => {
    expect(fileName('C:/a/b/plan.md')).toBe('plan.md');
    expect(fileName('C:\\a\\b\\plan.md')).toBe('plan.md');
    // 🎭 Nothing to cut is not nothing: a bare name comes back as itself
    // rather than as an empty label on a button.
    expect(fileName('plan.md')).toBe('plan.md');
    expect(fileName('')).toBe('');
  });
});
