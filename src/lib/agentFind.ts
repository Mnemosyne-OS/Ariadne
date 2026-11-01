/**
 * agentFind — an agent, a session, a note or a file named the way a person
 * says it (doc 149). The orb plans a spoken sentence in ONE model call and
 * never reads Ariadne first, so « ouvre la session carte neurale » reaches an
 * action with the words « carte neurale », never a path. A path or an id still
 * works (other agents read `sessions` and `notes` first).
 *
 * 🚨 Several matches are REFUSED with their labels (AMBIGUOUS), never the first
 *    one taken: the refusal is what the orb's repair call reads to pick one.
 *    A label carries the path when titles repeat (harnesses name many
 *    transcripts the same), and a ref that CONTAINS one entry's id resolves to
 *    it, so a label read back from a refusal lands on its entry.
 *
 * Copied from Vitrine Studio's `data/agentFind.ts` (never imported across
 * cartridges), fillers adapted to sessions, notes and files.
 *
 * @module lib/agentFind
 */

/** Lower case, accents off, œ/æ spelled out. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Words that carry no name: articles and the words a sentence wraps a name in.
 * 🪤 Matched BEFORE the accents come off: folded, « thé » is « the ».
 */
const FILLER = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'ce', 'cette', 'ces', 'et', 'en', 'au', 'aux', 'à', 'sur',
  'the', 'a', 'an', 'of', 'my', 'and', 'on', 'el', 'los', 'las', 'del', 'mi', 'mis', 'y', 'sobre',
  'session', 'sessions', 'sesión', 'sesiones', 'note', 'notes', 'nota', 'notas', 'fichier', 'fichiers', 'file', 'files', 'archivo', 'archivos',
  'conversation', 'conversations', 'conversación', 'agent', 'agents', 'agente', 'agentes',
]);

/** The words of a name, folded, fillers out, a plural « s »/« x » off so « cartes » finds « carte ». */
export function nameWords(s: string): string[] {
  return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => fold(w))
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
}

/** One thing that can be named: its ids (path, session id…), the names said, the label a refusal lists. */
export interface Named<T> { item: T; ids: string[]; names: string[]; label: string }

const LIST_MAX = 12;
const listed = (labels: string[]) => {
  const unique = [...new Set(labels)];
  return unique.length > LIST_MAX ? `${unique.slice(0, LIST_MAX).join(', ')} (+${unique.length - LIST_MAX})` : unique.join(', ');
};
/** An id long enough that finding it inside a sentence is never a coincidence (a path, a uuid). */
const LONG_ID = 8;

/**
 * The one item `ref` names: an id exactly; else the one item whose long id the
 * ref contains; else the item whose whole name is the ref; else the item whose
 * words hold every word of `ref`. `kind` names the error (NO_SESSION…) and the
 * noun said.
 */
export function findNamed<T>(entries: ReadonlyArray<Named<T>>, ref: string, kind: { code: string; noun: string }): T {
  const raw = ref.trim();
  if (!raw) throw new Error(`BAD_ARG: name the ${kind.noun}`);
  const byId = entries.find((e) => e.ids.includes(raw));
  if (byId) return byId.item;
  const inside = entries.filter((e) => e.ids.some((id) => id.length >= LONG_ID && raw.includes(id)));
  if (inside.length === 1) return inside[0].item;
  const asked = nameWords(raw);
  const all = entries.map((e) => e.label);
  if (!asked.length) throw new Error(`${kind.code}: "${raw}" names no ${kind.noun}; ${kind.noun}s: ${listed(all) || 'none'}`);
  // The whole name said as written wins over a partial match (« carte » against « carte » and « carte neurale »).
  const whole = entries.filter((e) => e.names.some((n) => nameWords(n).join(' ') === asked.join(' ')));
  if (whole.length === 1) return whole[0].item;
  const hits = whole.length > 1 ? whole : entries.filter((e) => {
    const have = new Set(e.names.flatMap(nameWords));
    return asked.every((w) => have.has(w));
  });
  if (hits.length === 1) return hits[0].item;
  if (hits.length > 1) throw new Error(`AMBIGUOUS: "${raw}" names several ${kind.noun}s: ${listed(hits.map((e) => e.label))}; say which`);
  throw new Error(`${kind.code}: no ${kind.noun} named "${raw}"; ${kind.noun}s: ${listed(all) || 'none'}`);
}
