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
import { fill, type Dict } from '../i18n';
import type { ScanStats } from '../lib/shared';

/**
 * Sessions painted before the "show more" button.
 *
 * It used to be a hard slice: 12 rows out of 211, with nothing to say the
 * other 199 existed. The page is the same size, but the rest is now one press
 * away and the button carries the count.
 */
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
}

export default function Dashboard(props: Props): JSX.Element {
  const { t, sessions, docs, live, collisions, agentOf, unplaceable, busy, error, stats, folder, openSession, onOpenSession, connector } = props;
  const [page, setPage] = useState(1);
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
      </div>

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
