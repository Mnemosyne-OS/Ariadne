/**
 * Ariadne's agent handlers (doc 149): a title or a note name that several
 * share is refused with their paths, an agent without a folder is refused by
 * name, and every move goes through the control the person uses.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DocState, SessionState } from '@mnemosyne_os/agent-transcripts';
import { ariadneAgentHandlers, clampLimit, filesOf, findAgent, findFile, findNote, findSession, type AgentView, type AriadneAgentContext } from './ariadneAgent';

const NOW = Date.parse('2026-10-12T20:00:00Z');
const session = (path: string, title: string | null, lastEventAt: string, over: Partial<SessionState> = {}): SessionState => ({
  file: path.split('/').pop()!, path, sessionId: null, title, model: null, projectPath: '/repo', branch: 'main', isSidechain: false,
  lastEventAt, firstEventAt: lastEventAt, tool: null, sizeBytes: 1, artifacts: [], artifactsCapped: false, humanTurns: [], tokens: null, ...over,
});
const doc = (path: string, name: string | null): DocState => ({ file: path.split('/').pop()!, path, name, description: null, type: null, links: [], body: 'x'.repeat(5000), sizeBytes: 1, mtime: 0 });

const sessions = [
  session('/c/a.jsonl', 'Fix the map', '2026-10-12T19:58:00Z', {
    artifacts: [{ path: '/repo/README.md', origin: 'tool', at: '2026-10-12T19:50:00Z' }, { path: '/repo/docs/plan.md', origin: 'shell', at: null }],
  }),
  session('/c/b.jsonl', 'task', '2026-10-10T10:00:00Z'),
  session('/c/c.jsonl', 'Task', '2026-10-11T10:00:00Z'),
];
const docs = [doc('/m/one.md', 'One'), doc('/m/a/task.md', null), doc('/m/b/task.md', null)];

function agent(over: Partial<AgentView> = {}): AgentView {
  return { id: 'claude-code', name: 'Claude Code', connected: true, hasNotes: true, sessions, docs, busy: false, error: null, ...over };
}

function ctx(over: Partial<AriadneAgentContext> = {}): AriadneAgentContext {
  return {
    agents: [agent(), agent({ id: 'antigravity', name: 'Antigravity', connected: false, sessions: [], docs: [] })],
    openAgentId: 'claude-code',
    tab: 'runs',
    panel: null,
    collisions: { groups: [], unplaceable: 0 },
    agentOf: new Map(),
    goToSource: vi.fn(),
    setTab: vi.fn(),
    showSession: vi.fn(),
    showNote: vi.fn(),
    showFile: vi.fn(),
    closePanel: vi.fn(),
    canStep: { back: true, forward: false },
    stepPanel: vi.fn(),
    settingsOpen: false,
    setSettingsOpen: vi.fn(),
    ...over,
  };
}
const run = (c: AriadneAgentContext) => ariadneAgentHandlers(() => c, () => NOW);

describe('clampLimit', () => {
  it('never returns a negative, a zero or a fraction', () => {
    expect(clampLimit(-1)).toBe(1);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(7.8)).toBe(7);
    expect(clampLimit(1e6)).toBe(200);
    expect(clampLimit('5')).toBe(30);
  });
});

describe('findSession', () => {
  it('takes a path exactly, a title without case, and the words a person says', () => {
    expect(findSession(sessions, '/c/b.jsonl').path).toBe('/c/b.jsonl');
    expect(findSession(sessions, 'fix THE map').path).toBe('/c/a.jsonl');
    expect(findSession(sessions, 'la session map').path).toBe('/c/a.jsonl');
  });
  it('refuses a title two sessions share, with their paths, and a label read back resolves', () => {
    expect(() => findSession(sessions, 'task')).toThrow('AMBIGUOUS: "task" names several sessions: task (/c/b.jsonl), Task (/c/c.jsonl); say which');
    expect(findSession(sessions, 'Task (/c/c.jsonl)').path).toBe('/c/c.jsonl');
    expect(() => findSession(sessions, 'nope')).toThrow(/^NO_SESSION: no session named "nope"; sessions: Fix the map, task/);
  });
});

describe('findNote', () => {
  it('refuses a file name two notes share, with their paths', () => {
    expect(findNote(docs, 'one').path).toBe('/m/one.md');
    expect(() => findNote(docs, 'task')).toThrow(/^AMBIGUOUS: .*\/m\/a\/task\.md.*\/m\/b\/task\.md/);
    expect(findNote(docs, 'la note one').path).toBe('/m/one.md');
    expect(() => findNote(docs, 'zzz')).toThrow(/^NO_NOTE/);
  });
});

describe('the handlers', () => {
  it('agents: says recent, never working, and nothing of an unconnected agent', () => {
    const r = run(ctx()).agents({}) as Record<string, unknown>[];
    expect(r[0]).toMatchObject({ id: 'claude-code', connected: true, sessions: 3, recent: 1, open: true });
    expect(r[1]).toEqual({ id: 'antigravity', name: 'Antigravity', connected: false });
  });

  it('sessions: last seen first, bounded, refused for an agent without a folder', () => {
    const r = run(ctx()).sessions({ limit: 2 }) as { matching: number; sessions: { path: string }[] };
    expect(r.matching).toBe(3);
    expect(r.sessions.map((s) => s.path)).toEqual(['/c/a.jsonl', '/c/c.jsonl']);
    expect((run(ctx()).sessions({ recentOnly: true }) as { matching: number }).matching).toBe(1);
    expect(() => run(ctx()).sessions({ agent: 'antigravity' })).toThrow(/^NOT_CONNECTED/);
    expect(() => run(ctx()).sessions({ agent: 'cursor' })).toThrow(/^NO_AGENT: no agent named "cursor"; agents: Claude Code, Antigravity/);
    expect((run(ctx()).sessions({ agent: 'claude code' }) as { agent: string }).agent).toBe('claude-code');
    expect(() => run(ctx({ openAgentId: null })).sessions({})).toThrow(/^NO_AGENT/);
  });

  it('openSession opens the panel, and brings its agent first when another is on screen', () => {
    const c = ctx();
    run(c).openSession({ session: 'Fix the map' });
    expect(c.goToSource).not.toHaveBeenCalled();
    expect(c.showSession).toHaveBeenCalledWith('/c/a.jsonl');
    const away = ctx({ openAgentId: null });
    run(away).openSession({ agent: 'claude-code', session: '/c/b.jsonl' });
    expect(away.goToSource).toHaveBeenCalledWith('claude-code');
    const amb = ctx();
    expect(() => run(amb).openSession({ session: 'task' })).toThrow(/^AMBIGUOUS/);
    expect(amb.showSession).not.toHaveBeenCalled();
  });

  it('openNote opens the panel and returns a bounded text', () => {
    const c = ctx();
    const r = run(c).openNote({ note: 'One' }) as { body: string; bodyCut: number };
    expect(c.showNote).toHaveBeenCalledWith('/m/one.md');
    expect(r.body).toHaveLength(4000);
    expect(r.bodyCut).toBe(5000);
    expect(() => run(ctx({ agents: [agent({ hasNotes: false })] })).openNote({ note: 'One' })).toThrow(/^NO_NOTES/);
  });

  it('showTab refuses the notes tab of an agent that keeps none', () => {
    const c = ctx();
    run(c).showTab({ tab: 'yours' });
    expect(c.setTab).toHaveBeenCalledWith('yours');
    const none = ctx({ agents: [agent({ hasNotes: false })] });
    expect(() => run(none).showTab({ tab: 'yours' })).toThrow(/^NO_NOTES/);
    expect(none.setTab).not.toHaveBeenCalled();
    expect(() => run(c).showTab({ tab: 'files' })).toThrow(/^BAD_ARG/);
  });

  it('closePanel closes the drawer through its own close', () => {
    const c = ctx({ panel: { kind: 'session', file: '/c/a.jsonl' } });
    run(c).closePanel({});
    expect(c.closePanel).toHaveBeenCalledOnce();
  });

  it('openSession without a session opens the last one seen', () => {
    const c = ctx();
    run(c).openSession({});
    expect(c.showSession).toHaveBeenCalledWith('/c/a.jsonl');
    expect(() => run(ctx({ agents: [agent({ sessions: [] })] })).openSession({})).toThrow(/^NO_SESSION/);
  });

  it('openAgent takes the name said, and refuses one that fits two agents', () => {
    const c = ctx();
    expect(run(c).openAgent({ agent: 'Antigravity' })).toMatchObject({ agent: 'antigravity', connected: false });
    expect(c.goToSource).toHaveBeenCalledWith('antigravity');
    const two = ctx({ agents: [agent(), agent({ id: 'claude-desktop', name: 'Claude Desktop' })] });
    expect(() => run(two).openAgent({ agent: 'claude' })).toThrow('AMBIGUOUS: "claude" names several agents: Claude Code, Claude Desktop; say which');
    expect(two.goToSource).not.toHaveBeenCalled();
  });

  it('showHub goes back to the list of agents', () => {
    const c = ctx();
    run(c).showHub({});
    expect(c.goToSource).toHaveBeenCalledWith(null);
    expect(run(ctx({ openAgentId: null })).showHub({})).toMatchObject({ already: true });
  });

  it('files lists paths, never content; openFile opens one by its name and refuses two', () => {
    const r = run(ctx()).files({}) as { total: number; files: Record<string, unknown>[] };
    expect(r.total).toBe(2);
    expect(Object.keys(r.files[0]).sort()).toEqual(['at', 'origin', 'path', 'session']);
    const c = ctx();
    expect(run(c).openFile({ file: 'le fichier readme' })).toMatchObject({ path: '/repo/README.md', shown: true });
    expect(c.showFile).toHaveBeenCalledWith('/repo/README.md');
    const twice = [
      { path: '/a/plan.md', origin: 'tool' as const, at: null, sessionPath: '/c/a.jsonl', sessionTitle: null },
      { path: '/b/plan.md', origin: 'tool' as const, at: null, sessionPath: '/c/a.jsonl', sessionTitle: null },
    ];
    expect(() => findFile(twice, 'plan')).toThrow('AMBIGUOUS: "plan" names several files: plan.md (/a/plan.md), plan.md (/b/plan.md); say which');
    const amb = ctx({ agents: [agent({ sessions: [session('/c/x.jsonl', 'x', '2026-10-12T19:00:00Z', { artifacts: twice.map((f) => ({ path: f.path, origin: f.origin, at: null })) })] })] });
    expect(() => run(amb).openFile({ file: 'plan' })).toThrow(/^AMBIGUOUS/);
    expect(amb.showFile).not.toHaveBeenCalled();
    expect(() => run(ctx()).openFile({ file: 'nothing' })).toThrow(/^NO_FILE: .*README\.md, plan\.md/);
  });

  it('filesOf keeps one row per path, from its most recent session', () => {
    const older = session('/c/old.jsonl', 'old', '2026-01-01T00:00:00Z', { artifacts: [{ path: '/repo/README.md', origin: 'shell', at: null }] });
    const rows = filesOf([older, ...sessions]);
    expect(rows.filter((r) => r.path === '/repo/README.md')).toEqual([expect.objectContaining({ sessionPath: '/c/a.jsonl', origin: 'tool' })]);
  });

  it('stepPanel moves through the arrows, and refuses a step with nothing there', () => {
    const c = ctx();
    run(c).stepPanel({});
    expect(c.stepPanel).toHaveBeenCalledWith('back');
    expect(() => run(c).stepPanel({ step: 'forward' })).toThrow(/^NOTHING_AHEAD/);
    expect(c.stepPanel).toHaveBeenCalledOnce();
    expect(() => run(c).stepPanel({ step: 'up' })).toThrow(/^BAD_ARG/);
  });

  it('showSettings opens and closes the gear, and says when it already was', () => {
    const c = ctx();
    run(c).showSettings({});
    expect(c.setSettingsOpen).toHaveBeenCalledWith(true);
    expect(run(ctx({ settingsOpen: true })).showSettings({ open: true })).toMatchObject({ already: true });
  });

  it('showTab brings the agent named first', () => {
    const c = ctx({ openAgentId: null });
    run(c).showTab({ tab: 'yours', agent: 'Claude Code' });
    expect(c.goToSource).toHaveBeenCalledWith('claude-code');
    expect(c.setTab).toHaveBeenCalledWith('yours');
  });
});

describe('findAgent', () => {
  it('takes an id or a name', () => {
    const list = [agent(), agent({ id: 'antigravity', name: 'Antigravity' })];
    expect(findAgent(list, 'claude-code').id).toBe('claude-code');
    expect(findAgent(list, "l'agent Claude Code").id).toBe('claude-code');
  });
});
