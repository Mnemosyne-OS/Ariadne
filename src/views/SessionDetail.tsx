/**
 * What one session produced, rendered inside the side drawer.
 *
 * Owns only the summary call; the drawer chrome and which panel is open belong
 * to the shell, so a session and a note cannot end up open at once.
 */
import { useCallback, useMemo, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import type { DocState, SessionState } from '@mnemosyne_os/agent-transcripts';
import type { ExportedMark, KeptConversationMark, Settings } from '../lib/settings';
import KeepConversation from './KeepConversation';
import KeepRule from './KeepRule';
import { projectDirOf } from '../lib/keepConversation';
import { notesForSession } from '../lib/sessionNotes';
import { groupWrittenFiles, type WrittenBand } from '../lib/writtenFiles';
import { buildSummaryPrompt, splitToneLine } from '../lib/summarise';
import { ago, shortPath } from '../lib/format';
import { fill, type Dict } from '../i18n';

interface Props {
  t: Dict;
  lang: string;
  sdk: MnemoCartridgeSDK;
  settings: Settings;
  session: SessionState;
  docs: DocState[];
  onOpenNote: (path: string) => void;
  /** Files open in the same drawer as notes and sessions. */
  onOpenFile: (path: string) => void;
  /** What Ariadne already wrote out for THIS session, if anything. A record of
   *  what it did, never a claim that the file is still there. */
  exported: ExportedMark | undefined;
  onExported: (sessionPath: string, mark: ExportedMark) => void;
  /** The last keep of THIS session in memory, if Ariadne made one. */
  kept: KeptConversationMark | undefined;
  lastKeepVault: string;
  onKept: (paths: string[], vaultId: string, vaultName: string, at: string) => void;
  /** The app can keep this harness's sessions (Claude Code, Antigravity). */
  canKeep: boolean;
  /** A standing rule exists for Claude Code projects only: its folder is the project. */
  canKeepRule: boolean;
}

interface Summary { text: string; tone: string | null; used: number; total: number }

/** One heading per band. Kept beside the bands rather than inside the pure
 *  module: that one has no business knowing there is a dictionary. */
const BAND_LABEL: Record<WrittenBand, (t: Dict) => string> = {
  markdown: t => t.bandMarkdown,
  notes:    t => t.bandNotes,
  other:    t => t.bandOther,
};

export default function SessionDetail(props: Props): JSX.Element {
  const {
    t, lang, sdk, settings, session, docs, onOpenNote, onOpenFile, exported, onExported,
    kept, lastKeepVault, onKept, canKeep, canKeepRule,
  } = props;
  const keepSessions = useMemo(() => [{ path: session.path, title: session.title ?? null }], [session.path, session.title]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [writing, setWriting] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * Writes the conversation as a document beside its own transcript, then opens
   * it. REGENERATED on every press: the session may still be running, and a
   * stale file would be Ariadne showing a conversation that has moved on —
   * which is also why the button says "write" even when one already exists.
   *
   * 🚨 It costs no tokens and calls no model. The document is the transcript
   * re-rendered by the host, so this button is not in the summaries family and
   * must not read like it.
   */
  const exportConversation = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await sdk.invoke<{ success: boolean; file?: string; turns?: number; skipped?: number; error?: string }>(
        'agent.exportConversation',
        {
          transcript: session.path,
          title: session.title ?? '',
          who: { human: t.mdHuman, assistant: t.mdAssistant },
        },
      );
      if (res?.success && typeof res.file === 'string') {
        onExported(session.path, {
          file: res.file,
          at: new Date().toISOString(),
          // 🎭 Absent is absent: a count the host did not report is not zero.
          turns: typeof res.turns === 'number' ? res.turns : 0,
          skipped: typeof res.skipped === 'number' ? res.skipped : 0,
        });
      } else {
        setExportError(res?.error ?? t.exportFailed);
      }
    } catch (err) {
      // A refused permission arrives here. Never swallowed: a failure that
      // looks like nothing happening is the failure that gets reported as
      // "the button does nothing".
      console.warn('[Ariadne] export refused:', err);
      setExportError(String(err));
    } finally {
      setExporting(false);
    }
  }, [exporting, sdk, session.path, session.title, t, onExported]);

  // Two different claims, kept apart on purpose (see lib/sessionNotes).
  const linked = useMemo(() => notesForSession(session, docs), [session, docs]);
  // Markdown first, the agent's own notes next, the rest after (lib/writtenFiles).
  const bands = useMemo(() => groupWrittenFiles(session.artifacts, docs), [session.artifacts, docs]);
  const summary = summaries[session.path];

  const summarise = useCallback(async () => {
    setWriting(session.path);
    setSummaryError(null);
    try {
      const built = buildSummaryPrompt({
        session, ownerName: settings.ownerName, withTone: settings.tone, lang,
      });
      const res = await sdk.inferModel({
        prompt: built.prompt,
        systemPrompt: built.systemPrompt,
        // The session's own messages are the whole input. Pulling the user's
        // vaults in on top would blend unrelated memory into a summary of one
        // afternoon, and spend on retrieval nobody asked for.
        disableRAG: true,
        temperature: 0.3,
      });
      const text = res.text ?? res.response ?? res.content ?? res.answer ?? '';
      if (!text.trim()) throw new Error(res.error || t.summaryFailed);
      const { summary: body, tone } = splitToneLine(text);
      setSummaries(prev => ({
        ...prev,
        [session.path]: { text: body, tone, used: built.turnsUsed, total: built.turnsTotal },
      }));
    } catch (err) {
      console.error('[Ariadne] summary failed:', err);
      setSummaryError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(null);
    }
  }, [session, settings.ownerName, settings.tone, lang, sdk, t.summaryFailed]);

  return (
    <>
      <section>
        <h3>{t.humanTurns} <span className="muted">({session.humanTurns.length})</span></h3>

        {!settings.summaries ? (
          <p className="muted">{t.summaryOff}</p>
        ) : summary ? (
          <div className="summary">
            <p>{summary.text}</p>
            {summary.tone && (
              <div className="tone">
                <h4>{t.toneLabel}</h4>
                <p>{summary.tone}</p>
                {/* The caveat is not decoration. A tone rendered as a fact is a
                    fabricated measurement of a person. */}
                <p className="caveat">{t.toneCaveat}</p>
              </div>
            )}
            {summary.used < summary.total && (
              <p className="caveat">{fill(t.trimmed, { used: summary.used, total: summary.total })}</p>
            )}
          </div>
        ) : (
          <button
            disabled={writing === session.path || session.humanTurns.length === 0}
            onClick={() => void summarise()}
          >
            {writing === session.path ? t.summarising : t.summarise}
          </button>
        )}

        {summaryError && <p className="caveat err">{summaryError}</p>}

        {/* Its own block, deliberately away from the summary above: that one
            asks a model and costs tokens, this one re-renders a transcript the
            host already has. Two buttons side by side, one of which spends and
            one of which does not, is where a person stops pressing either. */}
        <div className="conversation-doc">
          <button
            type="button"
            data-testid="export-conversation"
            disabled={exporting}
            onClick={() => void exportConversation()}
          >
            {exporting ? t.exporting : t.exportConversation}
          </button>
          {/* ⚠️ What Ariadne DID, not a claim about the disk. The file may be
              gone since; opening it then shows the drawer's own refusal, which
              is never rendered as an empty file. */}
          {exported && (
            <button
              type="button"
              className="link"
              data-testid="open-conversation"
              onClick={() => onOpenFile(exported.file)}
            >
              {fill(t.exportedAt, { when: ago(exported.at, t), turns: exported.turns })}
            </button>
          )}
          {exported && exported.skipped > 0 && (
            <p className="caveat">{fill(t.exportSkipped, { n: exported.skipped })}</p>
          )}
          {exportError && <p className="caveat err">{exportError}</p>}
        </div>
      </section>

      {canKeep && (
        <section>
          <h3>{t.keepConvTitle}</h3>
          {kept && <p className="muted small">{fill(t.keptConvAt, { vault: kept.vault, when: ago(kept.at, t) })}</p>}
          <KeepConversation t={t} sdk={sdk} sessions={keepSessions} lastVault={lastKeepVault} onKept={onKept} />
        </section>
      )}

      {canKeepRule && (
        <section>
          <h3>{t.keepRuleTitle}</h3>
          <KeepRule t={t} sdk={sdk} projectDir={projectDirOf(session.path)} lastVault={lastKeepVault} />
        </section>
      )}

      {(linked.written.length > 0 || linked.during.length > 0) && (
        <section>
          <h3>{t.notes}</h3>
          {linked.written.length > 0 && (
            <>
              <p className="small">{t.notesWritten}</p>
              <ul className="note-links">
                {/* A note the session wrote through a shell belongs HERE, not
                    under "changed while it was open": that column is for a
                    coincidence of timing, and this is the session's own act.
                    It is still an inference, so it is marked. */}
                {linked.written.map(({ doc, origin }) => (
                  <li
                    key={doc.path}
                    className={origin === 'shell' ? 'inferred' : ''}
                    title={origin === 'shell' ? t.originShellCaveat : undefined}
                    onClick={() => onOpenNote(doc.path)}
                  >
                    {doc.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          {linked.during.length > 0 && (
            <>
              <p className="small">{t.notesDuring}</p>
              <ul className="note-links weak">
                {linked.during.map(d => (
                  <li key={d.path} onClick={() => onOpenNote(d.path)}>{d.name}</li>
                ))}
              </ul>
              {/* Another session running at the same moment leaves exactly this
                  evidence, and parallel sessions are routine here. */}
              <p className="caveat">{t.notesDuringCaveat}</p>
            </>
          )}
        </section>
      )}

      <section>
        <h3>{t.filesWritten} <span className="muted">({session.artifacts.length})</span></h3>
        {session.artifacts.length === 0
          ? <p className="muted">{t.noFiles}</p>
          : (
            <>
              {bands.map(({ band, rows }) => (
                <div key={band}>
                  {/* A band says what it holds. The heading is the whole point:
                      three documents someone will read used to sit under
                      identical bullets in the middle of fifty-five scripts. */}
                  <p className="small">
                    {BAND_LABEL[band](t)} <span className="count">{rows.length}</span>
                  </p>
                  {band === 'notes' && <p className="caveat">{t.bandNotesCaveat}</p>}
                  <ul className="files">
                    {rows.map(({ artifact: a, note }) => (
                      <li
                        key={a.path}
                        title={a.path}
                        className={a.origin === 'shell' ? 'inferred' : ''}
                        // A file the connector reads as a note opens in the NOTE
                        // panel, the same viewer the chips above use. The others
                        // open in the file panel, which renders markdown too.
                        onClick={() => (note ? onOpenNote(note.path) : onOpenFile(a.path))}
                      >
                        <code>{shortPath(a.path)}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {/* The list stopped. Saying nothing here is what made 42 of 211
                  sessions present 40 files as if that were all of them. */}
              {session.artifactsCapped && <p className="caveat">{t.sessionFilesCapped}</p>}
            </>
          )}
      </section>
    </>
  );
}
