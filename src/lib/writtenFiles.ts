/**
 * The files a session wrote, in the order someone actually wants to read them.
 *
 * A session writes 63 files and 55 of them are scripts it ran once. The three
 * markdown documents, the ones a person is going to read, sat somewhere in the
 * middle of that list under identical bullets. So markdown rises to the top.
 *
 * The second split is the one that is easy to get wrong. Some of that markdown
 * is a note the agent keeps for itself, in the folder its connector reads;
 * the rest landed in the project, which is where a plan, a report or a handoff
 * goes. Those are different documents with different readers, and the app can
 * tell them apart from a RECORD rather than a guess: a file is the agent's own
 * note when the document folder holds it, and nothing else qualifies.
 *
 * That record buys one more thing. A file that IS a note opens in the note
 * panel, the same viewer the chips above use, wiki-links live. A markdown file
 * that is not a note opens in the file panel, which renders markdown too. So
 * the two reach the right screen instead of the nearest one.
 */
import type { Artifact, DocState } from '@mnemosyne_os/agent-transcripts';
import { isMarkdownPath } from './mdFile';

/** `markdown` = written into the project. `notes` = the agent's own document
 *  folder. `other` = everything else it touched. */
export type WrittenBand = 'markdown' | 'notes' | 'other';

export interface WrittenRow {
  artifact: Artifact;
  /** The note this file IS, when the connector's document folder holds it. */
  note: DocState | null;
}

export interface WrittenBandGroup {
  band: WrittenBand;
  rows: WrittenRow[];
}

/** The order the bands are painted in. Empty ones are dropped rather than
 *  rendered as a heading over nothing. */
const ORDER: WrittenBand[] = ['markdown', 'notes', 'other'];

/** Windows hands back both separators and either case, and a file must not
 *  miss its own note over a backslash. */
function normalise(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

export function groupWrittenFiles(
  artifacts: readonly Artifact[],
  docs: readonly DocState[],
): WrittenBandGroup[] {
  const byPath = new Map<string, DocState>();
  for (const d of docs) byPath.set(normalise(d.path), d);

  const bands = new Map<WrittenBand, WrittenRow[]>();
  for (const artifact of artifacts) {
    const note = byPath.get(normalise(artifact.path)) ?? null;
    const band: WrittenBand = note ? 'notes' : isMarkdownPath(artifact.path) ? 'markdown' : 'other';
    const rows = bands.get(band) ?? [];
    rows.push({ artifact, note });
    bands.set(band, rows);
  }

  return ORDER
    .filter(band => (bands.get(band)?.length ?? 0) > 0)
    .map(band => ({ band, rows: bands.get(band) as WrittenRow[] }));
}
