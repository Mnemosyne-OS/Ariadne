/**
 * What the human produced: their notes, and the files their agents wrote for
 * them. Sessions are elsewhere — this tab is about the output, not the run.
 *
 * Notes render in the shell's own note language (see lib/markdown), so a note
 * reads here the way it reads in Mnemosyne, wiki-links included.
 *
 * ## The list no longer lies about its own length
 *
 * The files pane used to render 30 rows under a counter showing the true
 * total, with nothing to explain the gap — so "I don't have all my files" was
 * a correct reading of the screen. Now the whole list is reachable: a page at
 * a time, with what remains stated on the button, and a warning when a session
 * upstream stopped short of its own files.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SessionState, DocState } from '@mnemosyne_os/agent-transcripts';
import {
  countCapped, countMarkdown, filterArtifactRows, type ArtifactRow, type OriginFilter,
} from '../lib/artifactRows';
import { ago, shortPath } from '../lib/format';
import { fill, type Dict } from '../i18n';

/** Rows painted per page. Big enough that scrolling is the normal way to
 *  browse, small enough that opening the tab is not a 4 000-row layout. */
const PAGE = 80;

interface Props {
  t: Dict;
  docs: DocState[];
  sessions: SessionState[];
  /** The open note's PATH. Not its file name: `task.md` repeats across
   *  sessions, so a name identifies nothing. */
  openNote: string | null;
  onOpenNote: (path: string | null) => void;
  /** The open file's path, and how to open one. Files live in the same drawer
   *  as notes and sessions — one place to look. */
  openFile: string | null;
  onOpenFile: (path: string | null) => void;
  /** Every file the agents produced, built once by App so the dashboard's
   *  count and this pane's chip can never be two different numbers. */
  artifacts: ArtifactRow[];
  /** Bumped when the dashboard's document count is pressed: open the files
   *  pane, filtered to markdown. A counter and not a flag, so pressing it
   *  again re-applies the filter after the person has turned it off. */
  documentsRequest: number;
}

export default function NotesTab(props: Props): JSX.Element {
  const { t, docs, sessions, openNote, onOpenNote, openFile, onOpenFile, artifacts, documentsRequest } = props;
  const [query, setQuery] = useState('');
  const [pane, setPane] = useState<'notes' | 'files'>('notes');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [mdOnly, setMdOnly] = useState(false);
  const [page, setPage] = useState(1);

  const capped = useMemo(() => countCapped(sessions), [sessions]);

  // 🚨 Only when the dashboard actually asked. Running on mount unconditionally
  // would force the files pane on someone who opened this tab for their notes.
  useEffect(() => {
    if (documentsRequest === 0) return;
    setPane('files');
    setMdOnly(true);
    setPage(1);
  }, [documentsRequest]);

  const q = query.trim().toLowerCase();

  const shownNotes = useMemo(() => {
    if (!q) return docs;
    return docs.filter(d =>
      (d.name ?? '').toLowerCase().includes(q)
      || (d.description ?? '').toLowerCase().includes(q)
      || (d.type ?? '').toLowerCase().includes(q));
  }, [docs, q]);

  const matching = useMemo(
    () => filterArtifactRows(artifacts, { query, origin, savedOnly, mdOnly }),
    [artifacts, query, origin, savedOnly, mdOnly],
  );
  // Changing what is being asked for starts the paging over: keeping page 5
  // after a search shows an empty middle of a short list.
  const shownArtifacts = matching.slice(0, page * PAGE);
  const remaining = matching.length - shownArtifacts.length;
  const keptCount = artifacts.filter(a => a.saved).length;
  const mdCount = useMemo(() => countMarkdown(artifacts), [artifacts]);

  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  return (
    <>
      <div className="bar">
        <div className="tabs small">
          <button className={pane === 'notes' ? 'on' : ''} onClick={() => setPane('notes')}>
            {t.notes} <span className="count">{docs.length}</span>
          </button>
          <button className={pane === 'files' ? 'on' : ''} onClick={() => setPane('files')}>
            {t.filesWritten} <span className="count">{artifacts.length}</span>
          </button>
        </div>
        <input
          className="search"
          value={query}
          placeholder={pane === 'notes' ? t.searchNotes : t.searchFiles}
          onChange={e => setFilter(() => setQuery(e.target.value))}
        />
      </div>

      {pane === 'files' && (
        <div className="filters">
          <button className={origin === 'all' ? 'on' : ''} onClick={() => setFilter(() => setOrigin('all'))}>
            {t.filterAll}
          </button>
          <button className={origin === 'tool' ? 'on' : ''} onClick={() => setFilter(() => setOrigin('tool'))}>
            {t.originTool}
          </button>
          <button className={origin === 'shell' ? 'on' : ''} onClick={() => setFilter(() => setOrigin('shell'))}>
            {t.originShell}
          </button>
          {/* The markdown an agent wrote while it worked: plans, reports,
              handoffs. They are not the notes pane, which reads a folder you
              designated; these are paths a transcript recorded. */}
          <button
            className={`spaced ${mdOnly ? 'on' : ''}`}
            onClick={() => setFilter(() => setMdOnly(v => !v))}
          >
            {t.filterMarkdown} <span className="count">{mdCount}</span>
          </button>
          <button
            className={savedOnly ? 'on' : ''}
            onClick={() => setFilter(() => setSavedOnly(v => !v))}
          >
            {t.filterKept} <span className="count">{keptCount}</span>
          </button>
        </div>
      )}

      {/* A session that stopped short of its own files must SAY so here: this
          list is built from those sessions, so its total is short too. */}
      {pane === 'files' && capped > 0 && (
        <p className="caveat">{fill(t.filesCapped, { n: capped })}</p>
      )}

      {pane === 'notes' ? (
        <ul className="notes">
          {shownNotes.map(d => (
            <li
              key={d.path}
              className={openNote === d.path ? 'open' : ''}
              onClick={() => onOpenNote(openNote === d.path ? null : d.path)}
            >
              <div className="note-head">
                <strong>{d.name}</strong>
                {d.type && <span className="tag">{d.type}</span>}
                {d.links.length > 0 && <span className="muted">{d.links.length} {t.links}</span>}
              </div>
              <p className={d.description ? 'note-desc' : 'note-desc muted'}>
                {d.description ?? t.noDescription}
              </p>
            </li>
          ))}
          {shownNotes.length === 0 && <p className="empty">{t.nothingHere}</p>}
        </ul>
      ) : (
        <>
          <table className="files-table">
            <tbody>
              {shownArtifacts.map(a => (
                <tr
                  key={a.path}
                  className={openFile === a.path ? 'open' : ''}
                  onClick={() => onOpenFile(openFile === a.path ? null : a.path)}
                >
                  <td className="ago">{ago(a.at)}</td>
                  <td className="proj">{a.project ?? t.unknown}</td>
                  <td title={a.path}><code>{shortPath(a.path)}</code></td>
                  {/* The mark carries the vault name in its tooltip: "kept"
                      without saying where is half an answer. */}
                  <td className="kept">
                    {a.saved && <span className="dot" title={a.saved.vault}>●</span>}
                  </td>
                  <td className="kind">{a.origin === 'shell' ? t.originShell : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {shownArtifacts.length === 0 && <p className="empty">{t.nothingHere}</p>}

          {remaining > 0 && (
            <button className="more" onClick={() => setPage(p => p + 1)}>
              {fill(t.showMore, { n: remaining })}
            </button>
          )}
        </>
      )}
    </>
  );
}
