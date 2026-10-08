/**
 * The vaults a conversation can be kept in, asked when a keep panel opens.
 *
 * The permission refresh comes first: on the run where Ariadne gains a
 * permission, the registry built at startup still refuses, and that refusal
 * must not read as "no vault". Shared by the one-off keep and the standing rule.
 */
import { useEffect, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { readDestinations, type KeepDestination } from '../lib/keepConversation';
import type { Dict } from '../i18n';

export interface KeepDestinations {
  /** Null while asking. An empty list is a real answer. */
  vaults: KeepDestination[] | null;
  /** Why there is no list. Kept apart from an empty list. */
  error: string | null;
  retry: () => void;
}

/** Asks the app for the vaults a session can be kept in, once per mount and on retry. */
export function useKeepDestinations(sdk: MnemoCartridgeSDK, t: Dict): KeepDestinations {
  const [vaults, setVaults] = useState<KeepDestination[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setVaults(null);
    setError(null);
    void (async () => {
      try {
        const perms = await sdk.invoke<{ granted?: Record<string, boolean> }>(
          'permissions.refresh', { permissions: ['vault:read', 'vault:write'] });
        if (cancelled) return;
        if (perms?.granted?.['vault:read'] === false || perms?.granted?.['vault:write'] === false) {
          setError(t.keepNoPermission);
          setVaults([]);
          return;
        }
        const res = await sdk.invoke<{ success: boolean; vaults?: unknown; error?: string }>('agent.keepDestinations');
        if (cancelled) return;
        if (!res?.success) {
          setError(res?.error ?? t.keepConvNoList);
          setVaults([]);
          return;
        }
        setVaults(readDestinations(res));
      } catch (err) {
        console.warn('[Ariadne] could not list keep destinations:', err);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setVaults([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sdk, t.keepNoPermission, t.keepConvNoList, refresh]);

  return { vaults, error, retry: () => setRefresh((n) => n + 1) };
}
