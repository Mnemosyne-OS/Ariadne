/**
 * Editing a file by hand, in the panel that is already showing it.
 *
 * Reading a draft and wanting to fix one line in it is the same gesture; going
 * to find the path, opening an editor and coming back is three.
 *
 * Two rules it exists to enforce:
 *
 *  - It edits the file's WHOLE text, re-read at the moment you press Edit —
 *    never a rendered view of it. A note's frontmatter is stripped for
 *    display, and writing back what was displayed would delete it.
 *  - A file the host will not write does not get a Save button that fails on
 *    press. It gets a sentence saying the host does not write that kind of
 *    file, which is true and actionable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { extensionOf, isWritable } from '../lib/writable';
import { fill, type Dict } from '../i18n';

interface Props {
  t: Dict;
  sdk: MnemoCartridgeSDK;
  path: string;
  /** Called after a successful write, with the text that landed on disk. */
  onSaved: (text: string) => void;
  onCancel: () => void;
}

type Load =
  | { state: 'reading' }
  | { state: 'ok'; text: string }
  | { state: 'refused'; reason: string };

export default function FileEditor({ t, sdk, path, onSaved, onCancel }: Props): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'reading' });
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const writable = isWritable(path);

  // Re-read at open rather than trusting what the panel had: the note view
  // renders the body WITHOUT frontmatter, and saving that back would delete it.
  useEffect(() => {
    let cancelled = false;
    setLoad({ state: 'reading' });
    void (async () => {
      try {
        const res = await sdk.invoke<{ success: boolean; content?: string; isBinary?: boolean; error?: string }>(
          'dialog.readFile', { filePath: path });
        if (cancelled) return;
        if (!res?.success || typeof res.content !== 'string' || res.isBinary) {
          setLoad({ state: 'refused', reason: res?.error ?? t.fileUnreadable });
          return;
        }
        setLoad({ state: 'ok', text: res.content });
        setDraft(res.content);
      } catch (err) {
        if (cancelled) return;
        console.warn(`[Ariadne] could not read ${path} for editing:`, err);
        setLoad({ state: 'refused', reason: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [path, sdk, t.fileUnreadable]);

  useEffect(() => {
    if (load.state === 'ok') box.current?.focus();
  }, [load.state]);

  const save = useCallback(async () => {
    if (load.state !== 'ok') return;
    setSaving(true);
    setError(null);
    try {
      const res = await sdk.invoke<{ success?: boolean; error?: string }>(
        'dialog.writeFile', { filePath: path, content: draft });
      // The bridge resolves on a host-side refusal too, so a falsy success is
      // an error to report — never a save to celebrate.
      if (res && res.success === false) throw new Error(res.error || t.editFailed);
      onSaved(draft);
    } catch (err) {
      console.error('[Ariadne] save failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [load.state, sdk, path, draft, onSaved, t.editFailed]);

  const dirty = load.state === 'ok' && draft !== load.text;

  if (!writable) {
    return (
      <div className="editor">
        <p className="caveat err">{fill(t.editNotWritable, { ext: extensionOf(path) || '—' })}</p>
        <div className="editor-actions">
          <button onClick={onCancel}>{t.cancel}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      {load.state === 'reading' && <p className="muted small">{t.reading}</p>}

      {load.state === 'refused' && (
        <p className="caveat err">{fill(t.fileRefused, { reason: load.reason })}</p>
      )}

      {load.state === 'ok' && (
        <>
          <textarea
            ref={box}
            className="editor-box"
            value={draft}
            spellCheck={false}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
              if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save(); }
            }}
          />
          <div className="editor-actions">
            <button className="primary" disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? t.editSaving : t.editSave}
            </button>
            <button onClick={onCancel}>{t.cancel}</button>
            {/* Says whether there is anything to lose by cancelling. */}
            <span className="muted small">{dirty ? t.editDirty : t.editClean}</span>
          </div>
        </>
      )}

      {error && <p className="caveat err">{error}</p>}
    </div>
  );
}
