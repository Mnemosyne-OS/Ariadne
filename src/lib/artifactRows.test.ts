/**
 * The list that used to lie about its own length.
 *
 * It rendered 30 rows under a counter showing the true total, with nothing to
 * explain the gap. Every test here defends one of the three facts a row now
 * carries: which file, how it is known, and whether it already went to memory.
 */
import { describe, it, expect } from 'vitest';
import { buildArtifactRows, countCapped, countMarkdown, filterArtifactRows } from './artifactRows';
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
