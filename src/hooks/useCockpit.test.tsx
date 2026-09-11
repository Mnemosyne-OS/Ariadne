/**
 * useCockpit.test.tsx — the hook talks to the host exactly as often as the
 * scan does, and not once more.
 *
 * Written for a defect the unit tests could not see: an answer that rebuilt
 * the pinned Set on every call re-ran the publish effect, whose answer rebuilt
 * the Set, which re-ran the effect — a publish loop with no scan behind it.
 * The second trap is the dialog storm: a refused publish must not be retried
 * every five seconds on nobody's gesture.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SessionState } from '@mnemosyne_os/agent-transcripts';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { useCockpit, sameMembers, type Cockpit } from './useCockpit';
import type { CardSource } from '../lib/cockpitCards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORDS = { unknown: '—', sidechain: 'subagent', files: '{n} files', pinFailed: 'refused' };

function session(path: string): SessionState {
  return {
    file: 's.jsonl', path, sessionId: path, title: path, model: null, projectPath: null, branch: null,
    isSidechain: false, lastEventAt: new Date().toISOString(), firstEventAt: null, tool: null,
    sizeBytes: 0, artifacts: [], artifactsCapped: false, humanTurns: [],
  };
}

type Answer = (action: string, payload: unknown) => Promise<unknown>;

interface FakeSdk {
  invoke: (action: string, payload?: unknown) => Promise<unknown>;
  calls: (action: string) => number;
}

function fakeSdk(answer: Answer): FakeSdk {
  const log: string[] = [];
  return {
    invoke: (action, payload) => { log.push(action); return answer(action, payload); },
    calls: action => log.filter(a => a === action).length,
  };
}

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let root: Root | null = null;
let el: HTMLDivElement | null = null;
let latest: Cockpit | null = null;

function Host({ sdk, rows }: { sdk: FakeSdk; rows: CardSource[] }) {
  latest = useCockpit(sdk as unknown as MnemoCartridgeSDK, rows, WORDS);
  return null;
}

function mount(sdk: FakeSdk, rows: CardSource[]) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => { root!.render(<Host sdk={sdk} rows={rows} />); });
}

function rerender(sdk: FakeSdk, rows: CardSource[]) {
  act(() => { root!.render(<Host sdk={sdk} rows={rows} />); });
}

beforeEach(() => { latest = null; });
afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  el?.remove();
  root = null; el = null;
});

describe('useCockpit', () => {
  it('asks the host at boot and publishes ONCE per scan, never in a loop', async () => {
    const sdk = fakeSdk((action) => {
      if (action === 'cockpit.state') return Promise.resolve({ success: true, pinned: ['a'] });
      if (action === 'cockpit.publish') return Promise.resolve({ success: true, pinned: ['a'], dropped: 0 });
      return Promise.resolve({ success: true });
    });
    const rows = [{ session: session('a'), mark: null }];
    mount(sdk, rows);
    await settle();
    expect(sdk.calls('cockpit.state')).toBe(1);
    expect(sdk.calls('cockpit.publish')).toBe(1);
    expect([...latest!.pinned]).toEqual(['a']);

    // Same rows object again: nothing to say.
    rerender(sdk, rows);
    await settle();
    expect(sdk.calls('cockpit.publish')).toBe(1);

    // A new scan: exactly one more.
    rerender(sdk, [{ session: session('a'), mark: null }]);
    await settle();
    expect(sdk.calls('cockpit.publish')).toBe(2);
  });

  it('publishes nothing while nothing is pinned', async () => {
    const sdk = fakeSdk(() => Promise.resolve({ success: true, pinned: [] }));
    mount(sdk, [{ session: session('a'), mark: null }]);
    await settle();
    expect(sdk.calls('cockpit.publish')).toBe(0);
  });

  it('stops publishing after a refusal until the next gesture', async () => {
    let refuse = true;
    const sdk = fakeSdk((action) => {
      if (action === 'cockpit.state') return Promise.resolve({ success: true, pinned: ['a'] });
      if (action === 'cockpit.publish') {
        return refuse
          ? Promise.reject(new Error('Unauthorized'))
          : Promise.resolve({ success: true, pinned: ['a', 'b'], dropped: 0 });
      }
      if (action === 'cockpit.pin') return Promise.resolve({ success: true, pinned: ['a', 'b'], level: 'hud' });
      return Promise.resolve({ success: true });
    });
    mount(sdk, [{ session: session('a'), mark: null }]);
    await settle();
    expect(sdk.calls('cockpit.publish')).toBe(1);
    expect(latest!.error).toBe('refused');

    // Two more scans: silence.
    rerender(sdk, [{ session: session('a'), mark: null }]);
    await settle();
    rerender(sdk, [{ session: session('a'), mark: null }]);
    await settle();
    expect(sdk.calls('cockpit.publish')).toBe(1);

    // A press resumes it: the pin, then the publish that follows a membership
    // change — and then it settles, instead of looping.
    refuse = false;
    act(() => { latest!.toggle({ session: session('b'), mark: null }); });
    await settle();
    await settle();
    expect(sdk.calls('cockpit.pin')).toBe(1);
    const after = sdk.calls('cockpit.publish');
    expect(after).toBeGreaterThanOrEqual(2);
    expect(latest!.error).toBeNull();
    await settle();
    expect(sdk.calls('cockpit.publish')).toBe(after);
  });

  it('sameMembers ignores order and catches any difference', () => {
    expect(sameMembers(new Set(['a', 'b']), ['b', 'a'])).toBe(true);
    expect(sameMembers(new Set(['a']), ['a', 'b'])).toBe(false);
    expect(sameMembers(new Set(['a', 'b']), ['a', 'c'])).toBe(false);
  });
});
