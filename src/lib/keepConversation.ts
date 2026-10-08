/**
 * Keeping whole conversations in memory (doc 132 lot 1), the pure half.
 *
 * The host does the work: it renders the session, holds back any section with
 * a secret, and writes ONE Markdown file per session into a watched folder of
 * the vault the human picked. Keeping a session again replaces its file, so
 * the vault never holds two copies. This module only reads what came back.
 */

/** A vault whose watched folder takes Markdown, as the host lists it. */
export interface KeepDestination { workspaceId: string; name: string }

/** One session's answer, as the host returns it. */
export type KeepResult =
  | { transcript: string; ok: true; file: string; written: boolean; sections: number; injected: number;
      held: Array<{ section: number; secrets: string[]; words: number; samples: string[] }> }
  | { transcript: string; ok: false; error: string };

export interface KeepTally {
  /** Sessions now in the vault (written or already identical). */
  kept: number;
  /** Of those, how many already held these exact bytes. */
  unchanged: number;
  /** Sections held back for a secret, over all sessions. */
  heldSections: number;
  /** The kinds of secret found, deduplicated. Never a value. */
  secretKinds: string[];
  failed: Array<{ transcript: string; error: string }>;
}

/** Reads the host's list. Anything malformed is dropped, never shown as a vault. */
export function readDestinations(raw: unknown): KeepDestination[] {
  const vaults = (raw as { vaults?: unknown })?.vaults;
  if (!Array.isArray(vaults)) return [];
  return vaults
    .filter((v): v is KeepDestination =>
      typeof (v as KeepDestination)?.workspaceId === 'string' && !!(v as KeepDestination).workspaceId
      && typeof (v as KeepDestination)?.name === 'string')
    .map((v) => ({ workspaceId: v.workspaceId, name: v.name || v.workspaceId }));
}

/** The vault to preselect: the last one used if it still exists, else the first. */
export function defaultDestination(list: KeepDestination[], last: string): string {
  if (list.some((v) => v.workspaceId === last)) return last;
  return list[0]?.workspaceId ?? '';
}

/** Sums the host's answer. A session missing from the answer counts as failed. */
export function tallyKeep(asked: string[], results: unknown): KeepTally {
  const list = Array.isArray(results) ? (results as KeepResult[]) : [];
  const byPath = new Map(list.filter((r) => typeof r?.transcript === 'string').map((r) => [r.transcript, r]));
  const t: KeepTally = { kept: 0, unchanged: 0, heldSections: 0, secretKinds: [], failed: [] };
  const kinds = new Set<string>();
  for (const path of asked) {
    const r = byPath.get(path);
    if (!r) { t.failed.push({ transcript: path, error: 'NO_ANSWER' }); continue; }
    if (!r.ok) { t.failed.push({ transcript: path, error: r.error }); continue; }
    t.kept += 1;
    if (!r.written) t.unchanged += 1;
    const held = Array.isArray(r.held) ? r.held : [];
    t.heldSections += held.length;
    for (const h of held) for (const k of h.secrets ?? []) kinds.add(k);
  }
  t.secretKinds = [...kinds].sort();
  return t;
}

/** A standing rule as the host lists it (doc 132 lot 2), with its last pass. */
export interface KeepRuleView {
  id: string;
  projectDir: string;
  workspaceId: string;
  vaultName: string;
  quarantineHours: number;
  receipt: {
    at: string; kept: number; unchanged: number; waiting: number; deferred: number; held: number;
    failed: Array<{ session: string; error: string }>; error?: string;
  } | null;
}

/** The folder holding a transcript: the project a rule is about. */
export function projectDirOf(transcriptPath: string): string {
  return transcriptPath.replace(/[\\/][^\\/]+$/, '');
}

const folderKey = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** The rule for this project, if there is one. Malformed rows are dropped. */
export function ruleFor(raw: unknown, projectDir: string): KeepRuleView | null {
  const rules = (raw as { rules?: unknown })?.rules;
  if (!Array.isArray(rules)) return null;
  const key = folderKey(projectDir);
  const hit = rules.find((r) => typeof (r as KeepRuleView)?.projectDir === 'string'
    && typeof (r as KeepRuleView)?.id === 'string' && folderKey((r as KeepRuleView).projectDir) === key);
  return (hit as KeepRuleView | undefined) ?? null;
}

/**
 * A host refusal in words, with the raw code beside it: the words say what to
 * do next, the code is what to quote when it is not enough. An unknown code
 * is shown as it came.
 */
export function keepErrorText(t: Record<string, string>, code: string): string {
  // A deadline hit arrives as "Error: TIMEOUT" through the bridge.
  const bare = code.replace(/^Error:\s*/, '');
  const words = t[`keepErr_${bare}`];
  return words ? `${words} (${bare})` : code;
}
