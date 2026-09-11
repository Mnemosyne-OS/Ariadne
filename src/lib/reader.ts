/**
 * The reading tools of the document panel: how long this is, and what is in it.
 *
 * Pure and separate from the view, because two things here can quietly lie and
 * a test is the only thing that keeps them honest: a reading time computed a
 * different way from the one the Notes widget shows for the same file, and an
 * outline whose entries point at anchors the renderer never emitted.
 */

/**
 * Words a minute, the figure the reading time is derived from.
 *
 * ⚠️ DUPLICATED, knowingly: the host's Notes inspector computes its own with
 * `Math.max(1, Math.ceil(words / 200))` in `NoteEditor.tsx`, and Ariadne is a
 * separate bundle that cannot import from it. The number is copied rather than
 * chosen so that ONE markdown file does not get two different reading times
 * depending on which surface opened it — the `LIVE_MINUTES` lesson (doc 93),
 * without a shared package for a single integer. If the host's changes, this
 * has to follow, and the test below says the value out loud so a diff shows it.
 */
export const WORDS_PER_MINUTE = 200;

export interface ReadingStats {
  words: number;
  characters: number;
  /** Whole minutes, at least one — but ZERO for an empty document. */
  readTime: number;
}

/**
 * 🎭 An empty document has no reading time, and `Math.max(1, …)` would give it
 * one minute. Zero here means "nothing to read", which the panel renders as
 * nothing rather than as a measurement.
 */
export function readingStats(text: string): ReadingStats {
  const clean = text.trim();
  if (!clean) return { words: 0, characters: 0, readTime: 0 };
  const words = clean.split(/\s+/).filter(Boolean).length;
  return {
    words,
    characters: clean.length,
    readTime: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
}

export interface OutlineEntry {
  /** 1, 2 or 3 — the levels the renderer draws. */
  level: number;
  text: string;
  /** The DOM id the renderer gave that heading. */
  id: string;
}

/**
 * A stable id for one heading.
 *
 * 🚨 Used by BOTH this outline and `renderMarkdown`. Two implementations would
 * drift the first time a heading contained punctuation, and the outline would
 * scroll to nothing — a control that silently does nothing, which is worse
 * than no outline.
 *
 * `seen` carries the duplicates: two "## Notes" in one document must not share
 * an id, or the second is unreachable. Both callers walk the text top-down, so
 * the same heading gets the same suffix on both sides.
 */
export function headingId(text: string, seen: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9À-ɏ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    // A heading of nothing but punctuation still needs an anchor.
    || 'h';
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? `md-${base}` : `md-${base}-${n + 1}`;
}

/**
 * The document's headings, in order.
 *
 * 🪤 Fenced code is SKIPPED, exactly as the renderer skips it. A `# TODO` line
 * inside a shell block is not a heading: counting it would put an entry in the
 * outline with no anchor anywhere in the document, and the panel would look
 * broken on precisely the files an agent writes most.
 */
export function outlineOf(text: string): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (!m) continue;
    const label = (m[2] ?? '').trim();
    if (!label) continue;
    out.push({ level: (m[1] ?? '#').length, text: label, id: headingId(label, seen) });
  }
  return out;
}
