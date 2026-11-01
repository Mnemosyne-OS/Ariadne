/**
 * Serves Ariadne's agent actions (doc 149) while the window is open.
 *
 * A CHILD that renders nothing, never a hook in App: App is mounted on the
 * person's board while the app runs, and a hook added to it breaks the order
 * of its hooks under hot reload. The handlers live in `lib/ariadneAgent.ts`;
 * this only keeps their view of the app fresh (a ref written every render)
 * and subscribes ONCE.
 */
import { useEffect, useRef } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { ariadneAgentHandlers, type AriadneAgentContext } from '../lib/ariadneAgent';

export default function AriadneAgentActions({ sdk, ...props }: AriadneAgentContext & { sdk: MnemoCartridgeSDK }): null {
  const latest = useRef(props);
  latest.current = props;
  const sdkRef = useRef(sdk);

  useEffect(() => {
    const host = sdkRef.current;
    if (typeof host.onAgentActions !== 'function') {
      // An iframe served an older SDK build: it must not take the window down.
      console.warn('[Ariadne] this SDK build has no onAgentActions; reload the cartridge to serve agent actions');
      return undefined;
    }
    const sub = host.onAgentActions(ariadneAgentHandlers(() => latest.current));
    sub.ready.catch((err: unknown) => console.warn('[Ariadne] agent actions not served:', err instanceof Error ? err.message : err));
    return () => sub.off();
  }, []);

  return null;
}
