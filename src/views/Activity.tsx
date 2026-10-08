/**
 * The activity calendar: a year of days, shaded by what the agent consumed.
 *
 * Reads only what the transcripts measured. Three things it refuses to do,
 * each of which would make it prettier and wrong:
 *
 *  - it never shades a square for a day that has not happened,
 *  - it never shows a "total tokens", because the four counters are not the
 *    same thing and cache reads dwarf the rest by three orders of magnitude,
 *  - it says how much of the folder it has actually read, so a calendar that
 *    is still filling cannot be mistaken for a quiet summer.
 */
import { useMemo, useState } from 'react';
import type { SessionState, TokenCounts } from '@mnemosyne_os/agent-transcripts';
import {
  buildGrid, compact, mergeDays, metricValue, readableDay, silentSessions,
  METRICS, type Metric,
} from '../lib/activity';
import { fill, type Dict } from '../i18n';

interface Props {
  t: Dict;
  lang: string;
  sessions: SessionState[];
  /**
   * Session files the walk found, against the ones already parsed. The reader
   * opens a dozen per pass, so on a large folder this graph fills in over
   * minutes — and a half-read calendar looks exactly like a quiet one.
   */
  filesFound: number;
}

const MONTH_KEYS = [
  'monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun',
  'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec',
] as const;

export default function Activity({ t, lang, sessions, filesFound }: Props): JSX.Element | null {
  const [metric, setMetric] = useState<Metric>('calls');

  const byDay = useMemo(() => mergeDays(sessions), [sessions]);
  const silent = useMemo(() => silentSessions(sessions), [sessions]);
  const monthNames = useMemo(() => MONTH_KEYS.map(k => t[k]), [t]);
  const grid = useMemo(
    () => buildGrid(byDay, metric, { monthNames }),
    [byDay, metric, monthNames],
  );

  // Nothing measured and nothing that COULD measure: this harness does not
  // record usage. A graph of empty squares would read as a quiet year.
  const measured = sessions.length - silent;
  if (measured === 0) {
    return sessions.length === 0 ? null : (
      <section className="block activity">
        <div className="block-head"><h2>{t.activity}</h2></div>
        <p className="caveat">{t.activityUnsupported}</p>
      </section>
    );
  }

  const label = t[metricKey(metric)];

  return (
    <section className="block activity" data-testid="activity">
      <div className="block-head">
        <h2>{t.activity}</h2>
        <div className="metrics" role="group" aria-label={t.activityMetric}>
          {METRICS.map(m => (
            <button
              key={m}
              type="button"
              className={m === metric ? 'chip on' : 'chip'}
              aria-pressed={m === metric}
              onClick={() => setMetric(m)}
            >
              {t[metricKey(m)]}
            </button>
          ))}
        </div>
      </div>

      {/* The headline. Four numbers side by side and never their sum — see
          lib/activity. The unit is spelled out on each one so no two of them
          can be read as the same kind of thing. */}
      <div className="activity-head">
        <span className="big">{compact(metricValue(grid.total, metric), lang)}</span>
        <span className="unit">{label}</span>
        <span className="sep">·</span>
        <span>{fill(t.activeDays, { n: grid.activeDays })}</span>
        {grid.streak > 0 && (
          <>
            <span className="sep">·</span>
            <span className="streak" title={t.streakHint}>🔥 {fill(t.streak, { n: grid.streak })}</span>
          </>
        )}
        {grid.best > grid.streak && (
          <>
            <span className="sep">·</span>
            <span className="dim">{fill(t.bestStreak, { n: grid.best })}</span>
          </>
        )}
      </div>

      <div className="cal-scroll">
        <div className="cal">
          <div className="cal-months" style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, 13px)` }}>
            {grid.months.map(m => (
              <span key={`${m.label}-${m.week}`} style={{ gridColumnStart: m.week + 1 }}>{m.label}</span>
            ))}
          </div>
          <div className="cal-grid" style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, 13px)` }}>
            {grid.weeks.map((week, wi) => (
              <div className="cal-week" key={wi}>
                {week.map(cell => (
                  <i
                    key={cell.day}
                    className={cell.future ? 'cal-day future' : `cal-day l${cell.level}`}
                    data-testid={cell.future ? 'cal-future' : `cal-day-${cell.day}`}
                    // The exact figures live here, where there is room to be
                    // exact. The square itself only carries a shade.
                    title={cell.future ? '' : cellTitle(cell.day, cell.counts, lang, t)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cal-legend">
        <span>{t.less}</span>
        <i className="cal-day l0" /><i className="cal-day l1" /><i className="cal-day l2" />
        <i className="cal-day l3" /><i className="cal-day l4" />
        <span>{t.more}</span>
      </div>

      {/* What this graph does NOT cover. Both lines are absences that would
          otherwise be read as facts about the days themselves. */}
      {measured < filesFound && (
        <p className="caveat">{fill(t.activityPartial, { read: measured, found: filesFound })}</p>
      )}
      {silent > 0 && <p className="caveat">{fill(t.activitySilent, { n: silent })}</p>}
    </section>
  );
}

function metricKey(m: Metric): 'metricCalls' | 'metricFresh' | 'metricOutput' | 'metricCacheRead' {
  switch (m) {
    case 'calls': return 'metricCalls';
    case 'fresh': return 'metricFresh';
    case 'output': return 'metricOutput';
    case 'cacheRead': return 'metricCacheRead';
  }
}

/**
 * One square's tooltip: the day, then every counter that day measured.
 *
 * A day with nothing says so in words. Rendering "0 calls" would be a
 * measurement of a day nobody worked, which is not what an empty square means
 * — it means no transcript put anything there.
 */
function cellTitle(
  day: string,
  counts: TokenCounts | null,
  lang: string,
  t: Dict,
): string {
  const when = readableDay(day, lang);
  if (!counts) return `${when} — ${t.nothingMeasured}`;
  // Grouped digits, and a bad tag from the host costs the grouping and not the
  // tooltip: `toLocaleString` throws a RangeError on an invalid locale.
  const n = (v: number) => {
    try { return v.toLocaleString(lang); } catch { return String(v); }
  };
  return [
    when,
    `${n(counts.calls)} ${t.metricCalls}`,
    `${n(counts.input + counts.cacheWrite)} ${t.metricFresh}`,
    `${n(counts.output)} ${t.metricOutput}${counts.thinking > 0 ? ` (${n(counts.thinking)} ${t.metricThinking})` : ''}`,
    `${n(counts.cacheRead)} ${t.metricCacheRead}`,
  ].join('\n');
}
