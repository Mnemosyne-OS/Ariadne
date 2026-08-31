/**
 * The agents Ariadne can read.
 *
 * One entry per session connector. Adding an agent means adding its connector
 * file and one line here — nothing else in the app learns its name, its format
 * or where it writes.
 *
 * ⚠️ An agent with no working connector does NOT get an entry. A card that
 * cannot open is a promise the app cannot keep, and an empty hub is more honest
 * than a row that greets you with an apology.
 */
import { CONNECTORS, type Connector } from '@mnemosyne_os/agent-transcripts';

export interface Source {
  /** Stable id, used as the settings key for this agent's folder. */
  id: string;
  /** Reads the agent's session transcripts. */
  sessions: Connector;
  /** Reads notes written alongside them, when the agent keeps any. */
  notes?: Connector;
}

export const SOURCES: Source[] = [
  {
    id: 'claude-code',
    sessions: CONNECTORS['claude-code'],
    notes: CONNECTORS['claude-memory'],
  },
  {
    // It does keep documents of its own — task.md, implementation_plan.md,
    // walkthrough.md — beside each transcript. An earlier comment here claimed
    // it kept none; that was written before anyone looked in the folder.
    id: 'antigravity',
    sessions: CONNECTORS['antigravity'],
    notes: CONNECTORS['antigravity-notes'],
  },
  {
    id: 'antigravity-ide',
    sessions: CONNECTORS['antigravity-ide'],
    notes: CONNECTORS['antigravity-ide-notes'],
  },
];

export function sourceById(id: string | null): Source | null {
  return SOURCES.find(s => s.id === id) ?? null;
}
