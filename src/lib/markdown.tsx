/**
 * Note rendering, in the shell's own note language.
 *
 * A sandboxed cartridge cannot import the host's NoteMarkdownRenderer — it
 * lives in another bundle behind an iframe boundary. So this mirrors its
 * GRAMMAR and its tokens rather than its code: the same block set (fences,
 * rules, h1-h3, lists, quotes), the same inline set (bold, italic, code,
 * [[links]], underline, strikethrough, highlight), and the same CSS variables,
 * so a note reads the same here as it does in Mnemosyne.
 *
 * ⚠️ If the host's note syntax grows, this drifts. It is a deliberate copy of a
 * grammar, not a shared implementation, and there is no test binding the two.
 */
import type { JSX } from 'react';

/** Inline spans, in the host's precedence order. */
const INLINE = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[\[([^\]]+)\]\])|(<u>(.+?)<\/u>)|(~~(.+?)~~)|(==([^=]+)==)/g;

function renderInline(text: string, onLink?: (name: string) => void): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));

    if (m[1]) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++}>{m[4]}</em>);
    else if (m[5]) parts.push(<code key={key++} className="md-code">{m[6]}</code>);
    else if (m[7]) {
      const name = m[8] ?? '';
      parts.push(
        <span
          key={key++}
          className="md-link"
          onClick={e => { e.stopPropagation(); onLink?.(name); }}
        >{name}</span>,
      );
    } else if (m[9]) parts.push(<u key={key++}>{m[10]}</u>);
    else if (m[11]) parts.push(<s key={key++}>{m[12]}</s>);
    else if (m[13]) parts.push(<mark key={key++} className="md-mark">{m[14]}</mark>);

    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const HEADING_CLASS = ['md-h1', 'md-h2', 'md-h3'];

export function renderMarkdown(text: string, onLink?: (name: string) => void): JSX.Element[] {
  const lines = text.split(/\r?\n/);
  const blocks: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Fenced code: taken verbatim, never re-parsed for inline spans.
    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++;                                       // closing fence, if any
      blocks.push(<pre key={blocks.length} className="md-pre">{body.join('\n')}</pre>);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={blocks.length} className="md-hr" />);
      i++;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)/);
    if (h) {
      const level = (h[1] ?? '#').length;
      blocks.push(
        <div key={blocks.length} className={HEADING_CLASS[level - 1]}>
          {renderInline(h[2] ?? '', onLink)}
        </div>,
      );
      i++;
      continue;
    }

    if (/^[-•*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^[-•*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="md-list">
          {items.map((it, n) => <li key={n}>{renderInline(it, onLink)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={blocks.length} className="md-list">
          {items.map((it, n) => <li key={n}>{renderInline(it, onLink)}</li>)}
        </ol>,
      );
      continue;
    }

    if (line.startsWith('> ')) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
        body.push((lines[i] ?? '').slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={blocks.length} className="md-quote">
          {body.map((b, n) => <div key={n}>{renderInline(b, onLink)}</div>)}
        </blockquote>,
      );
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={blocks.length} className="md-gap" />);
      i++;
      continue;
    }

    blocks.push(
      <div key={blocks.length} className="md-p">{renderInline(line, onLink)}</div>,
    );
    i++;
  }

  return blocks;
}
