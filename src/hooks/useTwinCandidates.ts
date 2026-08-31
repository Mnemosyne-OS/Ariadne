/**
 * A twin agent, offered once its sibling is connected.
 *
 * The previous version of this probed each connector's `folderHint` directly.
 * It could never fire: a hint is HOME-RELATIVE, and the bridge resolves a
 * relative path against the main process's working directory, so it looked for
 * `<repo>/.gemini/antigravity/brain` and found nothing — silently.
 *
 * It must not be fixed by teaching the bridge to resolve home-relative paths
 * either: `dialog:open` already reads any absolute path under the home, so the
 * only thing keeping a cartridge out of `~/.ssh` is not knowing where it is.
 * Instead the candidate is DERIVED from a folder the human already gave (see
 * lib/siblings), probed with the absolute path that derivation yields, and
 * merely offered — connecting it stays a click.
 */
import { useEffect, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import type { DirEntry } from '@mnemosyne_os/agent-transcripts';
import { SOURCES } from '../lib/sources';
import { deriveCandidates, type Candidate } from '../lib/siblings';

/**
 * @param folders the agents already connected, keyed by source id. Deriving
 *   from anywhere else would be the app resolving a location nobody gave it.
 */
export function useTwinCandidates(
  sdk: MnemoCartridgeSDK, folders: Record<string, string>,
): Candidate[] {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    const derived = deriveCandidates(SOURCES, folders);
    if (derived.length === 0) { setCandidates([]); return; }

    const probe = async () => {
      const found: Candidate[] = [];
      for (const c of derived) {
        const res = await sdk.invoke<{ success: boolean; files?: DirEntry[] }>(
          'dialog.readDir', { dirPath: c.path });
        if (res?.success && res.files?.length) found.push(c);
      }
      if (!cancelled) setCandidates(found);
    };
    void probe();
    return () => { cancelled = true; };
  }, [sdk, folders]);

  return candidates;
}
