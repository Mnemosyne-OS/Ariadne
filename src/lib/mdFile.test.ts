import { describe, it, expect } from 'vitest';
import { isMarkdownPath, splitFrontmatter } from './mdFile';

describe('isMarkdownPath', () => {
  it('takes .md and .markdown, whatever the case', () => {
    expect(isMarkdownPath('C:/repo/docs/plan.md')).toBe(true);
    expect(isMarkdownPath('/home/x/NOTES.MD')).toBe(true);
    expect(isMarkdownPath('/home/x/handoff.markdown')).toBe(true);
  });

  it('refuses anything that merely contains .md', () => {
    // The sidecar an Antigravity document carries would otherwise render as
    // prose, and a JSON blob painted as markdown is one long paragraph.
    expect(isMarkdownPath('/x/task.md.metadata.json')).toBe(false);
    expect(isMarkdownPath('/x/mdfile.ts')).toBe(false);
    expect(isMarkdownPath('/x/README')).toBe(false);
  });

  it('does not take .mdx: that is JSX with markdown around it', () => {
    expect(isMarkdownPath('/x/page.mdx')).toBe(false);
  });

  it('survives a trailing space, which a shell-derived path can carry', () => {
    expect(isMarkdownPath('/x/plan.md ')).toBe(true);
  });
});

describe('splitFrontmatter', () => {
  it('separates a leading block from the body', () => {
    const { front, body } = splitFrontmatter('---\nname: x\ntype: user\n---\n# Title\n');
    expect(front).toBe('name: x\ntype: user');
    expect(body).toBe('# Title\n');
  });

  it('handles CRLF, which is how a file written on Windows arrives', () => {
    const { front, body } = splitFrontmatter('---\r\nname: x\r\n---\r\nBody\r\n');
    expect(front).toBe('name: x');
    expect(body).toBe('Body\r\n');
  });

  it('leaves a file with no frontmatter whole', () => {
    const text = '# Title\n\nSome body.\n';
    expect(splitFrontmatter(text)).toEqual({ front: null, body: text });
  });

  it('does not treat a horizontal rule further down as frontmatter', () => {
    const text = '# Title\n\n---\n\nMore.\n';
    expect(splitFrontmatter(text).front).toBe(null);
  });

  it('never drops anything: front plus body reconstructs the content', () => {
    const text = '---\na: 1\n---\nbody line\n';
    const { front, body } = splitFrontmatter(text);
    expect(`${front}\n${body}`.replace(/\s+/g, ' ')).toContain('a: 1');
    expect(body).toContain('body line');
  });
});
