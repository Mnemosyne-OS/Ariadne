/**
 * Keeping conversations in memory (doc 132 lot 1): the panel, its pure half,
 * and the table's selection. Mounted with react-dom directly, like the other
 * component tests here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import KeepConversation from './KeepConversation';
import Dashboard from './Dashboard';
import { dictFor, fill } from '../i18n';
import { readDestinations, defaultDestination, tallyKeep, keepErrorText } from '../lib/keepConversation';
import { rememberKeptConversations, DEFAULTS, savedKey } from '../lib/settings';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import type { SessionState, Connector } from '@mnemosyne_os/agent-transcripts';

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

const VAULTS = { success: true, vaults: [{ workspaceId: 'W/notes', name: 'Notes' }, { workspaceId: 'W/agents', name: 'Agents' }] };

function sdkWith(answers: Record<string, unknown>) {
  const invoke = vi.fn((action: string): Promise<unknown> => {
    if (action === 'permissions.refresh') return Promise.resolve({ granted: { 'vault:read': true, 'vault:write': true } });
    if (action in answers) return Promise.resolve(answers[action]);
    return Promise.reject(new Error(`unexpected ${action}`));
  });
  return { sdk: { invoke } as unknown as MnemoCartridgeSDK, invoke };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

const ONE = [{ path: 'C:/p/s1.jsonl', title: 'Why the cap' }];

describe('lib/keepConversation', () => {
  it('drops a destination without a workspace id', () => {
    expect(readDestinations({ vaults: [{ name: 'x' }, { workspaceId: 'W', name: '' }] })).toEqual([{ workspaceId: 'W', name: 'W' }]);
    expect(readDestinations(null)).toEqual([]);
  });

  it('preselects the last vault only while it still exists', () => {
    const list = readDestinations(VAULTS);
    expect(defaultDestination(list, 'W/agents')).toBe('W/agents');
    expect(defaultDestination(list, 'W/gone')).toBe('W/notes');
    expect(defaultDestination([], 'W/agents')).toBe('');
  });

  it('counts a session the host did not answer for as failed', () => {
    const tally = tallyKeep(['a', 'b', 'c'], [
      { transcript: 'a', ok: true, written: false, sections: 2, injected: 0, held: [] },
      { transcript: 'b', ok: true, written: true, sections: 3, injected: 1,
        held: [{ section: 1, secrets: ['JWT'], words: 0, samples: [] }, { section: 2, secrets: ['JWT', 'GITHUB_TOKEN'], words: 0, samples: [] }] },
    ]);
    expect(tally).toEqual({
      kept: 2, unchanged: 1, heldSections: 2, secretKinds: ['GITHUB_TOKEN', 'JWT'],
      failed: [{ transcript: 'c', error: 'NO_ANSWER' }],
    });
  });

  it('says a known refusal in words with its code, an unknown one as it came, and a deadline as a deadline', () => {
    expect(keepErrorText(t, 'TOO_LARGE')).toBe(`${t.keepErr_TOO_LARGE} (TOO_LARGE)`);
    expect(keepErrorText(t, 'Error: TIMEOUT')).toBe(`${t.keepErr_TIMEOUT} (TIMEOUT)`);
    expect(keepErrorText(t, 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('remembers every kept session and the vault for the next keep', () => {
    const s = rememberKeptConversations(DEFAULTS, ['C:\\P\\a.jsonl', 'C:/p/b.jsonl'], 'W/agents', { vault: 'Agents', at: 'T' });
    expect(s.keptConversations[savedKey('c:/p/a.jsonl')]).toEqual({ vault: 'Agents', at: 'T' });
    expect(Object.keys(s.keptConversations)).toHaveLength(2);
    expect(s.lastKeepVault).toBe('W/agents');
  });
});

describe('KeepConversation', () => {
  it('lists the vaults, preselects the last one, and keeps the session in it', async () => {
    const results = [{ transcript: 'C:/p/s1.jsonl', ok: true, written: true, sections: 4, injected: 2, held: [] }];
    const { sdk, invoke } = sdkWith({ 'agent.keepDestinations': VAULTS, 'agent.keepConversations': { success: true, results } });
    const onKept = vi.fn();
    act(() => root.render(<KeepConversation t={t} sdk={sdk} sessions={ONE} lastVault="W/agents" onKept={onKept} />));
    await flush();
    const select = host.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('W/agents');
    act(() => (host.querySelector('button.primary') as HTMLButtonElement).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith('agent.keepConversations', {
      workspaceId: 'W/agents', items: [{ transcript: 'C:/p/s1.jsonl', title: 'Why the cap' }],
    });
    expect(host.textContent).toContain(fill(t.keepConvDone, { n: 1, vault: 'Agents' }));
    expect(onKept).toHaveBeenCalledWith(['C:/p/s1.jsonl'], 'W/agents', 'Agents', expect.any(String));
  });

  it('says what was held back by kind, and leaves a failed session out of the marks', async () => {
    const two = [...ONE, { path: 'C:/p/s2.jsonl', title: null }];
    const results = [
      { transcript: 'C:/p/s1.jsonl', ok: true, written: true, sections: 4, injected: 0, held: [{ section: 2, secrets: ['JWT'], words: 0, samples: ['eyJh… (80)'] }] },
      { transcript: 'C:/p/s2.jsonl', ok: false, error: 'UNREADABLE' },
    ];
    const { sdk } = sdkWith({ 'agent.keepDestinations': VAULTS, 'agent.keepConversations': { success: true, results } });
    const onKept = vi.fn();
    act(() => root.render(<KeepConversation t={t} sdk={sdk} sessions={two} lastVault="" onKept={onKept} />));
    await flush();
    expect(host.querySelector('button.primary')?.textContent).toBe(fill(t.keepConvMany, { n: 2 }));
    act(() => (host.querySelector('button.primary') as HTMLButtonElement).click());
    await flush();
    expect(host.textContent).toContain(fill(t.keepConvHeld, { n: 1, kinds: 'JWT' }));
    expect(host.textContent).toContain(fill(t.keepConvOneFailed, { error: keepErrorText(t, 'UNREADABLE') }));
    expect(host.textContent).toContain(t.keepErr_UNREADABLE);
    expect(host.textContent).not.toContain('eyJh');
    expect(onKept).toHaveBeenCalledWith(['C:/p/s1.jsonl'], 'W/notes', 'Notes', expect.any(String));
  });

  it('tells "no vault takes Markdown" apart from "the list could not be read"', async () => {
    const empty = sdkWith({ 'agent.keepDestinations': { success: true, vaults: [] } });
    act(() => root.render(<KeepConversation t={t} sdk={empty.sdk} sessions={ONE} lastVault="" onKept={() => {}} />));
    await flush();
    expect(host.textContent).toContain(t.keepConvNoVault);

    const refused = sdkWith({ 'agent.keepDestinations': { success: false, error: 'DESTINATIONS_UNAVAILABLE' } });
    act(() => root.render(<KeepConversation key="b" t={t} sdk={refused.sdk} sessions={ONE} lastVault="" onKept={() => {}} />));
    await flush();
    expect(host.textContent).toContain('DESTINATIONS_UNAVAILABLE');
    expect(host.textContent).not.toContain(t.keepConvNoVault);
  });

  it('shows the host refusal of the whole keep, and records nothing', async () => {
    const { sdk } = sdkWith({ 'agent.keepDestinations': VAULTS, 'agent.keepConversations': { success: false, error: 'NO_MD_TARGET' } });
    const onKept = vi.fn();
    act(() => root.render(<KeepConversation t={t} sdk={sdk} sessions={ONE} lastVault="" onKept={onKept} />));
    await flush();
    act(() => (host.querySelector('button.primary') as HTMLButtonElement).click());
    await flush();
    expect(host.textContent).toContain('NO_MD_TARGET');
    expect(onKept).not.toHaveBeenCalled();
  });
});

describe('the selection column', () => {
  const session = (id: string): SessionState => ({
    path: `C:/t/${id}.jsonl`, sessionId: id, title: id, lastEventAt: '2026-09-08T20:00:00.000Z',
    projectPath: 'C:/proj', branch: 'main', humanTurns: [], isSidechain: false, artifactsCapped: false, artifacts: [],
  } as unknown as SessionState);
  const dash = (selected: ReadonlySet<string> | null, onToggle = vi.fn()) => (
    <Dashboard
      t={t} lang="en" sessions={[session('a'), session('b')]} docs={[]} live={0} collisions={[]}
      agentOf={new Map()} unplaceable={0} busy={false} error={null}
      stats={{ entries: 1, sessionFiles: 2, noteFiles: 0 }}
      folder="C:/t" openSession={null} onOpenSession={() => {}}
      connector={{ id: 'claude-code', displayName: 'Claude Code', mark: { label: 'CC' } } as unknown as Connector}
      pinned={new Set()} onTogglePin={() => {}} onPinLive={() => {}}
      pinError={null} pinOmitted={0}
      agentPort={{ answered: false, status: null }}
      documents={[]} onBrowseDocuments={null} exported={{}} onOpenFile={() => {}}
      selected={selected} onToggleSelect={onToggle} onClearSelection={() => {}}
      keepSlot={<span data-testid="slot" />}
    />
  );

  it('a file the host refused is SAID even when the others read (doc 93 pass, 05/10)', () => {
    act(() => root.render(<Dashboard {...dash(null).props} stats={{ entries: 3, sessionFiles: 3, noteFiles: 0, unreadable: 1, refusal: 'File is too large' }} />));
    expect(host.textContent).toContain('1 file(s) of this folder could not be opened and are not listed: File is too large');
  });

  it('an empty folder names the agent it reads, not always Claude Code', () => {
    act(() => root.render(<Dashboard {...dash(null).props} sessions={[]}
      connector={{ id: 'antigravity', displayName: 'Antigravity', mark: { label: 'AG' } } as unknown as Connector} />));
    expect(host.textContent).toContain('This connector reads Antigravity');
  });

  it('draws no checkbox where keeping is not offered', () => {
    act(() => root.render(dash(null)));
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  });

  it('ticks a session by path, and shows the keep bar only once something is ticked', () => {
    const onToggle = vi.fn();
    act(() => root.render(dash(new Set(), onToggle)));
    expect(host.querySelector('[data-testid=keep-bar]')).toBeNull();
    act(() => (host.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement).click());
    expect(onToggle).toHaveBeenCalledWith('C:/t/b.jsonl');
    act(() => root.render(dash(new Set(['C:/t/b.jsonl']))));
    expect(host.querySelector('[data-testid=keep-bar]')?.textContent).toContain(fill(t.keepConvSelected, { n: 1 }));
    expect(host.querySelector('[data-testid=slot]')).not.toBeNull();
  });
});
