/**
 * Sending one draft into memory.
 *
 * ## The shape of the act
 *
 * Working with a coding agent produces a heap of drafts, and only a few of
 * them are worth keeping. Ariadne already knows the heap; this is the step
 * that lets one of them cross into Mnemosyne without a copy-paste through a
 * text editor.
 *
 * The crossing is HUMAN-GATED, one file at a time. There is no "keep
 * everything in this session", no watcher, no rule — a standing consent to
 * import whatever an agent writes is exactly the thing doc 79 built a
 * maturation quarantine to avoid, and Ariadne has no such machinery.
 *
 * ## What actually gets written
 *
 * The file's own text, under a short provenance header naming the path, the
 * session and the agent. The header exists so that a chronicle recalled in six
 * months can be traced back to the afternoon that produced it; the body is
 * never paraphrased, so what you read here is what memory holds.
 */

/** The host ingest refuses past this many characters (socialHandlers:
 *  MAX_CONTENT_BYTES, and mnemosyne.ingest slices at the same number). We cut
 *  BEFORE sending so the person is told, rather than discovering that memory
 *  holds two thirds of their file. */
export const MAX_CONTENT_CHARS = 50_000;

/** Room kept for the provenance header inside that ceiling. */
const HEADER_BUDGET = 600;

export interface KeepSource {
  path: string;
  /** The transcript's own name for the session, when it has one. */
  sessionTitle: string | null;
  /** Which agent produced it, as the connector names itself. */
  agent: string;
  /** ISO time of the session's last event. */
  at: string | null;
}

export interface KeptBody {
  content: string;
  /** True when the file did not fit. The UI must SAY this: a chronicle that
   *  silently holds half a file is worse than one that was never written,
   *  because you would go on trusting it. */
  truncated: boolean;
  /** Characters of the original file, before any cut. */
  originalChars: number;
}

/**
 * The exact text one save writes.
 *
 * Pure, so the composition can be tested without a host: what the header
 * promises about provenance is the sort of thing that quietly rots.
 */
export function buildKeptBody(src: KeepSource, fileText: string): KeptBody {
  const header = [
    `File: ${src.path}`,
    `From: ${src.agent}${src.sessionTitle ? ` — ${src.sessionTitle}` : ''}`,
    src.at ? `Session last active: ${src.at}` : null,
    'Kept from Ariadne by hand.',
    '',
    '---',
    '',
  ].filter((l): l is string => l !== null).join('\n');

  const room = MAX_CONTENT_CHARS - Math.max(header.length, HEADER_BUDGET);
  const truncated = fileText.length > room;
  const body = truncated
    ? `${fileText.slice(0, room)}\n\n[cut here: ${fileText.length} characters in the file, ${room} kept]`
    : fileText;

  return { content: header + body, truncated, originalChars: fileText.length };
}

/** One vault the human may choose. */
export interface VaultChoice {
  id: string;
  displayName: string;
  chronicles: number;
}

interface RawStats { vaultId?: unknown; displayName?: unknown; chronicleCount?: unknown; state?: unknown }

/**
 * The vaults a save may target, from `mnemosyne.status`.
 *
 * A vault with no id is dropped rather than shown: it could not be written to,
 * and an option that fails when pressed is worse than an option that is not
 * offered. An EMPTY list is a real answer — the caller says "no vault to write
 * to", never "loading" forever.
 */
export function vaultChoices(raw: unknown): VaultChoice[] {
  const vaults = (raw as { vaults?: unknown })?.vaults;
  if (!Array.isArray(vaults)) return [];
  const out: VaultChoice[] = [];
  for (const v of vaults as RawStats[]) {
    const id = typeof v?.vaultId === 'string' ? v.vaultId : '';
    if (!id) continue;
    out.push({
      id,
      displayName: typeof v?.displayName === 'string' && v.displayName ? v.displayName : id,
      // A count that did not arrive is UNKNOWN. Rendering it as 0 would tell
      // someone their vault is empty on the strength of a missing field.
      chronicles: typeof v?.chronicleCount === 'number' ? v.chronicleCount : -1,
    });
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
