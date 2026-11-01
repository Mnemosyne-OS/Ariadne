/**
 * An iframe served an older SDK build (no onAgentActions) warns and serves
 * nothing: never a crash. Mounted with react-dom directly, like the other
 * component tests here — no testing-library, so this adds no dependency.
 */
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import AriadneAgentActions from './AriadneAgentActions';
import type { AriadneAgentContext } from '../lib/ariadneAgent';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AriadneAgentActions', () => {
  it('an SDK build without onAgentActions is warned about, never a crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const props = { sdk: {} as MnemoCartridgeSDK } as AriadneAgentContext & { sdk: MnemoCartridgeSDK };
    const host = document.createElement('div');
    const root = createRoot(host);
    expect(() => act(() => root.render(<AriadneAgentActions {...props} />))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no onAgentActions'));
    act(() => root.unmount());
    warn.mockRestore();
  });
});
