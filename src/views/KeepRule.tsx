/**
 * The standing rule for one project (doc 132 lot 2): "keep every finished
 * session of this project in this vault".
 *
 * Ariadne only ASKS. The app shows its own dialog and the rule exists only
 * after a yes there. Once it exists, this panel shows what its last pass did,
 * with "Run now" and "Revoke". Revoking keeps what was already kept.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { defaultDestination, keepErrorText, ruleFor, type KeepRuleView } from '../lib/keepConversation';
import { useKeepDestinations } from '../hooks/useKeepDestinations';
import { ago } from '../lib/format';
import { fill, type Dict } from '../i18n';

interface Props {
  t: Dict;
  sdk: MnemoCartridgeSDK;
  projectDir: string;
  lastVault: string;
}

type RuleState = { state: 'reading' } | { state: 'error'; error: string } | { state: 'ok'; rule: KeepRuleView | null };

/** The rule panel for one project: ask for it, or read its last pass, run it, revoke it. */
export default function KeepRule({ t, sdk, projectDir, lastVault }: Props): JSX.Element {
  const [rule, setRule] = useState<RuleState>({ state: 'reading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRule({ state: 'reading' });
    void (async () => {
      try {
        const res = await sdk.invoke<{ success: boolean; rules?: unknown; error?: string }>('agent.keepRules');
        if (cancelled) return;
        if (!res?.success) { setRule({ state: 'error', error: res?.error ?? t.keepRuleUnread }); return; }
        setRule({ state: 'ok', rule: ruleFor(res, projectDir) });
      } catch (err) {
        console.warn('[Ariadne] could not read keep rules:', err);
        if (!cancelled) setRule({ state: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [sdk, projectDir, reload, t.keepRuleUnread]);

  const act = useCallback(async (action: string, payload?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await sdk.invoke<{ success: boolean; error?: string }>(action, payload);
      // DECLINED is the person's own answer in the app's dialog: nothing to report.
      if (!res?.success && res?.error !== 'DECLINED') setError(res?.error ?? t.keepRuleFailed);
    } catch (err) {
      console.error(`[Ariadne] ${action} failed:`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setReload((n) => n + 1);
    }
  }, [sdk, t.keepRuleFailed]);

  return (
    <div className="keep keep-rule" data-testid="keep-rule">
      {rule.state === 'reading' ? (
        <p className="muted small">{t.reading}</p>
      ) : rule.state === 'error' ? (
        <>
          <p className="caveat err">{rule.error}</p>
          <button type="button" onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
        </>
      ) : rule.rule ? (
        <RuleOn t={t} rule={rule.rule} busy={busy}
          onRun={() => void act('agent.keepRuleRun')}
          onRevoke={() => void act('agent.keepRuleRevoke', { id: rule.rule!.id })} />
      ) : (
        <RuleOff t={t} sdk={sdk} busy={busy} lastVault={lastVault}
          onAsk={(workspaceId, vaultName) => void act('agent.keepRuleSet', { projectDir, workspaceId, vaultName })} />
      )}
      {error && <p className="caveat err">{keepErrorText(t, error)}</p>}
    </div>
  );
}

function RuleOn({ t, rule, busy, onRun, onRevoke }: {
  t: Dict; rule: KeepRuleView; busy: boolean; onRun: () => void; onRevoke: () => void;
}): JSX.Element {
  const r = rule.receipt;
  return (
    <>
      <p className="kept-ok">{fill(t.keepRuleOn, { vault: rule.vaultName, hours: rule.quarantineHours })}</p>
      {!r ? (
        <p className="muted small">{t.keepRuleNoPass}</p>
      ) : r.error ? (
        <p className="caveat err">{fill(t.keepRulePassError, { when: ago(r.at, t), error: keepErrorText(t, r.error) })}</p>
      ) : (
        <p className="small">
          {fill(t.keepRulePass, { when: ago(r.at, t), kept: r.kept, waiting: r.waiting })}
          {r.deferred > 0 && <> {fill(t.keepRuleDeferred, { n: r.deferred })}</>}
        </p>
      )}
      {r && r.held > 0 && <p className="caveat">{fill(t.keepRuleHeld, { n: r.held })}</p>}
      {r?.failed.map((f) => (
        <p key={f.session} className="caveat err">{fill(t.keepConvOneFailed, { error: keepErrorText(t, f.error) })}</p>
      ))}
      <div className="keep-row">
        <button type="button" disabled={busy} onClick={onRun}>{busy ? t.keeping : t.keepRuleRun}</button>
        <button type="button" disabled={busy} onClick={onRevoke}>{t.keepRuleRevoke}</button>
      </div>
      <p className="caveat">{t.keepRuleRevokeCaveat}</p>
    </>
  );
}

function RuleOff({ t, sdk, busy, lastVault, onAsk }: {
  t: Dict; sdk: MnemoCartridgeSDK; busy: boolean; lastVault: string;
  onAsk: (workspaceId: string, vaultName: string) => void;
}): JSX.Element {
  const { vaults, error, retry } = useKeepDestinations(sdk, t);
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (vaults) setTarget((prev) => (prev && vaults.some((v) => v.workspaceId === prev) ? prev : defaultDestination(vaults, lastVault)));
  }, [vaults, lastVault]);

  if (vaults === null) return <p className="muted small">{t.reading}</p>;
  if (error) return <><p className="caveat err">{error}</p><button type="button" onClick={retry}>{t.retry}</button></>;
  if (vaults.length === 0) return <p className="muted small">{t.keepConvNoVault}</p>;
  const name = vaults.find((v) => v.workspaceId === target)?.name ?? target;
  return (
    <>
      <div className="keep-row">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t.keepConvVault}>
          {vaults.map((v) => <option key={v.workspaceId} value={v.workspaceId}>{v.name}</option>)}
        </select>
        <button type="button" disabled={busy || !target} onClick={() => onAsk(target, name)}>{t.keepRuleAsk}</button>
      </div>
      <p className="caveat">{t.keepRuleCaveat}</p>
    </>
  );
}
