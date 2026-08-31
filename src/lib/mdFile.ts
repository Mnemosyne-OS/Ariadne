/**
 * Markdown as a property of a FILE, not of a folder.
 *
 * The document connectors describe a folder a human designated: `memory/` for
 * Claude Code, the session directory for Antigravity. The markdown an agent
 * writes while it works is not in either of them — it lands wherever the task
 * needed it, and the only reason Ariadne knows the path is that the transcript
 * recorded the write.
 *
 * So nothing here decides where to read (doc 93 §3 stands): it answers one
 * question about a path that already arrived from a session, "is this file
 * markdown", and splits the frontmatter off the body so the panel can paint
 * the same thing a note paints.
 */

/** `.md` and `.markdown`. `.mdx` is JSX with markdown around it, and rendering
 *  it as prose would show a component tree as body text. */
const MD_EXT = /\.(md|markdown)$/i;

export function isMarkdownPath(path: string): boolean {
  return MD_EXT.test(path.trim());
}

export interface SplitDoc {
  /** The frontmatter block's inner text, without its two fences. Null when the
   *  file opens straight on its content. */
  front: string | null;
  body: string;
}

/**
 * A leading `---` block, separated from the body. Same shape `readDoc` reads.
 *
 * Separated rather than dropped. Four lines of metadata removed from the panel
 * would make it show less than the file holds, and this panel is what someone
 * reads before deciding to send the file into memory.
 */
export function splitFrontmatter(text: string): SplitDoc {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { front: null, body: text };
  return { front: m[1] ?? '', body: text.slice(m[0].length) };
}
