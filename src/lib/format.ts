/** Small shared formatters. Kept out of the views so the compact and the full
 *  view can never disagree about what "2 min" means.
 *
 *  ⛔ `minutesSince` does NOT live here. It moved to
 *  `@mnemosyne_os/agent-transcripts/liveness`, where the MCP server reads it
 *  too — a second copy here would let the screen and the agent disagree about
 *  the same second. The version there also refuses an unparseable date, which
 *  this one silently turned into NaN. */
import { minutesSince } from '@mnemosyne_os/agent-transcripts';
import { fill } from '../i18n';

/**
 * Elapsed time, never a status.
 *
 * "Working" cannot be proven from a transcript: a dead agent and an idle one
 * produce the same silence. "Last seen" stays true in both cases and lets the
 * person conclude (doc 93 §2).
 */
/** `t` is any language's dictionary: only its day unit is read, as a string
 *  (`Dict` is the English literal type, so `Pick<Dict, …>` refused French). */
export function ago(iso: string | null, t: { readonly agoDays: string }): string {
  // One reading of a timestamp for the whole cartridge: an unreadable date is
  // infinitely old in `minutesSince`, and here it is a dash, never "NaN".
  const minutes = minutesSince(iso);
  if (!Number.isFinite(minutes)) return '—';
  const s = Math.max(0, Math.round(minutes * 60));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return fill(t.agoDays, { n: Math.floor(s / 86400) });
}

export function baseName(p: string | null): string | null {
  if (!p) return null;
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

/** Last two path segments — enough to recognise a file, short enough for a row. */
export function shortPath(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
}

/**
 * What to call a session in a list.
 *
 * The harness names most conversations itself; 8 of 229 measured had no title.
 * For those the first thing the person typed is used instead — it is the
 * session's own content, not a label invented for it. `titled` says which of
 * the two you got, so the view can render a fallback differently rather than
 * passing an excerpt off as a name.
 */
export function sessionLabel(
  title: string | null,
  firstTurn: string | undefined,
  max = 68,
): { text: string; titled: boolean } {
  if (title) return { text: clip(title, max), titled: true };
  const turn = (firstTurn ?? '').replace(/\s+/g, ' ').trim();
  if (turn) return { text: clip(turn, max), titled: false };
  return { text: '', titled: false };
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}
