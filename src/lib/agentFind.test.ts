import { describe, expect, it } from 'vitest';
import { findNamed, nameWords, type Named } from './agentFind';

const entry = (id: string, name: string, label = name): Named<string> => ({ item: id, ids: [id], names: [name], label });
const SESSIONS = [
  entry('/c/1.jsonl', 'Carte neurale'),
  entry('/c/2.jsonl', 'Carte'),
  entry('/c/3.jsonl', 'Thé et notes'),
  entry('/c/4.jsonl', 'Refonte de la carte neurale'),
];
const kind = { code: 'NO_SESSION', noun: 'session' };

describe('a session named the way a person says it', () => {
  it('folds case, accents, fillers and a plural', () => {
    expect(nameWords('la session THÉ')).toEqual(['the']);
    expect(nameWords('les cartes neurales')).toEqual(['carte', 'neurale']);
  });

  it('an id, the whole name, or every word of it', () => {
    expect(findNamed(SESSIONS, '/c/3.jsonl', kind)).toBe('/c/3.jsonl');
    expect(findNamed(SESSIONS, 'la session thé', kind)).toBe('/c/3.jsonl');
    // « Carte » is a whole name: it wins over the sessions that hold the word.
    expect(findNamed(SESSIONS, 'la carte', kind)).toBe('/c/2.jsonl');
    expect(findNamed(SESSIONS, 'refonte carte', kind)).toBe('/c/4.jsonl');
  });

  it('a label read back from a refusal, its path inside, lands on that entry', () => {
    expect(findNamed(SESSIONS, 'Carte neurale (/c/1.jsonl)', kind)).toBe('/c/1.jsonl');
  });

  it('several matches are refused with their names, never the first taken', () => {
    expect(() => findNamed(SESSIONS, 'neurale', kind)).toThrow('AMBIGUOUS: "neurale" names several sessions: Carte neurale, Refonte de la carte neurale; say which');
    const twins = [entry('/a', 'task', 'task (/a)'), entry('/b', 'Task', 'Task (/b)')];
    expect(() => findNamed(twins, 'task', kind)).toThrow('AMBIGUOUS: "task" names several sessions: task (/a), Task (/b); say which');
  });

  it('no match is refused with the names that exist, capped', () => {
    expect(() => findNamed(SESSIONS, 'migration', kind)).toThrow('NO_SESSION: no session named "migration"; sessions: Carte neurale, Carte, Thé et notes, Refonte de la carte neurale');
    expect(() => findNamed(SESSIONS, '', kind)).toThrow(/^BAD_ARG/);
    expect(() => findNamed([], 'carte', kind)).toThrow('sessions: none');
    const many = Array.from({ length: 15 }, (_, i) => entry(`/x/${i}`, `s${i}`));
    expect(() => findNamed(many, 'zzz', kind)).toThrow(/\(\+3\)$/);
  });
});
