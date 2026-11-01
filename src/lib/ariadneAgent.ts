/**
 * What an agent may do in Ariadne (doc 149), as plain functions over the app's
 * own state and its own moves. Declared in `mnemo-plugin.json` › agentActions,
 * served by `AriadneAgentActions` while the window is open.
 *
 * Every move is the person's own control: an agent through the hub's open
 * (`goToSource`), a session, a note or a file through the panel's `show…` (the
 * same drawer, the same history), a tab through the tab bar, the drawer's
 * close and its back / forward arrows, the gear for the settings.
 *
 * Reached by voice (doc 149 §19): the orb plans a sentence without reading
 * Ariadne first, so every action that targets a thing takes it by the words a
 * person says (`lib/agentFind`) and still takes a path or an id.
 *
 * ⛔ Not exposed, on purpose (doc 93): keeping a file or a conversation in a
 * vault — nothing reaches memory without the person's press; the first-person
 * summary of a session — one model call; choosing a folder or resetting —
 * a dialog and a loss on the person's screen; pinning to the cockpit, exporting
 * a conversation and editing a note — the person's. A session's or a file's
 * CONTENT is never returned: facts (title, branch, last seen, counts, paths).
 *
 * Reads say only what the transcripts prove: « last seen », never « working ».
 * Refusals throw `CODE: reason`; a name that fits several things is refused
 * with them, never resolved on the first.
 */
import { isRecent, type DocState, type SessionState } from '@mnemosyne_os/agent-transcripts';
import { findNamed, type Named } from './agentFind';

export type AriadneTab = 'runs' | 'yours';
export const TABS: readonly AriadneTab[] = ['runs', 'yours'];
export type PanelStep = 'back' | 'forward';
export const PANEL_STEPS: readonly PanelStep[] = ['back', 'forward'];
/** How many rows a list may return: what the manifest declares as `limit`'s limits. */
export const LIST_LIMITS = { min: 1, max: 200, fallback: 30 } as const;

/** One agent as the hub shows it. */
export interface AgentView {
  id: string;
  name: string;
  /** A folder is chosen for it: without one, nothing of it is read. */
  connected: boolean;
  hasNotes: boolean;
  sessions: readonly SessionState[];
  docs: readonly DocState[];
  busy: boolean;
  error: string | null;
}

/** The app's state and its own moves, read fresh at every call. */
export interface AriadneAgentContext {
  agents: readonly AgentView[];
  openAgentId: string | null;
  tab: AriadneTab;
  panel: { kind: 'session' | 'note' | 'file'; file: string } | null;
  collisions: { groups: readonly { projectPath: string | null; branch: string | null; sessions: readonly SessionState[] }[]; unplaceable: number };
  agentOf: ReadonlyMap<SessionState, string>;
  goToSource: (id: string | null) => void;
  setTab: (tab: AriadneTab) => void;
  showSession: (path: string) => void;
  showNote: (path: string) => void;
  showFile: (path: string) => void;
  closePanel: () => void;
  /** The drawer's arrows: whether each can move, and the move itself. */
  canStep: { back: boolean; forward: boolean };
  stepPanel: (step: PanelStep) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

/** The shape `sdk.onAgentActions` takes. */
export type AgentHandlers = Record<string, (args: Record<string, unknown>) => unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const stem = (f: string) => f.replace(/\.[^.]+$/, '');

/** A whole number inside the bounds, the fallback when absent or unreadable. Never negative. */
export function clampLimit(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return LIST_LIMITS.fallback;
  return Math.min(LIST_LIMITS.max, Math.max(LIST_LIMITS.min, Math.floor(v)));
}

/**
 * Labels for a refusal: the name alone, and the path beside it when the name
 * repeats — harnesses bury many transcripts under one title, and a refusal
 * that lists « task, task » gives the repair call nothing to pick.
 */
function labelled<T>(items: readonly T[], name: (t: T) => string, path: (t: T) => string): string[] {
  const counts = new Map<string, number>();
  for (const t of items) counts.set(fold(name(t)), (counts.get(fold(name(t))) ?? 0) + 1);
  return items.map((t) => ((counts.get(fold(name(t))) ?? 0) > 1 ? `${name(t)} (${path(t)})` : name(t)));
}

/**
 * The one session a name designates: its path or id; else its title, its
 * project or its branch, by the words said (accents, case, articles ignored).
 * Several are refused with their titles, and their paths when titles repeat.
 */
export function findSession(sessions: readonly SessionState[], name: string): SessionState {
  const labels = labelled(sessions, (s) => s.title ?? s.file, (s) => s.path);
  const entries: Named<SessionState>[] = sessions.map((s, i) => ({
    item: s,
    ids: [s.path, ...(s.sessionId ? [s.sessionId] : [])],
    names: [s.title ?? '', s.projectPath ? baseName(s.projectPath) : '', s.branch ?? ''].filter(Boolean),
    label: labels[i],
  }));
  return findNamed(entries, name, { code: 'NO_SESSION', noun: 'session' });
}

/** The one note a name designates: its path, else its name or file name by the words said. */
export function findNote(docs: readonly DocState[], name: string): DocState {
  const labels = labelled(docs, (d) => d.name ?? stem(d.file), (d) => d.path);
  const entries: Named<DocState>[] = docs.map((d, i) => ({
    item: d,
    ids: [d.path],
    names: [d.name ?? '', stem(d.file)].filter(Boolean),
    label: labels[i],
  }));
  return findNamed(entries, name, { code: 'NO_NOTE', noun: 'note' });
}

/** A file an agent's sessions wrote, as the files pane lists it: one row per path, its last session's. */
export interface FileRow { path: string; origin: 'tool' | 'shell'; at: string | null; sessionPath: string; sessionTitle: string | null }

/** Every file the sessions wrote, deduplicated by path, the most recent session's row kept. */
export function filesOf(sessions: readonly SessionState[]): FileRow[] {
  const byPath = new Map<string, FileRow>();
  const ordered = [...sessions].sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));
  for (const s of ordered) {
    for (const a of s.artifacts) {
      if (!byPath.has(a.path)) byPath.set(a.path, { path: a.path, origin: a.origin, at: a.at ?? s.lastEventAt, sessionPath: s.path, sessionTitle: s.title });
    }
  }
  return [...byPath.values()];
}

/** The one file a name designates: its path, else its file name by the words said. */
export function findFile(files: readonly FileRow[], name: string): FileRow {
  const labels = labelled(files, (f) => baseName(f.path), (f) => f.path);
  const entries: Named<FileRow>[] = files.map((f, i) => ({
    item: f,
    ids: [f.path],
    names: [baseName(f.path), stem(baseName(f.path))],
    label: labels[i],
  }));
  return findNamed(entries, name, { code: 'NO_FILE', noun: 'file' });
}

/** The one agent a name designates: its id, else its name (« claude code », « antigravity »). */
export function findAgent(agents: readonly AgentView[], name: string): AgentView {
  const entries: Named<AgentView>[] = agents.map((a) => ({ item: a, ids: [a.id], names: [a.name, a.id], label: a.name }));
  return findNamed(entries, name, { code: 'NO_AGENT', noun: 'agent' });
}

function sessionLine(s: SessionState, now: number) {
  return {
    path: s.path,
    title: s.title,
    ...(s.projectPath ? { project: s.projectPath } : {}),
    ...(s.branch ? { branch: s.branch } : {}),
    ...(s.model ? { model: s.model } : {}),
    // A fact, never « working »: an idle agent and a dead one fall silent the same way.
    lastSeen: s.lastEventAt,
    recent: isRecent(s, now),
    ...(s.isSidechain ? { sidechain: true } : {}),
    files: s.artifacts.length,
    ...(s.artifactsCapped ? { filesCapped: true } : {}),
  };
}

/** The handlers `sdk.onAgentActions` serves. `get` returns the app as it is at the call. */
export function ariadneAgentHandlers(get: () => AriadneAgentContext, now: () => number = Date.now): AgentHandlers {
  /** The agent named, or the one on screen. Refused when it is unknown or has no folder. */
  const agentOf = (ctx: AriadneAgentContext, v: unknown): AgentView => {
    const ref = str(v);
    let agent: AgentView | undefined;
    if (ref) agent = findAgent(ctx.agents, ref);
    else {
      if (!ctx.openAgentId) throw new Error(`NO_AGENT: no agent is open; name one: ${ctx.agents.map((a) => a.name).join(', ')}`);
      agent = ctx.agents.find((a) => a.id === ctx.openAgentId);
      if (!agent) throw new Error(`NO_AGENT: the agent on screen is gone; agents: ${ctx.agents.map((a) => a.name).join(', ')}`);
    }
    if (!agent.connected) throw new Error(`NOT_CONNECTED: no folder is chosen for ${agent.name}; the person picks it in Ariadne`);
    return agent;
  };

  /** Shows an agent first when it is not the one on screen (its own panel and tab start fresh). */
  const bring = (ctx: AriadneAgentContext, agent: AgentView) => {
    if (ctx.openAgentId !== agent.id) ctx.goToSource(agent.id);
  };

  /** The session asked, or the last one seen (a sidechain is a sub-agent's, never « the last session »). */
  const pickSession = (agent: AgentView, ref: string): SessionState => {
    if (ref) return findSession(agent.sessions, ref);
    const last = agent.sessions
      .filter((s) => !s.isSidechain)
      .sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''))[0];
    if (!last) throw new Error(`NO_SESSION: ${agent.name} has no session yet`);
    return last;
  };

  // agent-actions:begin
  return {
    agents: () => {
      const ctx = get();
      const t = now();
      return ctx.agents.map((a) => ({
        id: a.id,
        name: a.name,
        connected: a.connected,
        ...(a.connected ? { sessions: a.sessions.length, recent: a.sessions.filter((s) => !s.isSidechain && isRecent(s, t)).length, notes: a.docs.length } : {}),
        ...(a.busy ? { reading: true } : {}),
        ...(a.error ? { error: a.error } : {}),
        ...(a.id === ctx.openAgentId ? { open: true } : {}),
      }));
    },

    sessions: (args) => {
      const ctx = get();
      const agent = agentOf(ctx, args.agent);
      const t = now();
      const query = fold(str(args.query));
      const list = agent.sessions
        .filter((s) => (args.recentOnly === true ? !s.isSidechain && isRecent(s, t) : true))
        .filter((s) => !query || fold(`${s.title ?? ''} ${s.projectPath ?? ''} ${s.branch ?? ''}`).includes(query))
        .sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));
      return { agent: agent.id, total: agent.sessions.length, matching: list.length, sessions: list.slice(0, clampLimit(args.limit)).map((s) => sessionLine(s, t)) };
    },

    notes: (args) => {
      const ctx = get();
      const agent = agentOf(ctx, args.agent);
      if (!agent.hasNotes) throw new Error(`NO_NOTES: ${agent.name} keeps no notes Ariadne can read`);
      const query = fold(str(args.query));
      const list = agent.docs
        .filter((d) => !query || fold(`${d.name ?? ''} ${d.file} ${d.description ?? ''}`).includes(query))
        .sort((a, b) => b.mtime - a.mtime);
      return {
        agent: agent.id,
        total: agent.docs.length,
        matching: list.length,
        notes: list.slice(0, clampLimit(args.limit)).map((d) => ({ path: d.path, name: d.name ?? d.file, ...(d.description ? { description: d.description } : {}), changed: new Date(d.mtime).toISOString() })),
      };
    },

    files: (args) => {
      const ctx = get();
      const agent = agentOf(ctx, args.agent);
      const query = fold(str(args.query));
      const all = filesOf(agent.sessions);
      const list = all.filter((f) => !query || fold(f.path).includes(query));
      // Paths and provenance only: a file's content never leaves through an action.
      return {
        agent: agent.id,
        total: all.length,
        matching: list.length,
        files: list.slice(0, clampLimit(args.limit)).map((f) => ({ path: f.path, origin: f.origin, at: f.at, session: f.sessionTitle ?? f.sessionPath })),
      };
    },

    collisions: () => {
      const ctx = get();
      return {
        // Two recent sessions on one branch: a commit from either picks up the other's staged work.
        shared: ctx.collisions.groups.map((g) => ({
          project: g.projectPath,
          branch: g.branch,
          sessions: g.sessions.map((s) => ({ path: s.path, title: s.title, agent: ctx.agentOf.get(s) ?? null, lastSeen: s.lastEventAt })),
        })),
        // Recent sessions whose harness records neither a project nor a branch: never placed, never dropped.
        unplaceable: ctx.collisions.unplaceable,
      };
    },

    openAgent: (args) => {
      const ctx = get();
      const agent = findAgent(ctx.agents, str(args.agent));
      ctx.goToSource(agent.id);
      return { agent: agent.id, name: agent.name, connected: agent.connected };
    },

    showHub: () => {
      const ctx = get();
      if (ctx.openAgentId === null) return { hub: true, already: true };
      ctx.goToSource(null);
      return { hub: true };
    },

    openSession: (args) => {
      const ctx = get();
      const agent = agentOf(ctx, args.agent);
      const s = pickSession(agent, str(args.session));
      bring(ctx, agent);
      ctx.showSession(s.path);
      return { ...sessionLine(s, now()), shown: true, humanTurns: s.humanTurns.length };
    },

    openNote: (args) => {
      const ctx = get();
      const agent = agentOf(ctx, args.agent);
      if (!agent.hasNotes) throw new Error(`NO_NOTES: ${agent.name} keeps no notes Ariadne can read`);
      const d = findNote(agent.docs, str(args.note));
      bring(ctx, agent);
      ctx.showNote(d.path);
      return { path: d.path, name: d.name ?? d.file, shown: true, body: d.body.slice(0, 4000), ...(d.body.length > 4000 ? { bodyCut: d.body.length } : {}) };
    },

    openFile: (args) => {
      const ctx = get();
      const agent = agentOf(ctx, args.agent);
      const f = findFile(filesOf(agent.sessions), str(args.file));
      bring(ctx, agent);
      ctx.showFile(f.path);
      // The drawer shows the file; the result names it, never carries it.
      return { path: f.path, origin: f.origin, at: f.at, session: f.sessionTitle ?? f.sessionPath, shown: true };
    },

    showTab: (args) => {
      const ctx = get();
      const tab = str(args.tab) as AriadneTab;
      if (!(TABS as readonly string[]).includes(tab)) throw new Error(`BAD_ARG: tab is one of ${TABS.join(', ')}`);
      const agent = agentOf(ctx, args.agent);
      if (tab === 'yours' && !agent.hasNotes) throw new Error(`NO_NOTES: ${agent.name} has no notes tab`);
      bring(ctx, agent);
      ctx.setTab(tab);
      return { agent: agent.id, tab };
    },

    stepPanel: (args) => {
      const ctx = get();
      const step = (str(args.step) || 'back') as PanelStep;
      if (!(PANEL_STEPS as readonly string[]).includes(step)) throw new Error(`BAD_ARG: step is one of ${PANEL_STEPS.join(', ')}`);
      if (!ctx.canStep[step]) throw new Error(`NOTHING_${step === 'back' ? 'BEHIND' : 'AHEAD'}: the side panel has nothing to go ${step} to`);
      ctx.stepPanel(step);
      return { step };
    },

    closePanel: () => {
      const ctx = get();
      if (!ctx.panel) return { closed: true, already: true };
      ctx.closePanel();
      return { closed: true };
    },

    showSettings: (args) => {
      const ctx = get();
      const open = args.open !== false;
      if (ctx.settingsOpen === open) return { settings: open, already: true };
      ctx.setSettingsOpen(open);
      return { settings: open };
    },
  };
  // agent-actions:end
}
