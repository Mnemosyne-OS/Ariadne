import { describe, it, expect } from 'vitest';
import { rootAbove, deriveCandidates } from './siblings';
import type { Source } from './sources';

const src = (id: string, hint?: string): Source => ({
  id,
  sessions: {
    id, displayName: id, version: '1', format: 'jsonl', kind: 'session',
    filePattern: '.jsonl', fields: { timestamp: 'timestamp' },
    ...(hint ? { folderHint: hint } : {}),
  },
});

const AG = src('antigravity', '.gemini/antigravity/brain');
const IDE = src('antigravity-ide', '.gemini/antigravity-ide/brain');
const CC = src('claude-code', '.claude/projects');
const NOHINT = src('mystery');

describe('rootAbove', () => {
  it('strips the declared hint off the chosen folder', () => {
    expect(rootAbove('C:/Users/x/.gemini/antigravity/brain', '.gemini/antigravity/brain'))
      .toBe('C:/Users/x');
  });

  it('reads a Windows path', () => {
    expect(rootAbove('C:\\Users\\x\\.claude\\projects', '.claude/projects')).toBe('C:/Users/x');
  });

  it('ignores case, because Windows does', () => {
    expect(rootAbove('C:/Users/x/.Claude/Projects', '.claude/projects')).toBe('C:/Users/x');
  });

  it('tolerates a trailing separator', () => {
    expect(rootAbove('C:/Users/x/.claude/projects/', '.claude/projects')).toBe('C:/Users/x');
  });

  it('derives nothing when the folder does not end with the hint', () => {
    expect(rootAbove('D:/somewhere/else', '.claude/projects')).toBeNull();
  });

  it('derives nothing from an empty hint', () => {
    expect(rootAbove('C:/Users/x', '')).toBeNull();
  });
});

describe('deriveCandidates', () => {
  it('finds the IDE twin once the standalone agent is connected', () => {
    const c = deriveCandidates([AG, IDE], { antigravity: 'C:/Users/x/.gemini/antigravity/brain' });
    expect(c).toEqual([{
      sourceId: 'antigravity-ide',
      path: 'C:/Users/x/.gemini/antigravity-ide/brain',
      fromSourceId: 'antigravity',
    }]);
  });

  it('works the other way round too', () => {
    const c = deriveCandidates([AG, IDE], { 'antigravity-ide': 'C:/Users/x/.gemini/antigravity-ide/brain' });
    expect(c.map(x => x.path)).toEqual(['C:/Users/x/.gemini/antigravity/brain']);
  });

  it('derives an unrelated agent from the same home', () => {
    const c = deriveCandidates([CC, AG], { 'claude-code': 'C:/Users/x/.claude/projects' });
    expect(c.map(x => x.path)).toEqual(['C:/Users/x/.gemini/antigravity/brain']);
  });

  it('proposes nothing for an agent already connected', () => {
    const c = deriveCandidates([AG, IDE], {
      antigravity: 'C:/Users/x/.gemini/antigravity/brain',
      'antigravity-ide': 'C:/Users/x/.gemini/antigravity-ide/brain',
    });
    expect(c).toEqual([]);
  });

  it('proposes nothing when nothing is connected yet', () => {
    expect(deriveCandidates([AG, IDE], {})).toEqual([]);
  });

  it('derives nothing from a folder the human pointed somewhere unexpected', () => {
    // They are free to point anywhere; a folder that does not match the hint
    // simply tells us nothing about where anything else lives.
    const c = deriveCandidates([AG, IDE], { antigravity: 'D:/backup/transcripts' });
    expect(c).toEqual([]);
  });

  it('skips a source that declares no hint', () => {
    const c = deriveCandidates([AG, NOHINT], { antigravity: 'C:/Users/x/.gemini/antigravity/brain' });
    expect(c).toEqual([]);
  });

  it('never proposes the folder it was derived from', () => {
    const twin = src('twin', '.gemini/antigravity/brain');   // same hint as AG
    const c = deriveCandidates([AG, twin], { antigravity: 'C:/Users/x/.gemini/antigravity/brain' });
    expect(c).toEqual([]);
  });

  it('gives at most one candidate per source', () => {
    const c = deriveCandidates([CC, AG, IDE], {
      'claude-code': 'C:/Users/x/.claude/projects',
      antigravity: 'C:/Users/x/.gemini/antigravity/brain',
    });
    expect(c).toHaveLength(1);
    expect(c[0].sourceId).toBe('antigravity-ide');
  });
});
