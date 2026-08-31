/**
 * What Ariadne looks like from across the canvas.
 *
 * At 24% the normal hub is a grey smear, so this renders the same information
 * at a CONSTANT APPARENT SIZE: every length is divided by the zoom, so a card
 * painted at 24% is drawn four times larger and lands on screen the size it
 * would have had up close. Without the zoom this cannot be done at all — the
 * plane is CSS-scaled around the iframe, so the cartridge's own pixels never
 * change (doc 93).
 *
 * Still no "working" light. "Live" means "moved in the last ten minutes",
 * which is what the timestamps actually prove.
 */
import type { SourceStatus } from './Hub';
import { liveSessions } from '@mnemosyne_os/agent-transcripts';
import type { Dict } from '../i18n';

interface Props {
  t: Dict;
  statuses: SourceStatus[];
  collisions: number;
  /** The canvas zoom this is being painted at. */
  zoom: number;
}

/** Beyond this the type would outgrow the widget itself, so the compensation
 *  stops and the view simply gets small like everything else. */
const MAX_SCALE = 5;

export default function CompactView({ t, statuses, collisions, zoom }: Props): JSX.Element {
  const k = Math.min(MAX_SCALE, Math.max(1, 1 / Math.max(zoom, 0.05)));
  const px = (n: number) => `${Math.round(n * k)}px`;

  const connected = statuses.filter(s => s.folder);

  return (
    <div className="far" style={{ padding: px(10), gap: px(10) }}>
      {collisions > 0 && (
        <div className="far-alert" style={{ fontSize: px(13), padding: `${px(4)} ${px(8)}`, borderRadius: px(4) }}>
          {collisions} × {t.collision}
        </div>
      )}

      <div className="far-grid" style={{ gap: px(10) }}>
        {connected.map(s => {
          // The shared rule, never a copy of it: a view that reimplements
          // "live" drifts the day the rule changes, and then the far view and
          // the near view disagree about the same second.
          const live = liveSessions(s.sessions).length;
          const mark = s.source.sessions.mark;
          return (
            <div
              key={s.source.id}
              className={`far-card ${live > 0 ? 'on' : ''}`}
              style={{ padding: px(10), borderRadius: px(8), gap: px(2), borderWidth: px(1) }}
            >
              <span
                className="far-mark"
                style={{ fontSize: px(12), letterSpacing: px(1), color: mark?.tint }}
              >{mark?.label ?? s.source.sessions.displayName}</span>
              <span className="far-live" style={{ fontSize: px(40), color: live > 0 ? mark?.tint : undefined }}>
                {live}
              </span>
              <span className="far-cap" style={{ fontSize: px(11) }}>{t.live}</span>
              <span className="far-total" style={{ fontSize: px(11) }}>
                {s.sessions.length} {t.sessions}
              </span>
            </div>
          );
        })}
      </div>

      {/* Nothing connected is not zero agents working: it is an app nobody has
          pointed anywhere, and the two must not look alike even from here. */}
      {connected.length === 0 && (
        <p className="far-cap" style={{ fontSize: px(12) }}>{t.hubNotSet}</p>
      )}
    </div>
  );
}
