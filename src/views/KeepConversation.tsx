/**
 * "Keep in memory" for one session or several (doc 132 lot 1).
 *
 * The vault is named on the screen before the press, like the keep of a file.
 * The list holds only vaults whose watched folder takes Markdown: the host
 * writes a file there and DocWatch turns it into memory. A vault that would
 * take the file and make nothing of it is never offered.
 *
 * Every outcome is said: kept, already identical, sections held back for a
 * secret (by kind, never the value), and each session that failed with why.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { defaultDestination, keepErrorText, tallyKeep, type KeepTally } from '../lib/keepConversation';
import { useKeepDestinations } from '../hooks/useKeepDestinations';
import { fill, type Dict } from '../i18n';

interface Props {
  t: Dict;
  sdk: MnemoCartridgeSDK;
  /** The sessions this press keeps: one from the drawer, several from the table. */
  sessions: Array<{ path: string; title: string | null }>;
  /** The vault used last, preselected when it still exists. */
  lastVault: string;
  /** Called after a keep with the sessions now in the vault (failures left out). */
  onKept: (keptPaths: string[], vaultId: string, vaultName: string, at: string) => void;
}

/** The keep panel: pick a vault, keep the sessions, read what happened to each. */
export default function KeepConversation({ t, sdk, sessions, lastVault, onKept }: Props): JSX.Element {
  const { vaults, error: vaultError, retry } = useKeepDestinations(sdk, t);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ vault: string; tally: KeepTally } | null>(null);
  // Read through a ref: a keep updates `lastVault`, and moving the picker under
  // the person's hand after every press would be wrong.
  const lastRef = useRef(lastVault);
  lastRef.current = lastVault;

  // Preselect once the list arrives. A target that still exists is kept.
  useEffect(() => {
    if (!vaults) return;
    setTarget((prev) => (prev && vaults.some((v) => v.workspaceId === prev) ? prev : defaultDestination(vaults, lastRef.current)));
  }, [vaults]);

  // A new selection is a new question: the previous answer no longer applies.
  const key = sessions.map((s) => s.path).join('|');
  useEffect(() => { setDone(null); setError(null); }, [key]);

  const keep = useCallback(async () => {
    if (!target || sessions.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sdk.invoke<{ success: boolean; results?: unknown; error?: string }>(
        'agent.keepConversations',
        { workspaceId: target, items: sessions.map((s) => ({ transcript: s.path, title: s.title ?? '' })) },
      );
      if (!res?.success) {
        setError(res?.error ?? t.keepConvFailed);
        return;
      }
      const tally = tallyKeep(sessions.map((s) => s.path), res.results);
      const name = vaults?.find((v) => v.workspaceId === target)?.name ?? target;
      setDone({ vault: name, tally });
      const failed = new Set(tally.failed.map((f) => f.transcript));
      onKept(sessions.map((s) => s.path).filter((p) => !failed.has(p)), target, name, new Date().toISOString());
    } catch (err) {
      console.error('[Ariadne] keep conversation failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [target, sessions, busy, sdk, t.keepConvFailed, vaults, onKept]);

  return (
    <div className="keep keep-conversation" data-testid="keep-conversation">
      {vaults === null ? (
        <p className="muted small">{t.reading}</p>
      ) : vaultError ? (
        <>
          <p className="caveat err">{vaultError}</p>
          <button type="button" onClick={retry}>
            {t.retry}
          </button>
        </>
      ) : vaults.length === 0 ? (
        <p className="muted small">{t.keepConvNoVault}</p>
      ) : (
        <div className="keep-row">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t.keepConvVault}>
            {vaults.map((v) => <option key={v.workspaceId} value={v.workspaceId}>{v.name}</option>)}
          </select>
          <button type="button" className="primary" disabled={busy || !target} onClick={() => void keep()}>
            {busy ? t.keeping : sessions.length > 1 ? fill(t.keepConvMany, { n: sessions.length }) : t.keepConvOne}
          </button>
        </div>
      )}

      {done && (
        <>
          <p className="kept-ok">{fill(t.keepConvDone, { n: done.tally.kept, vault: done.vault })}</p>
          {done.tally.unchanged > 0 && <p className="muted small">{fill(t.keepConvUnchanged, { n: done.tally.unchanged })}</p>}
          {done.tally.heldSections > 0 && (
            <p className="caveat">{fill(t.keepConvHeld, { n: done.tally.heldSections, kinds: done.tally.secretKinds.join(', ') || t.keepConvBlockedWords })}</p>
          )}
          {done.tally.failed.map((f) => (
            <p key={f.transcript} className="caveat err">{fill(t.keepConvOneFailed, { error: keepErrorText(t, f.error) })}</p>
          ))}
        </>
      )}
      {error && <p className="caveat err">{keepErrorText(t, error)}</p>}
      <p className="caveat">{t.keepConvCaveat}</p>
    </div>
  );
}
