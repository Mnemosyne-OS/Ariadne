import { describe, it, expect } from 'vitest';
import { groupWrittenFiles } from './writtenFiles';
import type { Artifact, DocState } from '@mnemosyne_os/agent-transcripts';

const art = (path: string, origin: Artifact['origin'] = 'tool'): Artifact => ({ path, origin, at: null });

const doc = (path: string): DocState => ({
  file: path.split(/[\\/]/).pop() ?? path,
  path,
  name: null, description: null, type: null, links: [],
  body: '', sizeBytes: 0, mtime: 0,
});

const MEM = 'C:/Users/x/.claude/projects/proj/memory';

describe('groupWrittenFiles', () => {
  it('puts markdown first, the agent notes next, everything else last', () => {
    const groups = groupWrittenFiles(
      [art('C:/w/scratchpad/run.py'), art(`${MEM}/idea.md`), art('C:/w/docs/plan.md')],
      [doc(`${MEM}/idea.md`)],
    );
    expect(groups.map(g => g.band)).toEqual(['markdown', 'notes', 'other']);
    expect(groups[0].rows.map(r => r.artifact.path)).toEqual(['C:/w/docs/plan.md']);
    expect(groups[1].rows.map(r => r.artifact.path)).toEqual([`${MEM}/idea.md`]);
    expect(groups[2].rows.map(r => r.artifact.path)).toEqual(['C:/w/scratchpad/run.py']);
  });

  it('carries the note itself, so the row can open the note panel', () => {
    const groups = groupWrittenFiles([art(`${MEM}/idea.md`)], [doc(`${MEM}/idea.md`)]);
    expect(groups[0].rows[0].note?.path).toBe(`${MEM}/idea.md`);
  });

  it('matches a note across separators and case, which is how paths arrive', () => {
    const groups = groupWrittenFiles(
      [art(`${MEM.replace(/\//g, '\\')}\\Idea.MD`)],
      [doc(`${MEM}/idea.md`)],
    );
    expect(groups[0].band).toBe('notes');
  });

  it('calls markdown a note only when the document folder actually holds it', () => {
    // The separation is a RECORD, never a guess about who a file was for. A
    // markdown file the connector never read is markdown, full stop.
    const groups = groupWrittenFiles([art('C:/w/notes/looks-like-a-note.md')], []);
    expect(groups.map(g => g.band)).toEqual(['markdown']);
    expect(groups[0].rows[0].note).toBe(null);
  });

  it('keeps the order the session wrote them in, inside a band', () => {
    const groups = groupWrittenFiles(
      [art('C:/w/b.md'), art('C:/w/a.md'), art('C:/w/c.md')],
      [],
    );
    expect(groups[0].rows.map(r => r.artifact.path)).toEqual(['C:/w/b.md', 'C:/w/a.md', 'C:/w/c.md']);
  });

  it('drops an empty band rather than painting a heading over nothing', () => {
    expect(groupWrittenFiles([art('C:/w/run.py')], []).map(g => g.band)).toEqual(['other']);
    expect(groupWrittenFiles([], [])).toEqual([]);
  });

  it('loses no file: every artifact lands in exactly one band', () => {
    const files = [art('C:/w/a.md'), art(`${MEM}/n.md`), art('C:/w/x.ts'), art('C:/w/y.py')];
    const groups = groupWrittenFiles(files, [doc(`${MEM}/n.md`)]);
    const flat = groups.flatMap(g => g.rows.map(r => r.artifact.path));
    expect(flat).toHaveLength(files.length);
    expect(new Set(flat).size).toBe(files.length);
  });

  it('keeps the origin, so a shell-derived path stays marked as an inference', () => {
    const groups = groupWrittenFiles([art('C:/w/a.md', 'shell')], []);
    expect(groups[0].rows[0].artifact.origin).toBe('shell');
  });
});
