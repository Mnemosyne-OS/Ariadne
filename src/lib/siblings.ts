/**
 * Finding an agent's twin, once a first one is connected.
 *
 * Antigravity installs twice on this machine — the standalone app and the IDE —
 * and their folders differ by one segment. Picking the second by hand is
 * friction for nothing once the first is known.
 *
 * ## Why this is derivation and not detection
 *
 * A cartridge cannot resolve a home-relative path, and it must not be able to:
 * `dialog:open` already lets it READ any absolute path under the home, so the
 * only thing keeping it out of `~/.ssh` is that it does not know where that is.
 * A resolver would hand it over.
 *
 * So nothing is probed out of thin air. A candidate is derived ONLY from a
 * folder the human already designated: strip the known agent's declared hint
 * off the path they chose, and what remains is the root to try the other hint
 * against. The app learns no location it was not already given.
 *
 * The candidate is then offered, never adopted: connecting it stays a click.
 */
import type { Source } from './sources';

export interface Candidate {
  sourceId: string;
  /** The absolute path derived, to show BEFORE anything is connected. */
  path: string;
  /** The already-connected agent it was derived from. */
  fromSourceId: string;
}

/** Windows hands back both separators; comparisons need one. */
const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * The prefix of `chosen` that sits above `hint`, or null when the folder the
 * human picked does not end with the hint at all — which is normal: they are
 * free to point anywhere, and a folder that does not match simply derives
 * nothing.
 */
export function rootAbove(chosen: string, hint: string): string | null {
  const c = slash(chosen);
  const h = slash(hint);
  if (!h) return null;
  const suffix = '/' + h;
  if (!c.toLowerCase().endsWith(suffix.toLowerCase())) return null;
  return c.slice(0, c.length - suffix.length);
}

/**
 * Candidates for every source that has no folder yet, derived from the ones
 * that do. At most one candidate per source, from the first configured agent
 * whose hint the chosen folder actually matches.
 */
export function deriveCandidates(
  sources: readonly Source[],
  folders: Readonly<Record<string, string>>,
): Candidate[] {
  const out: Candidate[] = [];

  for (const target of sources) {
    if (folders[target.id]) continue;                  // already connected
    const hint = target.sessions.folderHint;
    if (!hint) continue;

    for (const known of sources) {
      const chosen = folders[known.id];
      const knownHint = known.sessions.folderHint;
      if (!chosen || !knownHint || known.id === target.id) continue;

      const root = rootAbove(chosen, knownHint);
      if (root === null) continue;

      const path = `${root}/${slash(hint)}`;
      // A hint that derives the folder we started from is not a discovery.
      if (slash(path).toLowerCase() === slash(chosen).toLowerCase()) continue;

      out.push({ sourceId: target.id, path, fromSourceId: known.id });
      break;
    }
  }
  return out;
}
