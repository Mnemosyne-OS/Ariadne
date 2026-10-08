/**
 * The standing keep rule panel (doc 132 lot 2). Ariadne asks; the app decides
 * in its own dialog. Mounted with react-dom directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import KeepRule from './KeepRule';
import { dictFor, fill } from '../i18n';
import { projectDirOf, ruleFor } from '../lib/keepConversation';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';

const t = dictFor('en');
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const PROJECT = 'C:\\Users\\u\\.claude\\projects\\C--repo';
const VAULTS = { success: true, vaults: [{ workspaceId: 'W/agents', name: 'Agents' }] };
const RULE = {
  id: 'r1', projectDir: PROJECT, workspaceId: 'W/agents', vaultName: 'Agents', quarantineHours: 24,
  receipt: { at: new Date().toISOString(), kept: 12, unchanged: 0, waiting: 2, deferred: 30, held: 1, failed: [] },
};

function sdkWith(answers: Record<string, unknown>) {
  const invoke = vi.fn((action: string): Promise<unknown> => {
    if (action === 'permissions.refresh') return Promise.resolve({ granted: { 'vault:read': true, 'vault:write': true } });
    if (action in answers) return Promise.resolve(answers[action]);
    return Promise.reject(new Error(`unexpected ${action}`));
  });
  return { sdk: { invoke } as unknown as MnemoCartridgeSDK, invoke };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
}

const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

describe('lib helpers', () => {
  it('projectDirOf takes the folder of a transcript, either separator', () => {
    expect(projectDirOf(`${PROJECT}\\s1.jsonl`)).toBe(PROJECT);
    expect(projectDirOf('/home/u/.claude/projects/p/s1.jsonl')).toBe('/home/u/.claude/projects/p');
  });

  it('ruleFor matches the project whatever the separators and case', () => {
    expect(ruleFor({ rules: [RULE] }, PROJECT.toLowerCase().replace(/\\/g, '/') + '/')?.id).toBe('r1');
    expect(ruleFor({ rules: [RULE] }, 'C:\\other')).toBeNull();
    expect(ruleFor(null, PROJECT)).toBeNull();
  });
});

describe('KeepRule', () => {
  it('asks the app for a rule on this project and this vault', async () => {
    const { sdk, invoke } = sdkWith({
      'agent.keepRules': { success: true, rules: [] },
      'agent.keepDestinations': VAULTS,
      'agent.keepRuleSet': { success: false, error: 'DECLINED' },
    });
    act(() => root.render(<KeepRule t={t} sdk={sdk} projectDir={PROJECT} lastVault="" />));
    await flush();
    act(() => button(t.keepRuleAsk).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith('agent.keepRuleSet', { projectDir: PROJECT, workspaceId: 'W/agents', vaultName: 'Agents' });
    // The person said no in the app's dialog: that is an answer, not an error.
    expect(host.querySelector('.err')).toBeNull();
    expect(button(t.keepRuleAsk)).toBeTruthy();
  });

  it('shows a refusal other than the person\'s own no', async () => {
    const { sdk } = sdkWith({
      'agent.keepRules': { success: true, rules: [] },
      'agent.keepDestinations': VAULTS,
      'agent.keepRuleSet': { success: false, error: 'NO_MD_TARGET' },
    });
    act(() => root.render(<KeepRule t={t} sdk={sdk} projectDir={PROJECT} lastVault="" />));
    await flush();
    act(() => button(t.keepRuleAsk).click());
    await flush();
    expect(host.querySelector('.err')?.textContent).toBe(`${t.keepErr_NO_MD_TARGET} (NO_MD_TARGET)`);
  });

  it('shows what the last pass did, and runs or revokes the rule', async () => {
    const { sdk, invoke } = sdkWith({
      'agent.keepRules': { success: true, rules: [RULE] },
      'agent.keepRuleRun': { success: true },
      'agent.keepRuleRevoke': { success: true },
    });
    act(() => root.render(<KeepRule t={t} sdk={sdk} projectDir={PROJECT} lastVault="" />));
    await flush();
    expect(host.textContent).toContain(fill(t.keepRuleOn, { vault: 'Agents', hours: 24 }));
    expect(host.textContent).toContain(fill(t.keepRuleDeferred, { n: 30 }));
    expect(host.textContent).toContain(fill(t.keepRuleHeld, { n: 1 }));
    act(() => button(t.keepRuleRun).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith('agent.keepRuleRun', undefined);
    act(() => button(t.keepRuleRevoke).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith('agent.keepRuleRevoke', { id: 'r1' });
    // Re-read after each act: the panel shows the host's answer, never a local guess.
    expect(invoke.mock.calls.filter((c) => c[0] === 'agent.keepRules').length).toBe(3);
  });

  it('says a pass could not run, with the reason', async () => {
    const failed = { ...RULE, receipt: { ...RULE.receipt, error: 'NO_MD_TARGET' } };
    const { sdk } = sdkWith({ 'agent.keepRules': { success: true, rules: [failed] } });
    act(() => root.render(<KeepRule t={t} sdk={sdk} projectDir={PROJECT} lastVault="" />));
    await flush();
    expect(host.querySelector('.err')?.textContent).toContain('NO_MD_TARGET');
  });

  it('tells "the rules could not be read" apart from "no rule"', async () => {
    const { sdk } = sdkWith({ 'agent.keepRules': { success: false, error: 'RULES_UNAVAILABLE' } });
    act(() => root.render(<KeepRule t={t} sdk={sdk} projectDir={PROJECT} lastVault="" />));
    await flush();
    expect(host.textContent).toContain('RULES_UNAVAILABLE');
    expect(button(t.keepRuleAsk)).toBeUndefined();
  });
});
