/**
 * useAgentPort.test.tsx — the line asks again while it is being answered, and
 * stops the moment it is refused.
 *
 * The refusal rule is the whole point: the host re-asks for permission after a
 * Deny, so a poll that retried would raise the native dialog every ten seconds
 * on nobody's gesture. `useCockpit` paid that once already; this hook is
 * written from its scar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { useAgentPort, AGENT_PORT_POLL_MS, type AgentPort, type AgentPortStatus } from './useAgentPort';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = (over: Partial<AgentPortStatus> = {}): AgentPortStatus => ({
  serving: true, port: 7799, since: 1, reason: null, clients: 0, apps: 0, ...over,
});

interface FakeSdk { invoke: (action: string) => Promise<unknown>; calls: number }

function fakeSdk(answer: () => Promise<unknown>): FakeSdk {
  const sdk = { calls: 0, invoke: (_action: string) => { sdk.calls += 1; return answer(); } };
  return sdk;
}

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let root: Root | null = null;
let el: HTMLDivElement | null = null;
let latest: AgentPort | null = null;

function Host({ sdk }: { sdk: FakeSdk }) {
  latest = useAgentPort(sdk as unknown as MnemoCartridgeSDK);
  return null;
}

function mount(sdk: FakeSdk) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => { root!.render(<Host sdk={sdk} />); });
}

beforeEach(() => { latest = null; vi.useFakeTimers(); });
afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  el?.remove();
  root = null; el = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAgentPort', () => {
  it('reads once at mount and keeps reading while it is answered', async () => {
    const sdk = fakeSdk(() => Promise.resolve(status({ clients: 2 })));
    mount(sdk);
    await settle();
    expect(sdk.calls).toBe(1);
    expect(latest!.status?.clients).toBe(2);
    expect(latest!.answered).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(AGENT_PORT_POLL_MS + 10); });
    expect(sdk.calls).toBe(2);
  });

  it('STOPS after a refusal — a poll that retried would raise the dialog forever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdk = fakeSdk(() => Promise.reject(new Error('PERMISSION_DENIED')));
    mount(sdk);
    await settle();
    expect(sdk.calls).toBe(1);
    // …and the state says unknown, not "not serving".
    expect(latest!.status).toBeNull();
    expect(latest!.answered).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(AGENT_PORT_POLL_MS * 6); });
    expect(sdk.calls).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('treats an answer that is not a status as unknown, never as serving', async () => {
    const sdk = fakeSdk(() => Promise.resolve({ nonsense: true }));
    mount(sdk);
    await settle();
    // 🎭 A host too old to know the action can answer something shapeless.
    // Reading `serving` off it would print a verdict nobody measured.
    expect(latest!.status).toBeNull();
  });

  it('stops when the widget closes', async () => {
    const sdk = fakeSdk(() => Promise.resolve(status()));
    mount(sdk);
    await settle();
    expect(sdk.calls).toBe(1);

    act(() => { root!.unmount(); });
    root = null;
    await act(async () => { await vi.advanceTimersByTimeAsync(AGENT_PORT_POLL_MS * 4); });
    expect(sdk.calls).toBe(1);
  });
});
