/**
 * Where you have been in the drawer.
 *
 * One panel holds sessions, notes and files, and everything in it links to
 * everything else: a session names its notes, a note wiki-links to other
 * notes, a file row opens a file. Following those links was a one-way trip —
 * the only control was Close, so the way back was to shut the panel, find the
 * list again and start over.
 *
 * A browser history, and the ordinary rules of one:
 *  - going somewhere new from the middle of the history DROPS the forward
 *    entries, because they are no longer where you came from
 *  - reopening what is already open is not a new place
 *  - closing forgets the trail; it is not a "back" you can undo
 */

export type PanelKind = 'session' | 'note' | 'file';

export interface PanelRef {
  kind: PanelKind;
  /** The PATH. Not a file name: `task.md` repeats across sessions, and a
   *  buried agent names every transcript the same, so a name identifies
   *  nothing. */
  file: string;
}

export interface PanelHistory {
  entries: PanelRef[];
  /** Index of the entry on screen, or -1 when the drawer is closed. */
  cursor: number;
}

export const EMPTY_HISTORY: PanelHistory = { entries: [], cursor: -1 };

export function currentPanel(h: PanelHistory): PanelRef | null {
  return h.cursor >= 0 && h.cursor < h.entries.length ? h.entries[h.cursor] : null;
}

export function canGoBack(h: PanelHistory): boolean {
  return h.cursor > 0;
}

export function canGoForward(h: PanelHistory): boolean {
  return h.cursor >= 0 && h.cursor < h.entries.length - 1;
}

function same(a: PanelRef | null, b: PanelRef | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.file === b.file;
}

/**
 * Go somewhere.
 *
 * Passing the entry already on screen means "close" — the lists toggle, and a
 * second click on the open row has always shut the panel. Passing null closes
 * outright.
 */
export function navigate(h: PanelHistory, to: PanelRef | null): PanelHistory {
  if (!to) return EMPTY_HISTORY;
  const here = currentPanel(h);
  if (same(here, to)) return EMPTY_HISTORY;
  // From the middle of the trail, what was ahead is no longer where you came
  // from. Keeping it would offer a "forward" into a branch you abandoned.
  const kept = h.cursor >= 0 ? h.entries.slice(0, h.cursor + 1) : [];
  return { entries: [...kept, to], cursor: kept.length };
}

export function goBack(h: PanelHistory): PanelHistory {
  return canGoBack(h) ? { ...h, cursor: h.cursor - 1 } : h;
}

export function goForward(h: PanelHistory): PanelHistory {
  return canGoForward(h) ? { ...h, cursor: h.cursor + 1 } : h;
}

/**
 * The trail behind the current entry, oldest first, for the panel to name
 * where "back" leads. A button labelled only with an arrow makes you press it
 * to find out.
 */
export function trail(h: PanelHistory): PanelRef[] {
  return h.cursor > 0 ? h.entries.slice(0, h.cursor) : [];
}
