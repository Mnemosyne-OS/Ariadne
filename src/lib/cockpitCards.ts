/**
 * What Ariadne tells the cockpit about a session.
 *
 * The host's cockpit (doc 110) shows small cards the human pins on the canvas;
 * this is the one place a session becomes such a card, so the row in the
 * dashboard and the card on the plane can never describe the same session
 * differently.
 *
 * Same rule as everywhere in Ariadne: never "working". The card carries the
 * last timestamp the harness wrote (`seenAt`), and the host prints "seen N
 * ago" from it. A dead agent and an idle one produce the same silence, and the
 * card lets the person conclude.
 */
import { liveSessions, type SessionState } from '@mnemosyne_os/agent-transcripts';
import { baseName, sessionLabel } from './format';

/** The host keeps at most this many cards per app (doc 110). Mirrored here so
 *  the omission can be said in the dashboard instead of discovered on the plane. */
export const HOST_MAX_CARDS = 12;

export interface CockpitCardOut {
  id: string;
  title: string;
  mark: { label: string; tint: string | null; svg: string | null } | null;
  status: string | null;
  seenAt: string | null;
  lines: string[];
  tone: 'live' | 'idle';
  /**
   * WHAT the card is about, so the host can tell it is the same thing as the
   * card the session publishes about ITSELF through the agent door. Ariadne's
   * id is the transcript PATH (the only thing a buried agent cannot make two
   * sessions share) and the door's is the session id — same work, two ids, and
   * without this the board carried both, side by side, disagreeing on how
   * fresh they were.
   */
  subject: string | null;
}

export interface CardSource {
  session: SessionState;
  /** The harness signature ("CC", "AG") and its colour, from lib/sources. */
  mark: { label: string; tint?: string; svg?: string } | null;
}

export interface CardWords {
  unknown: string;
  sidechain: string;
  /** "{n} files" in the reader's language — `{n}` is replaced, `+` appended
   *  by the caller when the connector capped the list. */
  files: string;
}

/** One session, one card. The id is the transcript PATH: the only thing a
 *  buried agent cannot make two sessions share. */
export function sessionCard(src: CardSource, now: number, t: CardWords): CockpitCardOut {
  const s = src.session;
  const { text } = sessionLabel(s.title, s.humanTurns[0]?.text, 96);
  const project = baseName(s.projectPath);
  const where = [project, s.branch].filter(Boolean).join(' · ');
  // 🪤 This was `${n} files`, hardcoded, so a card published by Ariadne read
  // "20 files" beside a host card reading "6 fichiers" on the same board.
  const files = s.artifacts.length > 0
    ? t.files.replace('{n}', `${s.artifacts.length}${s.artifactsCapped ? '+' : ''}`)
    : null;
  const lines = [where, files, s.isSidechain ? t.sidechain : null].filter((l): l is string => Boolean(l));
  return {
    id: s.path,
    subject: s.sessionId || null,
    title: text || t.unknown,
    // The connector's own drawing travels with the card: the plane should
    // identify an agent the same way every other surface does.
    mark: src.mark
      ? { label: src.mark.label, tint: src.mark.tint ?? null, svg: src.mark.svg ?? null }
      : null,
    status: s.model ?? null,
    seenAt: s.lastEventAt,
    lines,
    tone: liveSessions([s], now).length > 0 ? 'live' : 'idle',
  };
}

/**
 * The snapshot to publish: every pinned session still on disk, then the live
 * ones, newest first, up to the host's cap. Pinned first, because a pin is a
 * standing choice and a live session merely a candidate — when the cap bites,
 * the person's choices survive.
 *
 * `omitted` is what fell past the cap. Said, never swallowed: a list that
 * looks complete and is not is the failure doc 93 §10 is about.
 */
export function buildSnapshot(
  rows: readonly CardSource[],
  pinned: ReadonlySet<string>,
  now: number,
  t: CardWords,
): { cards: CockpitCardOut[]; omitted: number } {
  const byRecency = [...rows].sort((a, b) =>
    (Date.parse(b.session.lastEventAt ?? '') || 0) - (Date.parse(a.session.lastEventAt ?? '') || 0));
  const chosen: CardSource[] = [];
  const seen = new Set<string>();
  const take = (r: CardSource) => {
    if (seen.has(r.session.path)) return;
    seen.add(r.session.path);
    chosen.push(r);
  };
  for (const r of byRecency) if (pinned.has(r.session.path)) take(r);
  for (const r of byRecency) if (liveSessions([r.session], now).length > 0) take(r);

  const cards = chosen.slice(0, HOST_MAX_CARDS).map(r => sessionCard(r, now, t));
  return { cards, omitted: Math.max(0, chosen.length - HOST_MAX_CARDS) };
}
