/**
 * The note renderer had no test at all, which is the wrong place for a blind
 * spot: it is a hand-written parser, it is the only thing standing between a
 * note on disk and what the panel shows, and it deliberately MIRRORS the host's
 * note grammar rather than sharing its code. A drift here does not throw, it
 * just renders somebody's note wrong.
 *
 * Written as .ts rather than .tsx on purpose: the vitest `include` only matched
 * `.test.ts` when this was written, so a .tsx file would have been collected by
 * nobody and passed for ever. The include is widened in the same commit, and
 * this file needs no JSX anyway — renderToStaticMarkup reads better than a tree
 * of nested props.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { JSX } from 'react';
import { renderMarkdown } from './markdown';

/** The blocks as HTML, joined, so an assertion reads like the output does. */
const html = (text: string, onLink?: (name: string) => void): string =>
  renderMarkdown(text, onLink).map(block => renderToStaticMarkup(block)).join('');

/** Depth-first walk of a block's children, for the props a static render drops. */
function findByClass(node: unknown, className: string): JSX.Element | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByClass(child, className);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as JSX.Element;
  const props = (el.props ?? {}) as { className?: string; children?: unknown };
  if (props.className === className) return el;
  return findByClass(props.children, className);
}

describe('blocks', () => {
  it('renders a bare line as a paragraph', () => {
    expect(html('hello')).toBe('<div class="md-p">hello</div>');
  });

  it('renders a blank line as a gap rather than dropping it', () => {
    expect(html('a\n\nb')).toBe(
      '<div class="md-p">a</div><div class="md-gap"></div><div class="md-p">b</div>');
  });

  it('renders the three heading levels, and nothing deeper', () => {
    expect(html('# one')).toBe('<div class="md-h1">one</div>');
    expect(html('## two')).toBe('<div class="md-h2">two</div>');
    expect(html('### three')).toBe('<div class="md-h3">three</div>');
    // Four hashes is not a heading in the host's grammar, so it is a paragraph.
    expect(html('#### four')).toBe('<div class="md-p">#### four</div>');
  });

  it('renders a rule for a line of dashes', () => {
    expect(html('---')).toBe('<hr class="md-hr"/>');
    expect(html('-----')).toBe('<hr class="md-hr"/>');
  });

  // Each marker is checked as the line that STARTS a list, not only as one
  // continuing it: entry and continuation are two separate regexes in the
  // source, and a mutation to the first alone changes nothing for a list that
  // opened on a dash. That mutation went unnoticed until it was tried.
  it('opens a list on any of the three bullet markers', () => {
    expect(html('- a')).toBe('<ul class="md-list"><li>a</li></ul>');
    expect(html('• a')).toBe('<ul class="md-list"><li>a</li></ul>');
    expect(html('* a')).toBe('<ul class="md-list"><li>a</li></ul>');
  });

  it('keeps mixed markers in one list rather than starting three', () => {
    expect(html('- a\n• b\n* c')).toBe(
      '<ul class="md-list"><li>a</li><li>b</li><li>c</li></ul>');
  });

  it('renders an ordered list', () => {
    expect(html('1. first\n2. second')).toBe(
      '<ol class="md-list"><li>first</li><li>second</li></ol>');
  });

  it('groups consecutive quote lines into one blockquote', () => {
    expect(html('> a\n> b')).toBe(
      '<blockquote class="md-quote"><div>a</div><div>b</div></blockquote>');
  });
});

describe('fenced code', () => {
  it('is taken verbatim and never re-parsed for inline spans', () => {
    expect(html('```\n**not bold** and [[not a link]]\n```')).toBe(
      '<pre class="md-pre">**not bold** and [[not a link]]</pre>');
  });

  it('keeps its own blank lines instead of turning them into gaps', () => {
    expect(html('```\na\n\nb\n```')).toBe('<pre class="md-pre">a\n\nb</pre>');
  });

  // A note being written while Ariadne polls it is routinely mid-fence.
  it('reads an unclosed fence to the end of the file rather than looping', () => {
    expect(html('```\nstill typing')).toBe('<pre class="md-pre">still typing</pre>');
  });

  it('survives an indented fence', () => {
    expect(html('  ```\nx\n  ```')).toBe('<pre class="md-pre">x</pre>');
  });
});

describe('inline spans', () => {
  it('renders the host\'s whole inline set', () => {
    expect(html('**b**')).toContain('<strong>b</strong>');
    expect(html('*i*')).toContain('<em>i</em>');
    expect(html('`c`')).toContain('<code class="md-code">c</code>');
    expect(html('<u>u</u>')).toContain('<u>u</u>');
    expect(html('~~s~~')).toContain('<s>s</s>');
    expect(html('==h==')).toContain('<mark class="md-mark">h</mark>');
    expect(html('[[Target]]')).toContain('<span class="md-link">Target</span>');
  });

  it('keeps the text around a span', () => {
    expect(html('before **mid** after')).toBe(
      '<div class="md-p">before <strong>mid</strong> after</div>');
  });

  it('renders several spans on one line', () => {
    expect(html('**a** and *b*')).toBe(
      '<div class="md-p"><strong>a</strong> and <em>b</em></div>');
  });

  it('parses spans inside headings, list items and quotes', () => {
    expect(html('# **h**')).toContain('<strong>h</strong>');
    expect(html('- **l**')).toContain('<strong>l</strong>');
    expect(html('> **q**')).toContain('<strong>q</strong>');
  });

  it('leaves an unmatched marker as text', () => {
    expect(html('**unclosed')).toBe('<div class="md-p">**unclosed</div>');
  });

  // Idempotence, and nothing more than that. The INLINE regex is module-level
  // and carries the `g` flag, so `INLINE.lastIndex = 0` on entry looks like the
  // guard that makes this hold. It is not: the exec loop has no break and no
  // early return, so it always runs to null and resets lastIndex itself.
  // Removing that line leaves this test green, which was checked rather than
  // assumed. The reset is defensive, and this test does not defend it.
  it('renders the same input identically twice in a row', () => {
    const once = html('**a** *b* `c`');
    expect(html('**a** *b* `c`')).toBe(once);
    expect(once).toContain('<strong>a</strong>');
  });
});

describe('[[links]]', () => {
  it('hands the callback the name inside the brackets', () => {
    const seen: string[] = [];
    const blocks = renderMarkdown('see [[Some Note]]', name => seen.push(name));
    const link = findByClass(blocks[0], 'md-link');
    expect(link).not.toBeNull();
    const onClick = (link?.props as { onClick?: (e: unknown) => void }).onClick;
    onClick?.({ stopPropagation: () => undefined });
    expect(seen).toEqual(['Some Note']);
  });

  // The panel's rows are clickable, so a link that let the event through would
  // open the row behind it at the same time.
  it('stops the click reaching whatever is behind it', () => {
    let stopped = false;
    const blocks = renderMarkdown('[[X]]', () => undefined);
    const link = findByClass(blocks[0], 'md-link');
    const onClick = (link?.props as { onClick?: (e: unknown) => void }).onClick;
    onClick?.({ stopPropagation: () => { stopped = true; } });
    expect(stopped).toBe(true);
  });

  // A link marks something worth writing later, so an unresolved one must not
  // become a dead-looking control. It still renders, and the click is a no-op
  // when no handler was given.
  it('renders and clicks safely with no handler at all', () => {
    const blocks = renderMarkdown('[[X]]');
    const link = findByClass(blocks[0], 'md-link');
    const onClick = (link?.props as { onClick?: (e: unknown) => void }).onClick;
    expect(() => onClick?.({ stopPropagation: () => undefined })).not.toThrow();
  });
});

describe('whole notes', () => {
  it('renders an empty note as nothing', () => {
    expect(html('')).toBe('<div class="md-gap"></div>');
  });

  it('handles CRLF, which is what a note written on Windows arrives as', () => {
    expect(html('# t\r\n\r\n- a\r\n- b')).toBe(
      '<div class="md-h1">t</div><div class="md-gap"></div>'
      + '<ul class="md-list"><li>a</li><li>b</li></ul>');
  });

  it('gives every block a distinct key', () => {
    const blocks = renderMarkdown('a\n\nb\n\nc');
    const keys = blocks.map(b => b.key);
    expect(new Set(keys).size).toBe(blocks.length);
  });
});
