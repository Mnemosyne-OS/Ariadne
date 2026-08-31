/**
 * Ariadne — one dashboard over what the coding agents on this machine wrote.
 * Doc 93.
 *
 * Reads only what the harness already writes, so a crashed agent still reports
 * truthfully by falling silent. Nothing here ever renders "working": that is
 * unprovable, and a dead agent and an idle one produce the same silence. We
 * render the fact we can prove, "last seen X ago", and let the human conclude.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MnemoCartridgeSDK, onHostConfig } from './sdk/mnemo-sdk';
import {
  readSession, readDoc, walkSource, activeDirs, shouldSweep, collisionReport, liveSessions,
  type SessionState, type DocState, type DirEntry,
} from '@mnemosyne_os/agent-transcripts';
import { SOURCES, sourceById, type Source } from './lib/sources';
import {
  loadSettings, saveSettings, resetSettings, rememberSaved, rememberEdited, savedKey,
  type SavedMark, type Settings,
} from './lib/settings';
import { editMark, lastAgentTouch } from './lib/handEdits';
import { buildArtifactRows } from './lib/artifactRows';
import {
  EMPTY_HISTORY, canGoBack, canGoForward, currentPanel, goBack, goForward, navigate, trail,
  type PanelRef,
} from './lib/panelHistory';
import { baseName, sessionLabel } from './lib/format';
import type { ScanStats } from './lib/shared';
import { deriveCandidates, type Candidate } from './lib/siblings';
import { renderMarkdown } from './lib/markdown';
import { dictFor, type Dict } from './i18n';
import Hub, { type SourceStatus } from './views/Hub';
import Dashboard from './views/Dashboard';
import NotesTab from './views/NotesTab';
import Drawer from './views/Drawer';
import SessionDetail from './views/SessionDetail';
import FileDetail from './views/FileDetail';
import FileEditor from './views/FileEditor';
import EditBadge from './views/EditBadge';
import SettingsView from './views/SettingsView';
import CompactView from './views/CompactView';
import { ConsentCard } from './views/FolderGate';

const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/ariadne');

const POLL_MS = 5000;
/** Sessions whose fingerprint changed are re-read; this caps how many of them
 *  we pull in one pass so a first run on a large folder stays responsive. */
const MAX_SESSION_READS = 12;
/** Below this canvas zoom the normal layout is unreadable, so we render the
 *  headline instead. Unknown zoom renders the normal view — never a degraded
 *  one on a guess. */
const COMPACT_BELOW_ZOOM = 0.6;

interface SourceData {
  sessions: SessionState[];
  docs: DocState[];
  stats: ScanStats | null;
  busy: boolean;
  error: string | null;
}

const EMPTY: SourceData = { sessions: [], docs: [], stats: null, busy: false, error: null };

export default function App(): JSX.Element {
  const [t, setT] = useState<Dict>(() => dictFor(navigator.language));
  const [lang, setLang] = useState<string>(() => navigator.language || 'en');
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  /** null = the hub. Otherwise the source being looked at. */
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [tab, setTab] = useState<'runs' | 'yours'>('runs');
  // ONE panel for the whole app. A session and a note used to open in
  // different places, so where a thing appeared depended on what you clicked.
  // Identified by PATH. A buried agent names every transcript the same, and
  // task.md repeats across sessions, so a file name identifies nothing.
  // A HISTORY, not a single ref: everything in the panel links to everything
  // else, and following a link used to be a one-way trip (see lib/panelHistory).
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const panel = currentPanel(history);
  /** Editing the file the panel is showing. Reset on every navigation: an
   *  editor still open over the NEXT file would write one file's text into
   *  another's path. */
  const [editing, setEditing] = useState(false);

  const [data, setData] = useState<Record<string, SourceData>>({});
  /** Twin agents found next to one already connected, offered in the chooser. */
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  /** Per source, keyed "<sourceId>|<path>": the fingerprint "size:mtime" of a
   *  file already read, and what it parsed to. Keyed by SOURCE, not by path
   *  alone: two agents pointed at the same folder would otherwise hand each
   *  other entries parsed with the wrong connector. */
  const seen = useRef(new Map<string, string>());
  /** Per source: the session directories a pass found files in, and when the
   *  last full sweep ran. A buried layout costs one listing per session, so a
   *  cheap pass revisits only what was recently active (see lib/walk). */
  const activeBySource = useRef(new Map<string, string[]>());
  const lastSweep = useRef(new Map<string, number>());
  const sessionCache = useRef(new Map<string, SessionState>());
  const docCache = useRef(new Map<string, DocState>());

  // Inherits the shell's theme and design tokens, follows its language, and
  // learns the canvas zoom it is painted at (which it cannot measure itself).
  useEffect(() => onHostConfig(cfg => {
    if (cfg?.lang) { setT(dictFor(cfg.lang)); setLang(cfg.lang); }
    if (typeof cfg?.zoom === 'number') setZoom(cfg.zoom);
  }), []);

  /**
   * Forget everything read for one agent.
   *
   * Its walk memory goes too: keeping it would send the next cheap pass to the
   * directories of the FOLDER THAT WAS JUST REPLACED, and nothing would appear
   * until the sweep timer came round a minute later.
   */
  const forgetSource = useCallback((sourceId: string) => {
    const mine = `${sourceId}|`;
    for (const k of [...seen.current.keys()]) if (k.startsWith(mine)) seen.current.delete(k);
    for (const k of [...sessionCache.current.keys()]) if (k.startsWith(mine)) sessionCache.current.delete(k);
    for (const k of [...docCache.current.keys()]) if (k.startsWith(mine)) docCache.current.delete(k);
    activeBySource.current.delete(sourceId);
    lastSweep.current.delete(sourceId);
  }, []);

  /**
   * Move to an agent, or back to the hub.
   *
   * The tab and the open panel belong to the agent you were looking at: kept
   * across a switch, you land on the wrong tab with a drawer open on a session
   * the new agent has never heard of.
   */
  const goToSource = useCallback((sourceId: string | null) => {
    setOpenSourceId(sourceId);
    setTab('runs');
    setHistory(EMPTY_HISTORY);
  }, []);

  const forgetEverything = useCallback(() => {
    seen.current.clear();
    sessionCache.current.clear();
    docCache.current.clear();
    activeBySource.current.clear();
    lastSweep.current.clear();
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const scan = useCallback(async (source: Source, root: string) => {
    setData(d => ({ ...d, [source.id]: { ...(d[source.id] ?? EMPTY), busy: true, error: null } }));
    try {
      const now = Date.now();
      const sweep = shouldSweep(lastSweep.current.get(source.id) ?? null, now);
      const { sessionFiles, noteFiles, entries } = await walkSource(
        (dirPath) => sdk.invoke<{ success: boolean; files?: DirEntry[]; error?: string }>(
          'dialog.readDir', { dirPath }),
        root, source.sessions, source.notes,
        { sweep, knownDirs: activeBySource.current.get(source.id) },
      );
      if (sweep) lastSweep.current.set(source.id, now);

      // Newest first: mtime comes free with the listing, so recency costs no
      // file reads at all. Only what actually moved is opened.
      sessionFiles.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
      noteFiles.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));

      let readError: string | null = null;
      const read = async (f: DirEntry): Promise<string | null> => {
        const res = await sdk.invoke<{ success: boolean; content?: string; error?: string }>(
          'dialog.readFile', { filePath: f.path });
        if (!res?.success || typeof res.content !== 'string') {
          // Never swallow this. A silently skipped read looks exactly like an
          // empty folder, and that is how a host-side refusal (an extension
          // the bridge will not open, a file too large) stayed invisible.
          if (!readError) readError = res?.error ?? 'read refused';
          console.warn(`[Ariadne] read refused for ${f.name}: ${readError}`);
          return null;
        }
        return res.content;
      };

      const key = (path: string) => `${source.id}|${path}`;

      let reads = 0;
      for (const f of sessionFiles) {
        const print = `${f.sizeBytes ?? 0}:${f.mtime ?? 0}`;
        if (seen.current.get(key(f.path)) === print && sessionCache.current.has(key(f.path))) continue;
        if (reads >= MAX_SESSION_READS) break;
        reads++;
        const content = await read(f);
        if (content === null) continue;
        const st = readSession(source.sessions, f.name, f.path, content, f.sizeBytes ?? 0);
        if (st && !st.title) {
          const sessionDir = f.path.replace(/\\/g, '/').split('/').slice(0, -3).join('/');
          for (const noteName of ['task.md', 'implementation_plan.md', 'walkthrough.md']) {
            const metaPath = `${sessionDir}/${noteName}.metadata.json`;
            const res = await sdk.invoke<{ success: boolean; content?: string }>(
              'dialog.readFile', { filePath: metaPath });
            if (res?.success && typeof res.content === 'string') {
              try {
                const meta = JSON.parse(res.content) as { summary?: string };
                if (meta.summary?.trim()) {
                  st.title = meta.summary.trim();
                  break;
                }
              } catch {
                // Ignore parse error
              }
            }
          }
        }
        seen.current.set(key(f.path), print);
        if (st) sessionCache.current.set(key(f.path), st);
      }

      // Notes are small and few; reading all of them in one pass is cheap and
      // spares the user a list that fills in over several ticks.
      if (source.notes) {
        for (const f of noteFiles) {
          const print = `${f.sizeBytes ?? 0}:${f.mtime ?? 0}`;
          if (seen.current.get(key(f.path)) === print && docCache.current.has(key(f.path))) continue;
          const content = await read(f);
          if (content === null) continue;
          // The sidecar is best-effort: it carries the description, and a
          // document with none still belongs in the list.
          let sidecar: string | null = null;
          if (source.notes.sidecar) {
            const res = await sdk.invoke<{ success: boolean; content?: string }>(
              'dialog.readFile', { filePath: f.path + source.notes.sidecar.suffix });
            if (res?.success && typeof res.content === 'string') sidecar = res.content;
          }
          seen.current.set(key(f.path), print);
          docCache.current.set(key(f.path), readDoc(
            source.notes, f.name, f.path, content, f.sizeBytes ?? 0, f.mtime ?? 0, sidecar));
        }
      }

      // A cheap pass visits fewer directories than a sweep, so the FILES it
      // returns are a subset. Rendering only those would make the list shrink
      // and grow every five seconds; the cache is the full picture, and the
      // pass only refreshes part of it.
      const mine = `${source.id}|`;
      const sessions = [...sessionCache.current.entries()]
        .filter(([k]) => k.startsWith(mine))
        .map(([, v]) => v)
        .sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));
      activeBySource.current.set(source.id, activeDirs(sessionFiles, source.sessions));

      const docs = [...docCache.current.entries()]
        .filter(([k]) => k.startsWith(mine))
        .map(([, v]) => v)
        .sort((a, b) => b.mtime - a.mtime);

      // Files were found but none could be opened: that is a refusal, not an
      // empty folder, and it must say so rather than render a blank screen.
      const found = sessionFiles.length + noteFiles.length;
      const failed = readError && sessions.length + docs.length === 0 && found > 0;

      setData(d => ({
        ...d,
        [source.id]: {
          sessions, docs, busy: false,
          stats: { entries, sessionFiles: sessionFiles.length, noteFiles: noteFiles.length },
          error: failed ? readError : null,
        },
      }));
    } catch (err) {
      console.error(`[Ariadne] scan failed for ${source.id}:`, err);
      setData(d => ({
        ...d,
        [source.id]: {
          ...(d[source.id] ?? EMPTY),
          busy: false,
          error: err instanceof Error ? err.message : t.error,
        },
      }));
    }
  }, [t.error]);

  /**
   * A twin agent, offered once its sibling is connected.
   *
   * The previous version of this probed each connector's `folderHint` directly.
   * It could never fire: a hint is HOME-RELATIVE, and the bridge resolves a
   * relative path against the main process's working directory, so it looked
   * for `<repo>/.gemini/antigravity/brain` and found nothing — silently.
   *
   * It must not be fixed by teaching the bridge to resolve home-relative paths
   * either: `dialog:open` already reads any absolute path under the home, so
   * the only thing keeping a cartridge out of `~/.ssh` is not knowing where it
   * is. Instead the candidate is DERIVED from a folder the human already gave
   * (see lib/siblings), probed with the absolute path that derivation yields,
   * and merely offered — connecting it stays a click.
   */
  useEffect(() => {
    let cancelled = false;
    const derived = deriveCandidates(SOURCES, settings.folders);
    if (derived.length === 0) { setCandidates([]); return; }

    const probe = async () => {
      const found: Candidate[] = [];
      for (const c of derived) {
        const res = await sdk.invoke<{ success: boolean; files?: DirEntry[] }>(
          'dialog.readDir', { dirPath: c.path });
        if (res?.success && res.files?.length) found.push(c);
      }
      if (!cancelled) setCandidates(found);
    };
    void probe();
    return () => { cancelled = true; };
  }, [settings.folders]);

  // Every configured source is polled, not only the one being looked at: the
  // hub shows live counts for all of them, and an unchanged file costs a
  // directory listing and no read.
  useEffect(() => {
    const configured = SOURCES.filter(s => settings.folders[s.id]);
    if (configured.length === 0) return;
    const run = () => { for (const s of configured) void scan(s, settings.folders[s.id]); };
    run();
    const id = window.setInterval(run, POLL_MS);
    return () => window.clearInterval(id);
  }, [settings.folders, scan]);

  const pick = useCallback(async (sourceId: string) => {
    const source = sourceById(sourceId);
    if (!source) return;
    // `folderHint` opens the picker where this agent usually writes, resolved
    // host-side against the home directory. It is a SUGGESTION, not an access:
    // the connector still cannot cause a read, and nothing is opened until the
    // human selects something (doc 93 §3).
    const chosen = await sdk.selectFolder({ startIn: source.sessions.folderHint });
    if (!chosen) return;                       // cancelled: keep the previous folder
    // Only THIS agent forgets. The other one keeps its cache and its walk
    // memory, so re-pointing one folder does not cost a full re-read of the other.
    forgetSource(sourceId);
    setData(d => ({ ...d, [sourceId]: EMPTY }));
    persist({ ...settings, folders: { ...settings.folders, [sourceId]: chosen } });
    goToSource(sourceId);
  }, [settings, persist, forgetSource, goToSource]);

  /** Connect a derived candidate. Same effect as picking it by hand — the path
   *  was derived from one the human already designated, and shown before this. */
  const connectAt = useCallback((sourceId: string, folder: string) => {
    forgetSource(sourceId);
    setData(d => ({ ...d, [sourceId]: EMPTY }));
    persist({ ...settings, folders: { ...settings.folders, [sourceId]: folder } });
    goToSource(sourceId);
  }, [settings, persist, forgetSource, goToSource]);

  const reset = useCallback(() => {
    forgetEverything();
    setData({});
    goToSource(null);
    setSettings(resetSettings());
    setShowSettings(false);
  }, [forgetEverything, goToSource]);

  const source = sourceById(openSourceId);
  const current = (openSourceId && data[openSourceId]) || EMPTY;

  /** Two live sessions on one branch means a commit from either picks up the
   *  other's staged work. Surfacing it turns a rule you must remember into
   *  something you can see (doc 93 §6). */
  /**
   * Collisions across EVERY connected agent, never the open one alone.
   *
   * 🚨 This used to read `current.sessions`, so the dashboard answered for one
   * harness while the far view (which already flattened all of them) answered
   * for all: the same screen said different things depending on zoom. And two
   * agents from DIFFERENT harnesses in one working tree is not an edge case to
   * tolerate, it is the case most worth catching — neither of them can see the
   * other any other way.
   *
   * `agentOf` carries which harness each session came from, because a warning
   * naming a session you cannot place in a tool you are not running is a
   * warning you cannot act on.
   */
  const shared = useMemo(() => {
    const rows = SOURCES.flatMap(src =>
      (data[src.id]?.sessions ?? []).map(session => ({ session, agent: src.sessions.displayName })));
    const report = collisionReport(rows.map(r => r.session));
    return {
      groups: report.groups,
      unplaceable: report.unplaceable.length,
      agentOf: new Map(rows.map(r => [r.session, r.agent])),
    };
  }, [data]);

  const liveCount = useMemo(() => liveSessions(current.sessions).length, [current.sessions]);

  const statuses: SourceStatus[] = SOURCES.map(s => ({
    source: s,
    folder: settings.folders[s.id] ?? null,
    sessions: data[s.id]?.sessions ?? [],
    notes: data[s.id]?.docs.length ?? 0,
    busy: data[s.id]?.busy ?? false,
  }));

  const openNote = panel?.kind === 'note' ? panel.file : null;
  const openSession = panel?.kind === 'session' ? panel.file : null;
  const openFile = panel?.kind === 'file' ? panel.file : null;
  const show = (kind: PanelRef['kind']) => (file: string | null) => {
    setEditing(false);
    setHistory(h => navigate(h, file ? { kind, file } : null));
  };
  const showNote = show('note');
  const showSession = show('session');
  const showFile = show('file');

  /**
   * Following a `[[link]]`, from a note or from a markdown file the panel is
   * painting. An unresolved name does nothing: a link marks something worth
   * writing later, and inventing a destination would be worse.
   */
  const followNoteLink = (name: string) => {
    const target = current.docs.find(
      d => d.name === name || d.file.replace(/\.[^.]+$/, '') === name);
    if (target) showNote(target.path);
  };

  const openedSession = current.sessions.find(x => x.path === openSession) ?? null;
  const openedNote = current.docs.find(d => d.path === openNote) ?? null;
  // The row carries its own provenance, so the drawer names the session a file
  // came from without a second lookup.
  const openedFile = openFile
    ? buildArtifactRows(current.sessions, settings).find(r => r.path === openFile) ?? null
    : null;
  const panelTitle = openedNote
    ? openedNote.name
    : openedFile
      ? baseName(openedFile.path) ?? openedFile.path
      : openedSession
        ? sessionLabel(openedSession.title, openedSession.humanTurns[0]?.text, 46).text || t.unknown
        : '';
  const panelSubtitle = openedSession && source
    ? `${source.sessions.mark?.label ?? source.sessions.displayName} · ${baseName(openedSession.projectPath) ?? t.unknown} · ${openedSession.branch ?? t.unknown}`
    : openedFile
      ? openedFile.project ?? t.unknown
      : openedNote?.type ?? '';

  /**
   * What to call one entry of the history, so back and forward can NAME where
   * they lead. A button labelled only with an arrow makes you press it to find
   * out where it goes, which is the thing being fixed.
   *
   * An entry whose target is gone (a note deleted, a session from an agent you
   * switched away from) keeps its file name rather than vanishing: the step
   * happened, and a blank label would read as a broken control.
   */
  const labelFor = (ref: PanelRef): string => {
    if (ref.kind === 'note') {
      const doc = current.docs.find(d => d.path === ref.file);
      return doc?.name ?? baseName(ref.file) ?? ref.file;
    }
    if (ref.kind === 'file') return baseName(ref.file) ?? ref.file;
    const session = current.sessions.find(x => x.path === ref.file);
    return session
      ? sessionLabel(session.title, session.humanTurns[0]?.text, 40).text || (baseName(ref.file) ?? ref.file)
      : baseName(ref.file) ?? ref.file;
  };

  /**
   * "Edited here" against "changed after the agent" — a record against an
   * inference (see lib/handEdits). Computed where the data is, so the panels
   * receive a verdict rather than three lists to cross-reference.
   */
  const noteMark = openedNote
    ? editMark(openedNote.path, openedNote.mtime, lastAgentTouch(openedNote.path, current.sessions), settings)
    : null;
  // A file row has no mtime of its own: the walk only lists transcripts and
  // notes. Absent measurement, absent claim — the mark falls back to what
  // Ariadne itself recorded, and infers nothing.
  const fileMark = openedFile
    ? editMark(openedFile.path, null, openedFile.at, settings)
    : null;

  const behind = trail(history);
  const backLabel = canGoBack(history) ? labelFor(behind[behind.length - 1]) : null;
  const forwardLabel = canGoForward(history) ? labelFor(history.entries[history.cursor + 1]) : null;

  /** Record a save. The settings object is the source of truth for the "already
   *  kept" marks, so the whole file list re-derives from one write. */
  const noteSaved = useCallback((path: string, mark: SavedMark) => {
    setSettings(prev => {
      const next = rememberSaved(prev, path, mark);
      saveSettings(next);
      return next;
    });
  }, []);

  /**
   * Record a hand edit, and drop the cached parse of that file so the next
   * pass re-reads it. Without the second half, the panel would go on showing
   * the text from before the edit until the size or mtime happened to change
   * enough for the fingerprint to notice.
   */
  const noteEdited = useCallback((path: string) => {
    setSettings(prev => {
      const next = rememberEdited(prev, path, { at: new Date().toISOString() });
      saveSettings(next);
      return next;
    });
    for (const [k] of [...seen.current.entries()]) {
      if (k.endsWith(`|${path}`)) seen.current.delete(k);
    }
    setEditing(false);
  }, []);

  // Zoomed far out, the dashboard is a grey smear. Show what survives at that
  // size: how many sessions still moved, and whether two share a branch.
  if (typeof zoom === 'number' && zoom < COMPACT_BELOW_ZOOM) {
    // Collisions are computed per open source; from afar the question is
    // whether ANY branch is shared, so it is recomputed across every agent.
    // Same computation as the near view, so the two cannot disagree.
    const sharedCount = shared.groups.length;
    return <CompactView t={t} statuses={statuses} collisions={sharedCount} zoom={zoom} />;
  }

  return (
    <div className="wrap">
      <header>
        <div className="head-left">
          {source && (
            <button className="back" title={t.hubBack} onClick={() => goToSource(null)}>
              ‹
            </button>
          )}
          <div>
            <h1>{source ? source.sessions.displayName : t.title}</h1>
            <p className="sub">{source ? t.subtitle : t.hubSubtitle}</p>
          </div>
        </div>
        <div className="head-right">
          {source && settings.folders[source.id] && (
            <nav className="tabs">
              <button className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>{t.tabRuns}</button>
              {source.notes && (
                <button className={tab === 'yours' ? 'on' : ''} onClick={() => setTab('yours')}>{t.tabYours}</button>
              )}
            </nav>
          )}
          <button className="gear" title={t.tabSettings} onClick={() => setShowSettings(v => !v)}>
            {showSettings ? '×' : '⚙'}
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsView
          t={t} settings={settings} onChange={persist} sources={SOURCES}
          onPick={pick} onReset={reset}
        />
      )}

      {!source ? (
        <Hub
          t={t} statuses={statuses} candidates={candidates}
          onOpen={goToSource} onPick={pick} onConnect={connectAt}
        />
      ) : !settings.folders[source.id] ? (
        <>
          <div className="bar"><button onClick={() => void pick(source.id)}>{t.pick}</button></div>
          <ConsentCard t={t} connector={source.sessions} />
        </>
      ) : tab === 'yours' && source.notes ? (
        <NotesTab
          t={t} docs={current.docs} sessions={current.sessions} settings={settings}
          openNote={openNote} onOpenNote={showNote}
          openFile={openFile} onOpenFile={showFile}
        />
      ) : (
        <Dashboard
          t={t} sessions={current.sessions} docs={current.docs} live={liveCount}
          collisions={shared.groups} agentOf={shared.agentOf} unplaceable={shared.unplaceable}
          busy={current.busy} error={current.error}
          stats={current.stats} folder={settings.folders[source.id]}
          openSession={openSession} onOpenSession={showSession}
          connector={source.sessions}
        />
      )}

      {/* Open on the RESOLVED content, not on the id. A note deleted on disk
          while its drawer is open would otherwise leave the panel showing
          nothing at all. */}
      <Drawer
        open={Boolean(openedSession ?? openedNote ?? openedFile)}
        title={panelTitle}
        subtitle={panelSubtitle}
        closeLabel={t.close}
        onClose={() => { setEditing(false); setHistory(EMPTY_HISTORY); }}
        backLabel={backLabel}
        forwardLabel={forwardLabel}
        onBack={() => { setEditing(false); setHistory(goBack); }}
        onForward={() => { setEditing(false); setHistory(goForward); }}
      >
        {panel?.kind === 'session' && openedSession && (
          <SessionDetail
            t={t} lang={lang} sdk={sdk} settings={settings}
            session={openedSession} docs={current.docs}
            onOpenNote={showNote} onOpenFile={p => showFile(p)}
          />
        )}
        {panel?.kind === 'file' && openedFile && source && (
          <FileDetail
            t={t} sdk={sdk}
            ctx={{
              artifact: { path: openedFile.path, origin: openedFile.origin, at: openedFile.at },
              sessionTitle: openedFile.sessionTitle,
              agent: source.sessions.displayName,
              sessionAt: openedFile.sessionAt,
            }}
            saved={settings.saved[savedKey(openedFile.path)]}
            onSaved={noteSaved}
            editMark={fileMark}
            editedAt={settings.edited[savedKey(openedFile.path)]?.at ?? null}
            editing={editing}
            onEdit={() => setEditing(true)}
            onEditDone={() => noteEdited(openedFile.path)}
            onEditCancel={() => setEditing(false)}
            onNoteLink={followNoteLink}
          />
        )}
        {panel?.kind === 'note' && openedNote && (
          editing ? (
            <FileEditor
              t={t} sdk={sdk} path={openedNote.path}
              onSaved={() => noteEdited(openedNote.path)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="panel-actions">
                <button onClick={() => setEditing(true)}>{t.edit}</button>
                <EditBadge t={t} mark={noteMark} at={settings.edited[savedKey(openedNote.path)]?.at ?? null} />
              </div>
              <div className="md">
                {renderMarkdown(openedNote.body.trim(), followNoteLink)}
              </div>
            </>
          )
        )}
      </Drawer>
    </div>
  );
}
