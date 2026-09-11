/**
 * reader.test.ts — the two things here that can lie without anyone noticing.
 *
 * A reading time computed differently from the one the host's Notes inspector
 * shows for the same file, and an outline whose entries point at anchors the
 * renderer never emitted. The second is the dangerous one: it is a control
 * that silently does nothing, which reads as a broken app rather than as a
 * missing feature.
 */
import { describe, it, expect } from 'vitest';
import { readingStats, outlineOf, headingId, WORDS_PER_MINUTE } from './reader';
import { renderMarkdown } from './markdown';
import { renderToStaticMarkup } from 'react-dom/server';

describe('readingStats', () => {
  it('agrees with the number the host uses for the same file', () => {
    // ⚠️ 200 wpm is COPIED from the host's NoteEditor, not chosen here. One
    // markdown file must not get two reading times depending on which surface
    // opened it. Said out loud so a change to either side shows in a diff.
    expect(WORDS_PER_MINUTE).toBe(200);
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    expect(readingStats(words(400)).readTime).toBe(2);
    /**
     * 🪤 An exact multiple of 200 proves nothing: `floor` and `ceil` agree
     * there, and the first version of this test passed with either. A part
     * minute has to round UP, or a 250-word document claims to be a one-minute
     * read — which is the same document under-described.
     */
    expect(readingStats(words(201)).readTime).toBe(2);
    expect(readingStats(words(250)).readTime).toBe(2);
    expect(readingStats(words(399)).readTime).toBe(2);
    expect(readingStats(words(401)).readTime).toBe(3);
  });

  it('gives an empty document no reading time at all', () => {
    // 🎭 `Math.max(1, …)` would hand a blank file one minute of reading. Zero
    // means "nothing to read", and the bar is absent rather than measuring.
    for (const empty of ['', '   ', '\n\n\t']) {
      expect(readingStats(empty)).toEqual({ words: 0, characters: 0, readTime: 0 });
    }
  });

  it('rounds a short document up to one minute, never down to zero', () => {
    expect(readingStats('one word').readTime).toBe(1);
    expect(readingStats('a').readTime).toBe(1);
  });

  it('counts words across any run of whitespace, and characters after trimming', () => {
    expect(readingStats('  a\n\nb\tc  ')).toEqual({ words: 3, characters: 'a\n\nb\tc'.length, readTime: 1 });
  });
});

describe('outlineOf', () => {
  it('takes the three levels the renderer draws, and nothing deeper', () => {
    const o = outlineOf('# one\n\n## two\n\n### three\n\n#### four\n\ntext');
    expect(o.map(h => [h.level, h.text])).toEqual([[1, 'one'], [2, 'two'], [3, 'three']]);
  });

  it('skips fenced code, which is where an agent writes # for other reasons', () => {
    /**
     * 🪤 The failure this prevents: a `# TODO` inside a shell block counted as
     * a heading puts an entry in the outline with no anchor anywhere in the
     * document — and it would happen on exactly the files agents write most.
     */
    const o = outlineOf('# real\n\n```sh\n# not a heading\ncd /tmp\n```\n\n## also real');
    expect(o.map(h => h.text)).toEqual(['real', 'also real']);
  });

  it('gives two identical headings two different ids', () => {
    const o = outlineOf('## Notes\n\ntext\n\n## Notes');
    expect(o[0].id).not.toBe(o[1].id);
  });

  it('is empty on a document with no headings, rather than inventing one', () => {
    expect(outlineOf('just a paragraph\n\nand another')).toEqual([]);
    expect(outlineOf('')).toEqual([]);
    // A hash with no text is not a heading.
    expect(outlineOf('#\n\n#   ')).toEqual([]);
  });
});

describe('headingId', () => {
  it('still gives an anchor to a heading made only of punctuation', () => {
    // Without the fallback the id would be empty, `getElementById('md-')`
    // would miss, and the entry would be a press with no effect.
    expect(headingId('***', new Map())).toBe('md-h');
  });

  it('keeps accented letters, which most of these documents are written in', () => {
    expect(headingId('Mémoire partagée', new Map())).toBe('md-mémoire-partagée');
  });
});

describe('the outline and the renderer agree', () => {
  /**
   * 🚨 THE test of this file. The outline is only useful if every id it
   * carries exists in the rendered document; two implementations of the same
   * slug drift the first time a heading holds punctuation, and the outline
   * scrolls to nothing. They share `headingId`, and this proves it end to end
   * rather than by reading.
   */
  const DOC = [
    '# Ce que la session a produit',
    '',
    'texte',
    '',
    '## Fichiers écrits (12)',
    '',
    '```sh',
    '# pas un titre',
    '```',
    '',
    '## Notes',
    '',
    '### Notes',
    '',
    '## Notes',
    '',
    '## ***',
  ].join('\n');

  it('every outline id is an id the renderer emitted, in the same order', () => {
    const html = renderToStaticMarkup(<>{renderMarkdown(DOC)}</>);
    const emitted = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const outline = outlineOf(DOC).map(h => h.id);

    expect(outline.length).toBe(6);
    expect(outline).toEqual(emitted);
    // And every one of them is unique: a shared id makes the second heading
    // unreachable, which is the same silent failure by another route.
    expect(new Set(outline).size).toBe(outline.length);
  });
});
