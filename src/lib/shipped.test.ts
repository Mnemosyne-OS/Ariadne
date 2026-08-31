/**
 * Drift guards over the two things a stranger's clone depends on: the locales
 * being complete, and every shipped connector being coherent.
 *
 * Both failures are invisible at runtime. A missing locale key silently falls
 * back to English; a malformed connector reads as an agent with no sessions.
 * They only ever surface as "the app is a bit broken", which is the worst kind
 * of bug report to receive on a public repo.
 */
import { describe, it, expect } from 'vitest';
import { STRINGS, dictFor, fill } from '../i18n';
import { SOURCES, sourceById } from './sources';
import type { Connector } from '@mnemosyne_os/agent-transcripts';

describe('locales', () => {
  const en = Object.keys(STRINGS.en).sort();

  for (const lang of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    it(`${lang} declares exactly the same keys as English`, () => {
      expect(Object.keys(STRINGS[lang]).sort()).toEqual(en);
    });

    it(`${lang} leaves no string empty`, () => {
      const empty = Object.entries(STRINGS[lang]).filter(([, v]) => !String(v).trim());
      expect(empty).toEqual([]);
    });
  }

  it('keeps every {placeholder} across translations', () => {
    const holes = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();
    for (const [key, value] of Object.entries(STRINGS.en)) {
      for (const lang of ['fr', 'es'] as const) {
        expect(holes(STRINGS[lang][key as keyof typeof STRINGS.en]), `${lang}.${key}`)
          .toEqual(holes(value));
      }
    }
  });

  it('merges over English, so an untranslated key renders a sentence not undefined', () => {
    expect(dictFor('de').title).toBe(STRINGS.en.title);
  });

  it('falls back to English for an unknown language', () => {
    expect(dictFor(undefined).close).toBe(STRINGS.en.close);
    expect(dictFor('zz').close).toBe(STRINGS.en.close);
  });

  it('accepts a regional tag', () => {
    expect(dictFor('fr-CA').close).toBe(STRINGS.fr.close);
  });
});

describe('fill', () => {
  it('substitutes every occurrence', () => {
    expect(fill('{a} and {a} and {b}', { a: 1, b: 'x' })).toBe('1 and 1 and x');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    expect(fill('{a} {missing}', { a: 1 })).toBe('1 {missing}');
  });
});

describe('shipped connectors', () => {
  const all: { where: string; conn: Connector }[] = SOURCES.flatMap(s => [
    { where: `${s.id}.sessions`, conn: s.sessions },
    ...(s.notes ? [{ where: `${s.id}.notes`, conn: s.notes }] : []),
  ]);

  it('ships at least one agent', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it('gives every source a unique id', () => {
    expect(new Set(SOURCES.map(s => s.id)).size).toBe(SOURCES.length);
  });

  // The shell holds the open agent as `string | null`, null being the hub, and
  // passes it straight in. A lookup that threw on null would take the hub down.
  it('resolves an id, and answers null for the hub and for a stranger', () => {
    for (const s of SOURCES) expect(sourceById(s.id)).toBe(s);
    expect(sourceById(null)).toBeNull();
    expect(sourceById('an-agent-that-was-removed')).toBeNull();
  });

  for (const { where, conn } of all) {
    describe(where, () => {
      it('declares the identity the UI reads', () => {
        expect(conn.id).toBeTruthy();
        expect(conn.displayName).toBeTruthy();
        expect(conn.filePattern).toBeTruthy();
      });

      it('declares a kind matching its format', () => {
        expect(conn.kind === 'session' ? 'jsonl' : 'markdown').toBe(conn.format);
      });

      it('never declares an absolute path — the human designates the folder', () => {
        const hint = conn.folderHint ?? '';
        expect(hint).not.toMatch(/^([a-z]:|\/|\\)/i);
        expect(hint).not.toContain('..');
      });

      it('has a mark the hub can render, or none at all', () => {
        if (conn.mark) expect(conn.mark.label).toBeTruthy();
      });
    });
  }

  for (const { where, conn } of all.filter(c => c.conn.kind === 'session')) {
    describe(`${where} (session)`, () => {
      it('knows where the timestamp is, without which nothing sorts', () => {
        expect(conn.fields.timestamp).toBeTruthy();
      });

      it('takes its session id from a field or from the directory, not from nowhere', () => {
        expect(Boolean(conn.fields.sessionId) || conn.tree?.idFrom === 'dir').toBe(true);
      });

      // The rule that keeps an open connector catalogue defensible: a
      // connector is DATA. It may say WHERE a command string sits; the
      // patterns applied to it live in lib/shellWrites, because a pathological
      // pattern shipped by a stranger would hang the reader on your machine.
      it('carries no pattern of its own, only a place to look', () => {
        const declared = JSON.stringify(conn);
        expect(declared).not.toMatch(/"pattern"\s*:|"regex"\s*:/);
        if (conn.shellWrite) {
          expect(conn.shellWrite.tools.length).toBeGreaterThan(0);
          expect(conn.shellWrite.take).toBeTruthy();
          expect(conn.shellWrite.path).toBeTruthy();
        }
      });

      it('can tell a human turn apart from tool output', () => {
        expect(conn.humanTurn).toBeDefined();
        // Either the human's lines have their own type, or tool results are
        // excluded explicitly. Without one of the two, 99% of the bytes would
        // be mistaken for things the person said.
        const separated = Object.keys(conn.humanTurn?.where ?? {}).length > 0
          || Boolean(conn.humanTurn?.notWhen);
        expect(separated).toBe(true);
      });
    });
  }

  for (const { where, conn } of all.filter(c => c.conn.kind === 'document')) {
    describe(`${where} (document)`, () => {
      it('says where its documents live relative to a session directory', () => {
        expect(conn.tree?.subPath).toBeDefined();
      });

      it('reads its metadata from frontmatter or from a sidecar', () => {
        expect(Boolean(conn.frontmatter) || Boolean(conn.sidecar)).toBe(true);
      });
    });
  }
});
