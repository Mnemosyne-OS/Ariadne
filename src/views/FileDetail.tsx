/**
 * One file an agent wrote, opened in the drawer, and the way it crosses into
 * memory.
 *
 * This is the point of the whole tab. Working with a coding agent produces a
 * heap of drafts; the ones worth keeping used to require finding the path,
 * opening an editor and pasting. Here the draft is already in front of you and
 * keeping it is one press with the vault named on the button.
 *
 * Three things it must never do:
 *  - render a refusal as an empty file (that is how a blocked extension read
 *    as "the agent wrote nothing")
 *  - keep a file into memory without saying which vault it went to
 *  - claim a save that was cut to fit without saying it was cut
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import type { Artifact } from '@mnemosyne_os/agent-transcripts';
import type { SavedMark } from '../lib/settings';
import type { EditMark } from '../lib/handEdits';
import { buildKeptBody, vaultChoices, type VaultChoice } from '../lib/keep';
import { isMarkdownPath, splitFrontmatter } from '../lib/mdFile';
import { renderMarkdown } from '../lib/markdown';
import FileEditor from './FileEditor';
import FileReaderTools from './FileReaderTools';
import EditBadge from './EditBadge';
import { ago } from '../lib/format';
import { fill, type Dict } from '../i18n';

/** Rendered content is capped separately from the read: a 5 MB file opens, it
 *  simply does not paint five million characters into one <pre>. */
const MAX_RENDER_CHARS = 200_000;

export interface FileContext {
  artifact: Artifact;
  /** The session that produced it, for the provenance header and the panel. */
  sessionTitle: string | null;
  agent: string;
  sessionAt: string | null;
}

interface Props {
  t: Dict;
  sdk: MnemoCartridgeSDK;
  ctx: FileContext;
  saved: SavedMark | undefined;
  onSaved: (path: string, mark: SavedMark) => void;
  /** Whether this file was touched outside its agent, and how strongly that is
   *  known. See lib/handEdits — the two marks are different kinds of fact. */
  editMark: EditMark;
  editedAt: string | null;
  editing: boolean;
  onEdit: () => void;
  onEditDone: () => void;
  onEditCancel: () => void;
  /** Following a `[[link]]` out of a rendered markdown file. Optional, and an
   *  unresolved name does nothing: a link marks something worth writing later,
   *  and inventing a destination would be worse than a dead span. */
  onNoteLink?: (name: string) => void;
  /** Opening another file from the folder listing, in this same drawer. */
  onOpenFile: (path: string) => void;
}

type Load =
  | { state: 'reading' }
  | { state: 'ok'; text: string }
  | { state: 'refused'; reason: string };

export default function FileDetail(props: Props): JSX.Element {
  const {
    t, sdk, ctx, saved, onSaved,
    editMark, editedAt, editing, onEdit, onEditDone, onEditCancel, onNoteLink, onOpenFile,
  } = props;
  const path = ctx.artifact.path;
  /** Markdown is painted, and the source stays one press away. Sticky across
   *  files: someone who asked for the source asked for the source. */
  const [rawView, setRawView] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'reading' });
  const [vaults, setVaults] = useState<VaultChoice[] | null>(null);
  const [target, setTarget] = useState<string>('');
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  /** Why the vault list is not here. Kept apart from an EMPTY list: "no vault"
   *  and "could not ask" are different answers about someone's own memory. */
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  /** Bumped by the retry, which re-runs the lookup without an app restart. */
  const [refresh, setRefresh] = useState(0);
  const [justKept, setJustKept] = useState<{ vault: string; truncated: boolean } | null>(null);

  // Read on every path change, and DROP a reply that arrives after the drawer
  // moved on: without the guard, clicking three files quickly paints whichever
  // read finished last, under the third file's name.
  useEffect(() => {
    let cancelled = false;
    setLoad({ state: 'reading' });
    setJustKept(null);
    setKeepError(null);
    void (async () => {
      try {
        const res = await sdk.invoke<{ success: boolean; content?: string; isBinary?: boolean; error?: string }>(
          'dialog.readFile', { filePath: path });
        if (cancelled) return;
        if (!res?.success || typeof res.content !== 'string') {
          // Never a blank panel. A refusal that renders as emptiness is
          // indistinguishable from a file with nothing in it.
          setLoad({ state: 'refused', reason: res?.error ?? t.fileUnreadable });
          return;
        }
        setLoad({ state: 'ok', text: res.isBinary ? '' : res.content });
      } catch (err) {
        if (cancelled) return;
        console.warn(`[Ariadne] could not read ${path}:`, err);
        setLoad({ state: 'refused', reason: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  // `editedAt` is in here on purpose: it changes the moment a hand edit lands,
  // and without it the panel would go on painting the text from before the
  // save while claiming to show the file.
  }, [path, sdk, t.fileUnreadable, editedAt]);

  /**
   * The vault list, fetched once the panel opens — not at app start: it is a
   * vault:read call, and a cartridge that queries memory before anyone asked
   * it to is a cartridge that read for nothing.
   *
   * The refresh first is not ceremony. Enforcement reads the registry built at
   * startup, so on the run where this cartridge GAINED vault:read and
   * vault:write, every call is refused until the host re-reads the manifest —
   * and a refusal that fell through to `setVaults([])` would tell someone they
   * have no vaults, which is a fabricated fact about their own memory.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const perms = await sdk.invoke<{ granted?: Record<string, boolean> }>(
          'permissions.refresh', { permissions: ['vault:read', 'vault:write'] });
        if (cancelled) return;
        setCanWrite(perms?.granted?.['vault:write'] !== false);
        if (perms?.granted?.['vault:read'] === false) {
          setVaultError(t.keepNoPermission);
          setVaults([]);
          return;
        }
        const status = await sdk.invoke<unknown>('mnemosyne.status');
        if (cancelled) return;
        setVaults(vaultChoices(status));
      } catch (err) {
        console.warn('[Ariadne] could not list vaults:', err);
        if (cancelled) return;
        // An unreachable memory is UNKNOWN, never "no vault to write to".
        setVaultError(err instanceof Error ? err.message : String(err));
        setVaults([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sdk, t.keepNoPermission, refresh]);

  // The remembered vault only wins if it still exists. A default pointing at a
  // deleted vault would send the save somewhere nobody chose.
  useEffect(() => {
    if (!vaults || vaults.length === 0) return;
    setTarget(prev => (prev && vaults.some(v => v.id === prev) ? prev : (
      vaults.some(v => v.id === saved?.vault) ? (saved?.vault as string) : vaults[0].id
    )));
  }, [vaults, saved?.vault]);

  const shown = useMemo(() => {
    if (load.state !== 'ok') return { text: '', clipped: false };
    return load.text.length > MAX_RENDER_CHARS
      ? { text: load.text.slice(0, MAX_RENDER_CHARS), clipped: true }
      : { text: load.text, clipped: false };
  }, [load]);

  const isMd = isMarkdownPath(path);
  // Split on the SHOWN text, so a clipped file renders what the panel actually
  // holds and the clipped caveat below goes on telling the truth about it.
  const md = useMemo(() => (isMd ? splitFrontmatter(shown.text) : null), [isMd, shown.text]);

  const keep = useCallback(async () => {
    if (load.state !== 'ok' || !target) return;
    setKeeping(true);
    setKeepError(null);
    try {
      const built = buildKeptBody(
        { path, sessionTitle: ctx.sessionTitle, agent: ctx.agent, at: ctx.sessionAt },
        load.text,
      );
      const res = await sdk.invoke<{ chronicleId?: string }>('mnemosyne.ingest', {
        vault: target,
        content: built.content,
        spineType: 'DOCUMENT',
        // Tags the chronicle with the file it came from, so a later
        // human-gated forget has something to aim at.
        sourceRef: path,
      });
      const vaultName = vaults?.find(v => v.id === target)?.displayName ?? target;
      onSaved(path, {
        vault: target,
        at: new Date().toISOString(),
        ...(typeof res?.chronicleId === 'string' ? { chronicleId: res.chronicleId } : {}),
      });
      setJustKept({ vault: vaultName, truncated: built.truncated });
    } catch (err) {
      console.error('[Ariadne] keep failed:', err);
      setKeepError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeeping(false);
    }
  }, [load, target, path, ctx, sdk, vaults, onSaved]);

  const savedVaultName = saved
    ? vaults?.find(v => v.id === saved.vault)?.displayName ?? saved.vault
    : null;

  return (
    <>
      <section>
        <div className="file-meta">
          <span className={`tag ${ctx.artifact.origin === 'shell' ? 'weak' : ''}`}>
            {ctx.artifact.origin === 'shell' ? t.originShell : t.originTool}
          </span>
          <span className="muted">{ctx.agent}</span>
          {ctx.artifact.at && <span className="muted">{ago(ctx.artifact.at)}</span>}
        </div>
        <p className="file-path"><code>{path}</code></p>
        <div className="panel-actions">
          <button onClick={onEdit} disabled={editing}>{t.edit}</button>
          <EditBadge t={t} mark={editMark} at={editedAt} />
        </div>
        {/* An inference must carry its caveat wherever it is shown, not only
            in the list it came from. */}
        {ctx.artifact.origin === 'shell' && <p className="caveat">{t.originShellCaveat}</p>}
      </section>

      <section className="keep">
        <h3>{t.keepTitle}</h3>

        {saved && !justKept && (
          <p className="muted small">
            {fill(t.keptAlready, { vault: savedVaultName ?? saved.vault, when: ago(saved.at) })}
          </p>
        )}

        {justKept ? (
          <>
            <p className="kept-ok">{fill(t.keptDone, { vault: justKept.vault })}</p>
            {/* A save that was cut is still a save, and it must never pass for
                a whole one: memory would hold a partial file you keep trusting. */}
            {justKept.truncated && <p className="caveat">{t.keptTruncated}</p>}
          </>
        ) : vaults === null ? (
          <p className="muted small">{t.reading}</p>
        ) : vaultError ? (
          <>
            <p className="caveat err">{vaultError}</p>
            <button onClick={() => { setVaultError(null); setVaults(null); setRefresh(n => n + 1); }}>
              {t.retry}
            </button>
          </>
        ) : vaults.length === 0 ? (
          <p className="muted small">{t.keepNoVault}</p>
        ) : !canWrite ? (
          <>
            <p className="caveat err">{t.keepNoPermission}</p>
            <button onClick={() => { setVaults(null); setRefresh(n => n + 1); }}>{t.retry}</button>
          </>
        ) : load.state !== 'ok' ? (
          <p className="muted small">{t.keepNeedsContent}</p>
        ) : (
          <div className="keep-row">
            <select value={target} onChange={e => setTarget(e.target.value)}>
              {vaults.map(v => (
                <option key={v.id} value={v.id}>
                  {v.displayName}{v.chronicles >= 0 ? ` (${v.chronicles})` : ''}
                </option>
              ))}
            </select>
            <button className="primary" disabled={keeping} onClick={() => void keep()}>
              {keeping ? t.keeping : (saved ? t.keepAgain : t.keep)}
            </button>
          </div>
        )}

        {keepError && <p className="caveat err">{keepError}</p>}
        <p className="caveat">{t.keepCaveat}</p>
      </section>

      <section>
        {editing ? (
          <>
            <h3>{t.fileContent}</h3>
            <FileEditor t={t} sdk={sdk} path={path} onSaved={onEditDone} onCancel={onEditCancel} />
          </>
        ) : (
        <>
        <div className="file-head">
          <h3>{t.fileContent}</h3>
          {isMd && load.state === 'ok' && shown.text.trim() !== '' && (
            <button className="link" onClick={() => setRawView(v => !v)}>
              {rawView ? t.mdRendered : t.mdSource}
            </button>
          )}
          <button className="link" onClick={() => void sdk.invoke('dialog.openInOS', { filePath: path })}>
            {t.openInOS}
          </button>
        </div>

        {/* The reading tools sit between the heading row and the body: what
            this is, what is in it, what is beside it — then the text. Only on
            a file that actually loaded; measuring a refusal would be the panel
            describing a document it never read. */}
        {load.state === 'ok' && shown.text.trim() !== '' && (
          <FileReaderTools
            t={t} sdk={sdk} path={path}
            text={load.text}
            isMarkdown={isMd}
            onOpenFile={onOpenFile}
          />
        )}

        {load.state === 'reading' && <p className="muted small">{t.reading}</p>}

        {load.state === 'refused' && (
          <p className="caveat err">{fill(t.fileRefused, { reason: load.reason })}</p>
        )}

        {load.state === 'ok' && (
          shown.text.trim() === ''
            ? <p className="muted small">{t.fileEmpty}</p>
            : (
              <>
                {md && !rawView ? (
                  <div className="md file-md">
                    {/* Frontmatter is separated, never hidden. Removing it
                        would make the panel show less than the file holds,
                        and this is the screen someone reads before deciding
                        to send that file into memory. */}
                    {md.front !== null && <pre className="file-front">{md.front}</pre>}
                    {renderMarkdown(md.body.trim(), onNoteLink)}
                  </div>
                ) : (
                  <pre className="file-body">{shown.text}</pre>
                )}
                {shown.clipped && (
                  <p className="caveat">
                    {fill(t.fileClipped, { shown: MAX_RENDER_CHARS, total: load.text.length })}
                  </p>
                )}
              </>
            )
        )}
        </>
        )}
      </section>
    </>
  );
}
