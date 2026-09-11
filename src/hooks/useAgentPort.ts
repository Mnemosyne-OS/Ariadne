/**
 * Who answers the agents on the SDK port, from Ariadne's side.
 *
 * Ariadne lists the sessions an agent harness wrote on disk. What it cannot
 * see from a file is whether those agents are reaching THIS app: when the app
 * is closed, the MCP spawns a headless daemon on 7799, and until 2026-09-06
 * nothing ever ended that daemon — it could still hold the port when the app
 * came back, and the app's own server lost the bind with one line in a log.
 * Every memory call on the machine then goes through that process instead.
 *
 * 🚨 A refusal STOPS the loop. The host re-asks permission after a Deny, so a
 * poll that retried would raise the native dialog every ten seconds, forever —
 * the trap `useCockpit` documents, paid once already.
 *
 * 🎭 Three states, and no fourth: `null` status means nobody could read it,
 * which is neither "serving" nor "not serving".
 */
import { useEffect, useState } from 'react';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';

/** Mirrors the host's AgentPortStatus (doc 52 action `system.agentPort`). */
export interface AgentPortStatus {
  serving: boolean;
  port: number;
  since: number | null;
  reason: string | null;
  /** Null when this app is not the one serving: the clients are on the other
   *  process's socket, so zero would be a count nobody took. */
  clients: number | null;
  apps: number | null;
}

/** How often the line re-reads, while the reads keep working. */
export const AGENT_PORT_POLL_MS = 10_000;

export interface AgentPort {
  /** The last reading, or null while unknown. */
  status: AgentPortStatus | null;
  /** True once a read has come back, whatever it said. */
  answered: boolean;
}

export function useAgentPort(sdk: MnemoCartridgeSDK): AgentPort {
  const [status, setStatus] = useState<AgentPortStatus | null>(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const read = () => {
      sdk.invoke<AgentPortStatus | null>('system.agentPort').then(res => {
        if (!alive) return;
        setAnswered(true);
        setStatus(res && typeof res.serving === 'boolean' ? res : null);
        // Only a successful read earns another one.
        timer = setTimeout(read, AGENT_PORT_POLL_MS);
      }).catch(err => {
        // Refused, or a host too old to know the action. Either way this is
        // the end of the loop, not a reason to ask again in ten seconds.
        console.warn('[Ariadne] system.agentPort unavailable:', err);
        if (!alive) return;
        setAnswered(true);
        setStatus(null);
      });
    };
    read();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [sdk]);

  return { status, answered };
}
