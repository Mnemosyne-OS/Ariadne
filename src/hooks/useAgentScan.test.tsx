/**
 * useAgentScan.test.tsx — what the scan asks the host for.
 *
 * The borrowed title (the summary of a task note's sidecar) is an Antigravity
 * thing. Asked of a Claude Code session, it cost three refused reads per
 * untitled session on every five-second pass.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { useAgentScan } from './useAgentScan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A Claude Code transcript with no `custom-title` line: an untitled session. */
const UNTITLED = JSON.stringify({
  type: 'user', timestamp: '2026-10-05T10:00:00.000Z', sessionId: 's1',
  cwd: '/repo', gitBranch: 'main', message: { role: 'user', content: 'hello' },
}) + '\n';

function fakeSdk() {
  const reads: string[] = [];
  const invoke = async (action: string, payload: { dirPath?: string; filePath?: string }) => {
    // The real bridge answers on a later tick; so does this one.
    await Promise.resolve();
    if (action === 'dialog.readDir') {
      if (payload.dirPath === '/root') {
        return { success: true, files: [
          { name: 's1.jsonl', path: '/root/s1.jsonl', isDirectory: false, sizeBytes: UNTITLED.length, mtime: 1 },
        ] };
      }
      return { success: true, files: [] };
    }
    if (action === 'dialog.readFile') {
      reads.push(payload.filePath ?? '');
      if (payload.filePath === '/root/s1.jsonl') return { success: true, content: UNTITLED };
      return { success: false, error: 'not found' };
    }
    return { success: false };
  };
  return { reads, sdk: { invoke } as unknown as MnemoCartridgeSDK };
}

let root: Root | null = null;
let el: HTMLDivElement | null = null;
const FOLDERS = { 'claude-code': '/root' };

function Host({ sdk }: { sdk: MnemoCartridgeSDK }) {
  useAgentScan(sdk, FOLDERS, 'error');
  return null;
}

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  el?.remove();
  root = null; el = null;
});

describe('useAgentScan', () => {
  it('never asks for a note sidecar on a source whose notes have none', async () => {
    const { reads, sdk } = fakeSdk();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => { root!.render(<Host sdk={sdk} />); await Promise.resolve(); });
    for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });

    expect(reads).toContain('/root/s1.jsonl');
    expect(reads.filter(p => p.endsWith('.metadata.json'))).toEqual([]);
  });
});
