/**
 * The reading tools of the document panel, and the folder it lives in.
 *
 * Tony, 2026-09-09: « le but est de ne pas utiliser Windows mais Mnemosyne ».
 * So the folder is listed HERE, not handed to Explorer, and every file in it
 * opens in this same drawer. The `openInOS` escape hatch stays a small
 * secondary link — taking away a working way out because a better one exists
 * is how someone ends up stuck when the better one does not cover their case.
 *
 * Three parts, each absent rather than empty when there is nothing to say:
 *   - what the document is (words, characters, reading time);
 *   - what is in it (the headings, which scroll it);
 *   - what is beside it (the folder, listed in place).
 */
import { useCallback, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { outlineOf, readingStats, type OutlineEntry } from '../lib/reader';
import { fill, type Dict } from '../i18n';

export interface FileReaderToolsProps {
  t: Dict;
  sdk: MnemoCartridgeSDK;
  /** The file being read. Its folder is the one listed. */
  path: string;
  /** The document's FULL text — not the clipped excerpt the panel paints. The
   *  reading time is a fact about the file, and the clipped caveat below the
   *  body already says the panel is showing less than all of it. */
  text: string;
  /** Only markdown has headings worth an outline. */
  isMarkdown: boolean;
  /** Opens another file from the folder listing, in this same drawer. */
  onOpenFile: (path: string) => void;
}

/** What the host's Notes editor can render. Mirrored from the host's own test
 *  so the button is absent rather than refused for a file it cannot open. */
const OPENABLE_IN_NOTES = /\.(md|mdx|txt|rst|adoc)$/i;

interface DirEntry { name: string; isDirectory?: boolean; size?: number; mtime?: number }

type Folder =
  | { state: 'idle' }
  | { state: 'reading' }
  | { state: 'ok'; entries: DirEntry[]; dir: string }
  | { state: 'refused'; reason: string };

/** The folder of a file, without a path module. */
function dirOf(path: string): string {
  const cut = path.replace(/[\\/][^\\/]*$/, '');
  // A bare file name has no folder; returning '' would list the whole disk.
  return cut === path ? '' : cut;
}

export default function FileReaderTools(props: FileReaderToolsProps) {
  const { t, sdk, path, text, isMarkdown, onOpenFile } = props;
  const [showOutline, setShowOutline] = useState(false);
  const [folder, setFolder] = useState<Folder>({ state: 'idle' });

  const stats = readingStats(text);
  const outline: OutlineEntry[] = isMarkdown ? outlineOf(text) : [];

  /**
   * Scrolls the body to a heading.
   *
   * 🚨 The id comes from the same helper the renderer used, so this cannot
   * point at nothing — but the element may still be absent when the document
   * was CLIPPED and the heading fell past the cap. That is said, rather than
   * being a press with no effect.
   */
  const [missing, setMissing] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) { setMissing(true); return; }
    setMissing(false);
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  /**
   * Hands the document to the host's Notes app — its reader, its toolbar, its
   * properties panel. This is the reading surface; the panel above it is the
   * look before you commit to opening it.
   *
   * 🚨 The button is only rendered for a file Notes can render. Asking it for
   * a `.pdf` makes the host hand the file to the OS default application, and
   * "read it in Mnemosyne, not in Windows" is the whole point.
   */
  const openInNotes = useCallback(async () => {
    setNotesError(null);
    try {
      const res = await sdk.invoke<{ success: boolean; error?: string }>('ui.openInNotes', { path });
      if (!res?.success) setNotesError(res?.error ?? t.notesOpenFailed);
    } catch (err) {
      // A refused permission arrives here. Never swallowed: a press that does
      // nothing is the failure that gets reported as "the button is dead".
      console.warn('[Ariadne] open in Notes refused:', err);
      setNotesError(String(err));
    }
  }, [sdk, path, t]);

  const openFolder = useCallback(async () => {
    const dir = dirOf(path);
    if (!dir) { setFolder({ state: 'refused', reason: t.folderNone }); return; }
    setFolder({ state: 'reading' });
    try {
      const res = await sdk.invoke<{ success: boolean; files?: DirEntry[]; error?: string }>(
        'dialog.readDir', { dirPath: dir });
      if (res?.success && Array.isArray(res.files)) {
        // Newest first: mtime comes free with the listing, and the file you
        // just wrote is the one you are looking for.
        const entries = [...res.files].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
        setFolder({ state: 'ok', entries, dir });
      } else {
        // 🎭 A refusal is never rendered as an empty folder — that is how a
        // blocked read once read as "the agent wrote nothing".
        setFolder({ state: 'refused', reason: res?.error ?? t.folderRefused });
      }
    } catch (err) {
      console.warn('[Ariadne] folder unreadable:', err);
      setFolder({ state: 'refused', reason: String(err) });
    }
  }, [path, sdk, t]);

  return (
    <div className="reader-tools">
      {/* 🎭 Zero words is nothing to read, not a zero-minute document: the bar
          is absent on an empty file rather than measuring one. */}
      {stats.words > 0 && (
        <div className="reader-stats" data-testid="reader-stats">
          <span>{fill(t.readerWords, { n: stats.words })}</span>
          <span>{fill(t.readerChars, { n: stats.characters })}</span>
          <span>{fill(t.readerTime, { n: stats.readTime })}</span>
        </div>
      )}

      <div className="reader-actions">
        {OPENABLE_IN_NOTES.test(path) && (
          <button
            type="button"
            className="primary-link"
            data-testid="open-in-notes"
            onClick={() => void openInNotes()}
          >
            {t.openInNotes}
          </button>
        )}
        {outline.length > 0 && (
          <button
            type="button"
            className="link"
            aria-expanded={showOutline}
            data-testid="outline-toggle"
            onClick={() => setShowOutline(v => !v)}
          >
            {fill(t.readerOutline, { n: outline.length })}
          </button>
        )}
        <button type="button" className="link" data-testid="folder-toggle" onClick={() => void openFolder()}>
          {t.readerFolder}
        </button>
      </div>

      {showOutline && outline.length > 0 && (
        <ol className="reader-outline" data-testid="outline">
          {outline.map(h => (
            <li key={h.id} className={`lvl${h.level}`}>
              <button type="button" className="link" onClick={() => jump(h.id)}>{h.text}</button>
            </li>
          ))}
        </ol>
      )}
      {missing && <p className="caveat">{t.readerOutlineMissing}</p>}
      {notesError && <p className="caveat err">{notesError}</p>}

      {folder.state === 'reading' && <p className="muted small">{t.reading}</p>}
      {folder.state === 'refused' && (
        <p className="caveat err">{fill(t.folderRefusedWhy, { reason: folder.reason })}</p>
      )}
      {folder.state === 'ok' && (
        <div className="reader-folder" data-testid="folder">
          <p className="muted small">{folder.dir}</p>
          {folder.entries.length === 0 ? (
            // A folder that really is empty, said as such. Not the same
            // sentence as a refusal above.
            <p className="muted small">{t.folderEmpty}</p>
          ) : (
            <ul>
              {folder.entries.map(e => (
                <li key={e.name}>
                  {e.isDirectory ? (
                    // ⛔ Not navigable: one folder is the document's own, and a
                    // browser that walks the disk is a different feature with a
                    // different consent behind it.
                    <span className="muted">{e.name}/</span>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      onClick={() => onOpenFile(`${folder.dir}/${e.name}`)}
                    >
                      {e.name}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
