/**
 * The runs screen: three numbers, the one warning worth interrupting for, and
 * the recent sessions. Detail opens in the shell's side drawer, never here.
 *
 * The elapsed-time cell is the only thing marked as recent. It says the row
 * moved a moment ago, which is provable — never that the agent "is working".
 */
import { useState } from 'react';
import { minutesSince, type Collision, type Connector, type SessionState, type DocState } from '@mnemosyne_os/agent-transcripts';
import SourceMark from './SourceMark';
import { ago, baseName, sessionLabel } from '../lib/format';
import { savedKey, type ExportedMark } from '../lib/settings';
import { fileName, type ArtifactRow } from '../lib/artifactRows';
import { fill, type Dict } from '../i18n';
import type { ScanStats } from '../lib/shared';
import { HOST_MAX_CARDS } from '../lib/cockpitCards';

/**
 * Sessions painted before the "show more" button.
 *
 * It used to be a hard slice: 12 rows out of 211, with nothing to say the
 * other 199 existed. The page is the same size, but the rest is now one press
 * away and the button carries the count.
 */
import type { AgentPort } from '../hooks/useAgentPort';

const PAGE = 12;

interface Props {
  t: Dict;
  sessions: SessionState[];
  docs: DocState[];
  live: number;
  collisions: Collision<SessionState>[];
  /** Which harness each session came from. A warning naming a session you
   *  cannot place is a warning you cannot act on. */
  agentOf: Map<SessionState, string>;
  /** Recent sessions that record neither project nor branch, so nothing can
   *  say whether they share this tree. Stated, never silently dropped. */
  unplaceable: number;
  busy: boolean;
  error: string | null;
  stats: ScanStats | null;
  folder: string;
  /** The open session's PATH. A buried agent names every transcript the
   *  same, so the file name identifies nothing. */
  openSession: string | null;
  onOpenSession: (path: string | null) => void;
  connector: Connector;
  /** Sessions pinned on the host's canvas, by PATH — the host's answer, never
   *  a local copy (doc 110). */
  pinned: ReadonlySet<string>;
  onTogglePin: (session: SessionState) => void;
  onPinLive: () => void;
  /** The host's last refusal, or null. */
  pinError: string | null;
  /** Cards past the host's cap on the last publish. Zero is silent. */
  pinOmitted: number;
  /** Who answers the agents on the host's SDK port (null status = unknown). */
  agentPort: AgentPort;
  /**
   * The documents: markdown written for a person, the agent's own notes taken
   * out. The tile counts THIS array and lists the head of it, so the number
   * and the names can never describe two different things.
   */
  documents: ArtifactRow[];
  /**
   * Opens the files pane on them. Null when this source has no notes
   * connector: that tab carries BOTH the notes and the files, so it does not
   * exist here at all, and a count that opens nothing is worse than no count.
   */
  onBrowseDocuments: (() => void) | null;
  /** Conversations Ariadne wrote out, keyed as `savedKey` keys them. A record
   *  of what it did — the file may be gone since, which is why the row opens
   *  the drawer rather than asserting anything about the disk. */
  exported: Record<string, ExportedMark>;
  /** Opens one of those documents in the file drawer. */
  onOpenFile: (path: string) => void;
}

export default function Dashboard(props: Props): JSX.Element {
  const {
    t, sessions, docs, live, collisions, agentOf, unplaceable, busy, error, stats, folder,
    openSession, onOpenSession, connector, pinned, onTogglePin, onPinLive, pinError, pinOmitted,
    agentPort, documents, onBrowseDocuments, exported, onOpenFile,
  } = props;
  const [page, setPage] = useState(1);
  /** Four names fit the tile at the width the dashboard is read at; a fifth
   *  pushes the row of stats taller than the sessions table beside it. A slice
   *  and never a second sort: the rows arrive newest-first already. */
  const recent = documents.slice(0, 4);
  const nothingFound = !busy && sessions.length === 0 && docs.length === 0;
  const shown = sessions.slice(0, page * PAGE);
  const remaining = sessions.length - shown.length;

  return (
    <>
      <div className="stats">
        <div className={live > 0 ? 'stat on' : 'stat'}>
          <b>{live}</b><span>{t.live}</span>
        </div>
        <div className="stat"><b>{sessions.length}</b><span>{t.sessions}</span></div>
        <div className="stat"><b>{docs.length}</b><span>{t.notes}</span></div>
        {/* The documents the agents wrote, and the way into them. A press
            opens the files pane already filtered to markdown, where each row
            is one press from a rendered preview and from memory.

            ⛔ Rendered as a plain number when there is nowhere to go: a
            clickable figure that opens nothing is worse than a figure. */}
        {/* 🚨 The documents THEMSELVES, not only how many (« je les veux dans
            ma tuile »). A count you have to click to find out what it counts
            is a count. The number still opens the full list; the names under
            it open one document each, in this same drawer.

            ⛔ Only the ones that exist: no placeholder rows, and no list at
            all on a machine where the agents wrote no markdown — a tile of
            empty slots reads as a broken tile. */}
        <div className="stat docs" data-testid="documents">
          {onBrowseDocuments ? (
            <button
              type="button"
              className="docs-count"
              data-testid="documents-count"
              onClick={onBrowseDocuments}
              title={t.documentsHint}
            >
              <b>{documents.length}</b><span>{t.documents}</span>
            </button>
          ) : (
            <div className="docs-count" data-testid="documents-count"><b>{documents.length}</b><span>{t.documents}</span></div>
          )}
          {recent.length > 0 && (
            <ul className="docs-recent" data-testid="documents-recent">
              {recent.map(r => (
                <li key={r.path}>
                  <button
                    type="button"
                    title={r.path}
                    onClick={() => onOpenFile(r.path)}
                  >
                    {fileName(r.path)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* The canvas side of the dashboard. The count comes from the host's
            answer, so a card removed on the canvas is gone here too. */}
        <div className="stat pins">
          {live > 0 && (
            <button type="button" className="pin-live" onClick={onPinLive} title={t.pinLive}>
              📌 {t.pinLive}
            </button>
          )}
          {pinned.size > 0 && <span className="pinned-count">{fill(t.pinnedCount, { n: pinned.size })}</span>}
        </div>
      </div>

      {/* Who answers the agents. The sessions above come from files on disk;
          this is the only line that says whether those agents are reaching
          THIS app — or a headless daemon that outlived one of them. Rendered
          as soon as an answer is in, including the answer "unreadable": a line
          that appears only when something is wrong is a line nobody can read
          the absence of. */}
      {agentPort.answered && (
        <div className={agentPort.status && !agentPort.status.serving ? 'warn' : 'caveat'} data-testid="agent-port">
          {agentPort.status === null && t.backendUnknown}
          {agentPort.status?.serving === true && (
            <>
              {fill(t.backendServing, { port: agentPort.status.port })}
              {agentPort.status.clients !== null && agentPort.status.clients > 0
                && ` · ${fill(t.backendClients, { n: agentPort.status.clients })}`}
            </>
          )}
          {agentPort.status?.serving === false && fill(t.backendElsewhere, { port: agentPort.status.port })}
        </div>
      )}

      {pinError && <div className="warn err">{pinError}</div>}
      {pinOmitted > 0 && (
        <p className="caveat">{fill(t.pinOmitted, { n: pinOmitted, max: HOST_MAX_CARDS })}</p>
      )}

      {collisions.map(c => {
        // Two harnesses in one tree is the case most worth catching, and the
        // one neither agent can see for itself. Named when it happens.
        const harnesses = [...new Set(c.sessions.map(x => agentOf.get(x)).filter(Boolean))] as string[];
        return (
          <div className="warn" key={`${c.projectPath ?? '?'}@${c.branch ?? '?'}`}>
            <strong>{c.sessions.length} {t.collision}</strong>
            <span>
              {c.branch ?? t.unknown} · {t.collisionHint}
              {harnesses.length > 1 && ` · ${harnesses.join(' + ')}`}
            </span>
          </div>
        );
      })}

      {/* A count of groups with no count of what could not be grouped reads as
          a complete survey of the machine, and it is not one. */}
      {unplaceable > 0 && (
        <p className="caveat">{fill(t.unplaceable, { n: unplaceable })}</p>
      )}

      {error && <div className="warn err">{error}</div>}

      {nothingFound && (
        <div className="empty">
          <p>{fill(t.emptyMatched, {
            n: (stats?.sessionFiles ?? 0) + (stats?.noteFiles ?? 0),
            pattern: '.jsonl / .md',
            total: stats?.entries ?? 0,
          })}</p>
          <p className="hint">{fill(t.emptyHint, { connector: 'Claude Code' })}</p>
          <p className="path"><code>{folder}</code></p>
        </div>
      )}

      {busy && sessions.length === 0 && docs.length === 0 && <p className="empty">{t.reading}</p>}

      {sessions.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2>{t.sessions}</h2>
            <SourceMark connector={connector} />
          </div>
          <table className="runs">
            <tbody>
              {shown.map(r => (
                <tr
                  key={r.path}
                  className={`${minutesSince(r.lastEventAt) < 2 ? 'fresh' : ''} ${openSession === r.path ? 'open' : ''}`}
                  onClick={() => onOpenSession(openSession === r.path ? null : r.path)}
                >
                  <td className="ago">{ago(r.lastEventAt)}</td>
                  <td className="what">{renderLabel(r, t)}</td>
                  <td className="dim">{baseName(r.projectPath) ?? t.unknown}</td>
                  <td className="dim">{r.branch ?? t.unknown}</td>
                  <td className="num">{r.artifacts.length || ''}{r.artifactsCapped ? '+' : ''}</td>
                  <td className="kind">{r.isSidechain ? t.sidechain : ''}</td>
                  {/* Only where a document exists. An icon on all 211 rows,
                      most of them opening nothing, is a column of noise — and
                      the way to make one is one press away in the drawer. */}
                  <td className="doc">
                    {exported[savedKey(r.path)] && (
                      <button
                        type="button"
                        className="docbtn"
                        data-testid="open-doc"
                        title={t.openConversation}
                        aria-label={t.openConversation}
                        onClick={e => { e.stopPropagation(); onOpenFile(exported[savedKey(r.path)].file); }}
                      >
                        📄
                      </button>
                    )}
                  </td>
                  <td className="pin">
                    <button
                      type="button"
                      className={pinned.has(r.path) ? 'pinbtn on' : 'pinbtn'}
                      aria-pressed={pinned.has(r.path)}
                      title={pinned.has(r.path) ? t.unpin : t.pin}
                      aria-label={pinned.has(r.path) ? t.unpin : t.pin}
                      onClick={e => { e.stopPropagation(); onTogglePin(r); }}
                    >
                      📌
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {remaining > 0 && (
            <button className="more" onClick={() => setPage(p => p + 1)}>
              {fill(t.showMore, { n: remaining })}
            </button>
          )}
        </section>
      )}
    </>
  );
}

/**
 * The row's headline. A conversation the harness named shows that name; one it
 * did not shows the first thing the person typed, in a dimmer style so an
 * excerpt is never mistaken for a title the session actually has.
 */
function renderLabel(s: SessionState, t: Dict): JSX.Element {
  const { text, titled } = sessionLabel(s.title, s.humanTurns[0]?.text);
  if (!text) return <span className="dim">{t.unknown}</span>;
  return <span className={titled ? undefined : 'excerpt'} title={text}>{text}</span>;
}
