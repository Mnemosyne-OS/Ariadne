/**
 * Which agent a row came from.
 *
 * The connector supplies the mark, so a new source arrives with its own badge
 * and no code changes here. If it declares an inline `svg` path that is drawn;
 * otherwise its short label is, on a tinted chip.
 *
 * ⚠️ No official vendor logo ships with this repo. A drawn-from-memory
 * lookalike presented under a vendor's name would be a fabricated brand asset,
 * so the default is deliberately a plain label. Whoever has the right to use a
 * real mark pastes its path into their own connector file.
 */
import type { Connector } from '@mnemosyne_os/agent-transcripts';

interface Props {
  connector: Connector;
  /** A source chip next to a heading, or a smaller inline one. */
  size?: 'chip' | 'inline';
}

export default function SourceMark({ connector, size = 'chip' }: Props): JSX.Element | null {
  const mark = connector.mark;
  if (!mark) return null;

  const tint = mark.tint ?? 'var(--accent, #6f8cff)';
  return (
    <span className={`source-mark ${size}`} title={connector.displayName}>
      {mark.svg ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ fill: tint }}>
          <path d={mark.svg} />
        </svg>
      ) : (
        <span className="source-badge" style={{ borderColor: tint, color: tint }}>{mark.label}</span>
      )}
      <span className="source-name">{connector.displayName}</span>
    </span>
  );
}
