/**
 * The activity calendar: a year of squares, built from what the sessions
 * measured. Doc 93.
 *
 * Pure arithmetic, no React, because every interesting decision here is a
 * number that would otherwise be quietly wrong:
 *
 *  - which counters may be added to which (almost none of them),
 *  - what an empty square means (nothing measured — not a day off, and never a
 *    day in the future),
 *  - where the shading thresholds come from (the distribution of the days that
 *    have something, not the maximum, which one marathon flattens).
 */
import { addCounts, dayKey, emptyCounts, type SessionState, type TokenCounts } from '@mnemosyne_os/agent-transcripts';

/**
 * What a square is shaded by.
 *
 * Four separate metrics and deliberately no "total", because there is no
 * honest one. MEASURED on 870 real transcripts: `cacheRead` is 39.5 billion
 * tokens against 88 million of output, so a sum is a picture of the cache and
 * of nothing else. The label above the graph always says which of these it is.
 */
export type Metric = 'calls' | 'fresh' | 'output' | 'cacheRead';

export const METRICS: Metric[] = ['calls', 'fresh', 'output', 'cacheRead'];

/**
 * The value of one metric.
 *
 * `fresh` is the one addition made anywhere in this file: prompt tokens the
 * provider had to read, whether or not it also cached them. The two are priced
 * differently, which is why the reader keeps them apart and why this merge
 * lives in the view layer, under a label that says "fresh" and not "input".
 */
export function metricValue(c: TokenCounts, m: Metric): number {
  switch (m) {
    case 'calls': return c.calls;
    case 'fresh': return c.input + c.cacheWrite;
    case 'output': return c.output;
    case 'cacheRead': return c.cacheRead;
  }
}

export interface DayCell {
  /** `YYYY-MM-DD`, local. */
  day: string;
  /** What was measured that day, or null when nothing was. */
  counts: TokenCounts | null;
  value: number;
  /** 0 = nothing measured. 1 to 4 = shading. */
  level: 0 | 1 | 2 | 3 | 4;
  /**
   * A square after today. Rendered as a hole rather than as an empty day: a
   * quiet Tuesday and a Tuesday that has not happened are different facts, and
   * the second one shading like the first is how a calendar tells you that you
   * did nothing next month.
   */
  future: boolean;
}

export interface ActivityGrid {
  /** Columns, oldest first. Each holds 7 cells, Monday first. */
  weeks: DayCell[][];
  /** Month labels, by the column they start over. */
  months: { label: string; week: number }[];
  /** Every day folded, for the headline. */
  total: TokenCounts;
  /** Days that measured anything at all. */
  activeDays: number;
  /** Consecutive days up to now. See {@link streaks}. */
  streak: number;
  /** The longest run inside the window. */
  best: number;
  /** The first and last day the window covers. */
  from: string;
  to: string;
}

/**
 * Fold every session's per-day map into one.
 *
 * Sessions that report nothing are skipped rather than counted as zero days —
 * a harness that does not record usage must not be able to darken the graph of
 * one that does.
 */
export function mergeDays(sessions: readonly SessionState[]): Record<string, TokenCounts> {
  const out: Record<string, TokenCounts> = {};
  for (const s of sessions) {
    if (!s.tokens) continue;
    for (const [day, counts] of Object.entries(s.tokens)) {
      addCounts(out[day] ?? (out[day] = emptyCounts()), counts);
    }
  }
  return out;
}

/** Sessions whose harness records no usage at all. Stated, never hidden: the
 *  graph is silent about them and has to say so. */
export function silentSessions(sessions: readonly SessionState[]): number {
  return sessions.filter(s => s.tokens === null).length;
}

const DAY_MS = 86_400_000;

/** Local midnight of the day `iso` falls on. */
function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function shift(d: Date, days: number): Date {
  return midnight(new Date(d.getTime() + days * DAY_MS));
}

function keyOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday = 0. The week starts on Monday because the people reading it do. */
function weekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Where the four shades begin.
 *
 * Quartiles of the days that have something, never fractions of the maximum:
 * one 14-hour Saturday is enough to push every ordinary day into the palest
 * shade, and a graph where everything looks like nothing is a graph that
 * measured nothing.
 *
 * A distribution with no spread at all (every active day identical, which
 * happens on a machine with two days of history) gets one mid shade rather
 * than the palest: there is no "less" to contrast with, and the faintest
 * square reads as "barely".
 */
export function thresholds(values: readonly number[]): [number, number, number] | null {
  const v = values.filter(x => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const t: [number, number, number] = [q(0.25), q(0.5), q(0.75)];
  return t[0] === t[2] ? null : t;
}

export function levelOf(value: number, t: [number, number, number] | null): DayCell['level'] {
  if (value <= 0) return 0;
  if (t === null) return 3;      // active, but nothing to contrast it with
  if (value <= t[0]) return 1;
  if (value <= t[1]) return 2;
  if (value <= t[2]) return 3;
  return 4;
}

/**
 * Current and longest run of days with something on them.
 *
 * The current run counts back from TODAY, and a silent today does not break
 * it: the day is not over. A silent yesterday does. Without that grace the
 * number reads as broken every morning, which is the fastest way to teach
 * someone to ignore it.
 */
export function streaks(days: Set<string>, today: Date): { streak: number; best: number } {
  let streak = 0;
  let cursor = days.has(keyOf(today)) ? today : shift(today, -1);
  while (days.has(keyOf(cursor))) {
    streak++;
    cursor = shift(cursor, -1);
  }

  let best = 0;
  let run = 0;
  const sorted = [...days].sort();
  let prev: string | null = null;
  for (const day of sorted) {
    const isNext = prev !== null && keyOf(shift(new Date(`${prev}T12:00:00`), 1)) === day;
    run = isNext ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return { streak, best: Math.max(best, streak) };
}

export interface GridOptions {
  /** Longest window shown. 53 is a year, the shape everyone recognises. */
  maxWeeks?: number;
  /** Shortest window shown, so a machine with three days of history gets a
   *  calendar rather than a single column floating in the corner. */
  minWeeks?: number;
  /** Month labels, in the reader's language, January first. */
  monthNames?: readonly string[];
  /** Injectable for the tests. Defaults to now. */
  now?: Date;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Build the calendar.
 *
 * The window ends on today and starts on a Monday, which is what makes every
 * column a whole week. Its length follows the data between the two bounds: a
 * year of empty squares under three days of history is a claim about eleven
 * months nobody measured.
 */
export function buildGrid(
  byDay: Record<string, TokenCounts>,
  metric: Metric,
  opts: GridOptions = {},
): ActivityGrid {
  const { maxWeeks = 53, minWeeks = 13, monthNames = MONTHS_EN } = opts;
  const today = midnight(opts.now ?? new Date());

  const keys = Object.keys(byDay).sort();
  const earliest = keys.length > 0 ? new Date(`${keys[0]}T12:00:00`) : today;
  const spanDays = Math.max(0, Math.round((today.getTime() - midnight(earliest).getTime()) / DAY_MS));
  const weeks = Math.min(maxWeeks, Math.max(minWeeks, Math.ceil((spanDays + 1) / 7) + 1));

  // Back to the Monday that opens the window, so each column is a real week.
  const end = shift(today, 6 - weekday(today));          // the Sunday closing this week
  const start = shift(end, -(weeks * 7 - 1));

  const values = Object.values(byDay).map(c => metricValue(c, metric));
  const t = thresholds(values);

  const grid: DayCell[][] = [];
  const months: { label: string; week: number }[] = [];
  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    const column: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = shift(start, w * 7 + d);
      const day = keyOf(date);
      const counts = byDay[day] ?? null;
      const value = counts ? metricValue(counts, metric) : 0;
      const future = date.getTime() > today.getTime();
      column.push({ day, counts, value, level: future ? 0 : levelOf(value, t), future });
      // The label goes on the column where a month first appears, which is how
      // a month that starts mid-week lands over its own squares.
      if (d === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth();
        months.push({ label: monthNames[lastMonth] ?? '', week: w });
      }
    }
    grid.push(column);
  }

  // The headline, the active-day count and the streaks are all about whether
  // the day happened at all, so they count CALLS and not the chosen metric.
  // Otherwise switching the graph to "cache read" would break a streak on the
  // day someone started a fresh conversation, which says nothing about them.
  const total = emptyCounts();
  const active = new Set<string>();
  for (const [day, counts] of Object.entries(byDay)) {
    if (day < keyOf(start) || day > keyOf(today)) continue;   // outside the window
    addCounts(total, counts);
    if (counts.calls > 0) active.add(day);
  }
  const activeDays = active.size;

  return {
    weeks: grid,
    months,
    total,
    activeDays,
    ...streaks(active, today),
    from: keyOf(start),
    to: keyOf(today),
  };
}

/**
 * A count at a glance: 1 234 → `1,2k`, 39 521 868 448 → `39,5Md`.
 *
 * Short because the numbers here reach eleven digits and a table cell does
 * not. Exact figures belong in the tooltip, where there is room to be exact.
 */
export function compact(n: number, locale = 'en'): string {
  const fr = locale.startsWith('fr');
  const es = locale.startsWith('es');
  const sep = fr || es ? ',' : '.';
  const units: [number, string][] = [
    [1e9, fr ? 'Md' : es ? 'MM' : 'B'],
    [1e6, 'M'],
    [1e3, fr || es ? 'k' : 'k'],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      return `${(v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', sep)}${suffix}`;
    }
  }
  return String(n);
}

/** `2026-09-16` → a date a person reads, in their own language. */
export function readableDay(day: string, locale: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  try {
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    // An invalid BCP-47 tag from the host must cost the label, never the graph.
    return day;
  }
}

/** The day a session belongs to, for grouping outside the grid. */
export { dayKey };
