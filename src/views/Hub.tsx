/**
 * The home screen: one card per agent that is actually connected, plus a way
 * to add another.
 *
 * An agent you have not connected is not a card. It lives behind the plus, in
 * the chooser — the home shows what you use, not a catalogue with holes in it.
 */
import { useState } from 'react';
import type { SessionState } from '@mnemosyne_os/agent-transcripts';
import type { Source } from '../lib/sources';
import type { Candidate } from '../lib/siblings';
import SourceMark from './SourceMark';
import { ago } from '../lib/format';
import { liveSessions } from '@mnemosyne_os/agent-transcripts';
import type { Dict } from '../i18n';

export interface SourceStatus {
  source: Source;
  folder: string | null;
  sessions: SessionState[];
  notes: number;
  busy: boolean;
}

interface Props {
  t: Dict;
  statuses: SourceStatus[];
  /** Twins found beside an already-connected agent — offered, never adopted. */
  candidates: Candidate[];
  onOpen: (id: string) => void;
  onPick: (id: string) => void;
  onConnect: (id: string, folder: string) => void;
}

export default function Hub({ t, statuses, candidates, onOpen, onPick, onConnect }: Props): JSX.Element {
  const [choosing, setChoosing] = useState(false);

  const connected = statuses.filter(s => s.folder);
  const available = statuses.filter(s => !s.folder);

  if (choosing) {
    return (
      <section className="chooser">
        <div className="bar">
          <h2>{t.hubAdd}</h2>
          <button onClick={() => setChoosing(false)}>{t.cancel}</button>
        </div>

        {available.length === 0 ? (
          // Every known agent is already connected. Saying so beats an empty
          // list, which reads as a chooser that failed to load.
          <p className="empty">{t.hubAllAdded}</p>
        ) : (
          <ul className="agent-choices">
            {available.map(s => {
              // A twin found beside an agent already connected. The path is
              // shown before anything happens, and connecting it is still a
              // click — derived is not the same as adopted.
              const found = candidates.find(c => c.sourceId === s.source.id);
              return (
                <li
                  key={s.source.id}
                  className={found ? 'found' : ''}
                  onClick={() => {
                    setChoosing(false);
                    if (found) onConnect(s.source.id, found.path);
                    else onPick(s.source.id);
                  }}
                >
                  <SourceMark connector={s.source.sessions} />
                  {/* Three states, because two of them are NOT the same absence.
                      A derived twin shows its real path; an agent with a usual
                      place shows the hint; an agent that HAS no usual place
                      says so, rather than leaving a gap that reads as a missing
                      value. OpenClaw is the third: its exports land wherever
                      the human ran the command. */}
                  {found ? (
                    <code className="hint-path">{found.path}</code>
                  ) : s.source.sessions.folderHint ? (
                    <code className="hint-path">{s.source.sessions.folderHint}</code>
                  ) : (
                    <span className="hint-none">{t.hubNoUsualPlace}</span>
                  )}
                  {found && <span className="found-tag">{t.hubFound}</span>}
                </li>
              );
            })}
          </ul>
        )}

        <p className="caveat">{t.hubAddHint}</p>
      </section>
    );
  }

  return (
    <div className="hub">
      {connected.map(s => {
        // The shared rule, never a copy of it (see CompactView).
        const live = liveSessions(s.sessions).length;
        const last = s.sessions[0]?.lastEventAt ?? null;

        return (
          <button
            key={s.source.id}
            className={`agent-card ${live > 0 ? 'live' : ''}`}
            onClick={() => onOpen(s.source.id)}
          >
            <div className="agent-head">
              <SourceMark connector={s.source.sessions} />
            </div>

            {s.busy && s.sessions.length === 0 ? (
              <p className="agent-state muted">{t.reading}</p>
            ) : (
              <>
                <div className="agent-nums">
                  <span className={live > 0 ? 'on' : ''}>
                    <b>{live}</b> {t.live}
                  </span>
                  <span><b>{s.sessions.length}</b> {t.sessions}</span>
                  {s.source.notes && <span><b>{s.notes}</b> {t.notes}</span>}
                </div>
                {/* The provable fact, again: last signal, never a status. */}
                <p className="agent-state muted">
                  {last ? `${t.lastSeen} ${ago(last, t)}` : t.hubNothingYet}
                </p>
              </>
            )}
          </button>
        );
      })}

      <button className="agent-card add" onClick={() => setChoosing(true)}>
        <span className="plus">+</span>
        <span className="agent-state">{t.hubAdd}</span>
      </button>
    </div>
  );
}
