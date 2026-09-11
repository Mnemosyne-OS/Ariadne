/**
 * Ariadne — one dashboard over what the coding agents on this machine wrote.
 * Doc 93.
 *
 * Reads only what the harness already writes, so a crashed agent still reports
 * truthfully by falling silent. Nothing here ever renders "working": that is
 * unprovable, and a dead agent and an idle one produce the same silence. We
 * render the fact we can prove, "last seen X ago", and let the human conclude.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MnemoCartridgeSDK, onHostConfig } from './sdk/mnemo-sdk';
import { collisionReport, liveSessions, type SessionState } from '@mnemosyne_os/agent-transcripts';
import { SOURCES, sourceById } from './lib/sources';
import {
  loadSettings, saveSettings, resetSettings, rememberSaved, rememberEdited, rememberExported, savedKey,
  type SavedMark, type ExportedMark, type Settings,
} from './lib/settings';
import { editMark, lastAgentTouch } from './lib/handEdits';
import { buildArtifactRows, documentRows, notePathSet } from './lib/artifactRows';
import {
  EMPTY_HISTORY, canGoBack, canGoForward, currentPanel, goBack, goForward, navigate, trail,
  type PanelRef,
} from './lib/panelHistory';
import { panelTitle, panelSubtitle, entryLabel, type OpenedPanel } from './lib/panelLabels';
import { useTwinCandidates } from './hooks/useTwinCandidates';
import { useAgentScan, EMPTY } from './hooks/useAgentScan';
import { useCockpit } from './hooks/useCockpit';
import { useAgentPort } from './hooks/useAgentPort';
import type { CardSource } from './lib/cockpitCards';
import { renderMarkdown } from './lib/markdown';
import { dictFor, type Dict } from './i18n';
import Hub, { type SourceStatus } from './views/Hub';
import SourceMark from './views/SourceMark';
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

/** Below this canvas zoom the normal layout is unreadable, so we render the
 *  headline instead. Unknown zoom renders the normal view — never a degraded
 *  one on a guess. */
const COMPACT_BELOW_ZOOM = 0.6;

export default function App(): JSX.Element {
  const [t, setT] = useState<Dict>(() => dictFor(navigator.language));
  const [lang, setLang] = useState<string>(() => navigator.language || 'en');
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  /** null = the hub. Otherwise the source being looked at. */
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [tab, setTab] = useState<'runs' | 'yours'>('runs');
  /**
   * Set by the dashboard's document count: the files pane opens already
   * filtered to markdown. A counter, not a boolean — pressing it twice must
   * re-apply the filter even if the person turned it off in between, and a
   * boolean that is already `true` changes nothing.
   */
  const [documentsRequest, setDocumentsRequest] = useState(0);
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

  const { data, forgetSource, forgetEverything, dropCached } = useAgentScan(
    sdk, settings.folders, t.error);

  // Inherits the shell's theme and design tokens, follows its language, and
  // learns the canvas zoom it is painted at (which it cannot measure itself).
  useEffect(() => onHostConfig(cfg => {
    if (cfg?.lang) { setT(dictFor(cfg.lang)); setLang(cfg.lang); }
    if (typeof cfg?.zoom === 'number') setZoom(cfg.zoom);
  }), []);

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

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const candidates = useTwinCandidates(sdk, settings.folders);

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
    persist({ ...settings, folders: { ...settings.folders, [sourceId]: chosen } });
    goToSource(sourceId);
  }, [settings, persist, forgetSource, goToSource]);

  /** Connect a derived candidate. Same effect as picking it by hand — the path
   *  was derived from one the human already designated, and shown before this. */
  const connectAt = useCallback((sourceId: string, folder: string) => {
    forgetSource(sourceId);
    persist({ ...settings, folders: { ...settings.folders, [sourceId]: folder } });
    goToSource(sourceId);
  }, [settings, persist, forgetSource, goToSource]);

  const reset = useCallback(() => {
    forgetEverything();
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

  // Every session of every harness, signed with its mark: the cockpit is asked
  // about ALL of them (a pin outlives the source you happen to be looking at).
  const cockpitRows = useMemo<CardSource[]>(() => SOURCES.flatMap(src =>
    (data[src.id]?.sessions ?? []).map(session => ({
      session,
      mark: src.sessions.mark ? { label: src.sessions.mark.label, tint: src.sessions.mark.tint } : null,
    }))), [data]);
  // Who answers the agents right now — the one thing a transcript on disk
  // cannot say. Read once, then while it keeps answering.
  const agentPort = useAgentPort(sdk);
  const cockpit = useCockpit(sdk, cockpitRows, { unknown: t.unknown, sidechain: t.sidechain, files: t.cardFiles, pinFailed: t.pinFailed });
  const togglePin = useCallback((session: SessionState) => {
    const row = cockpitRows.find(r => r.session === session);
    if (row) cockpit.toggle(row);
  }, [cockpitRows, cockpit]);

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

  /**
   * Every file the agents produced, built ONCE here.
   *
   * The dashboard's document count and the files pane's own chip must never be
   * two numbers: they are the same list, deduplicated by path the same way, or
   * the screen states two incompatible things about one folder. It was also
   * being rebuilt for the drawer's single lookup below.
   */
  const artifacts = useMemo(
    () => buildArtifactRows(current.sessions, settings),
    [current.sessions, settings],
  );
  /**
   * The DOCUMENTS: markdown written for a person, the agent's own notes taken
   * out. Built once here so the tile's number, the tile's list and anything
   * else that says "documents" are the same population — a count and a list
   * that disagree is the screen contradicting itself.
   */
  const documents = useMemo(
    () => documentRows(artifacts, notePathSet(current.docs)),
    [artifacts, current.docs],
  );
  const openedSession = current.sessions.find(x => x.path === openSession) ?? null;
  const openedNote = current.docs.find(d => d.path === openNote) ?? null;
  // The row carries its own provenance, so the drawer names the session a file
  // came from without a second lookup.
  const openedFile = openFile
    ? artifacts.find(r => r.path === openFile) ?? null
    : null;
  const opened: OpenedPanel = { note: openedNote, file: openedFile, session: openedSession };
  /** Null when no agent is open, which is what makes the subtitle skip the
   *  session line rather than render it two thirds written. */
  const agentLabel = source
    ? source.sessions.mark?.label ?? source.sessions.displayName
    : null;
  const title = panelTitle(opened, t.unknown);
  const subtitle = panelSubtitle(opened, agentLabel, t.unknown);

  const labelFor = (ref: PanelRef): string => entryLabel(ref, current.docs, current.sessions);

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
   * Record a conversation Ariadne wrote out, and open it.
   *
   * The document is a `.md` on disk, so it opens in the SAME drawer as any
   * other file — rendered preview, and the "keep this" button that names its
   * vault already works on it. Nothing new to look at, which is the point.
   */
  const noteExported = useCallback((sessionPath: string, mark: ExportedMark) => {
    setSettings(prev => {
      const next = rememberExported(prev, sessionPath, mark);
      saveSettings(next);
      return next;
    });
    showFile(mark.file);
  }, [showFile]);

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
    dropCached(path);
    setEditing(false);
  }, [dropCached]);

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
          {/* The badge belongs beside the title too: the detail view printed the
              agent's name with nothing to identify it, while every row below
              carried its mark. `glyph` so the name is not said twice. */}
          {source && <SourceMark connector={source.sessions} size="glyph" />}
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
          t={t} docs={current.docs} sessions={current.sessions}
          openNote={openNote} onOpenNote={showNote}
          openFile={openFile} onOpenFile={showFile}
          artifacts={artifacts} documentsRequest={documentsRequest}
        />
      ) : (
        <Dashboard
          t={t} sessions={current.sessions} docs={current.docs} live={liveCount}
          collisions={shared.groups} agentOf={shared.agentOf} unplaceable={shared.unplaceable}
          busy={current.busy} error={current.error}
          stats={current.stats} folder={settings.folders[source.id]}
          openSession={openSession} onOpenSession={showSession}
          connector={source.sessions}
          pinned={cockpit.pinned} onTogglePin={togglePin} onPinLive={cockpit.pinLive}
          pinError={cockpit.error} pinOmitted={cockpit.omitted}
          agentPort={agentPort}
          documents={documents}
          exported={settings.exported} onOpenFile={p => showFile(p)}
          onBrowseDocuments={source.notes ? () => {
            setTab('yours');
            setDocumentsRequest(n => n + 1);
          } : null}
        />
      )}

      {/* Open on the RESOLVED content, not on the id. A note deleted on disk
          while its drawer is open would otherwise leave the panel showing
          nothing at all. */}
      <Drawer
        open={Boolean(openedSession ?? openedNote ?? openedFile)}
        title={title}
        subtitle={subtitle}
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
            exported={settings.exported[savedKey(openedSession.path)]}
            onExported={noteExported}
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
            onOpenFile={p => showFile(p)}
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
