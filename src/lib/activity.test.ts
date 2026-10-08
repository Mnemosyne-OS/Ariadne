/**
 * The calendar's arithmetic. Every case here is a square that would have been
 * shaded wrong, which is worse than a square that is missing: a wrong shade
 * looks exactly like a right one.
 */
import { describe, it, expect } from 'vitest';
import type { SessionState, TokenCounts } from '@mnemosyne_os/agent-transcripts';
import {
  buildGrid, compact, levelOf, mergeDays, metricValue, readableDay,
  silentSessions, streaks, thresholds,
} from './activity';

const counts = (over: Partial<TokenCounts> = {}): TokenCounts => ({
  input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, calls: 1, ...over,
});

const session = (tokens: SessionState['tokens']): SessionState => ({
  file: 'f.jsonl', path: 'C:/x/f.jsonl', sessionId: 'S', title: null, model: null,
  projectPath: null, branch: null, isSidechain: false, lastEventAt: null,
  firstEventAt: null, tool: null, sizeBytes: 0, artifacts: [], artifactsCapped: false,
  humanTurns: [], tokens,
});

/** Local noon, so the day key is the same in every timezone the suite runs in. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const key = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('metricValue', () => {
  it('adds input and cache writes into "fresh", and nothing else into anything', () => {
    const c = counts({ input: 10, cacheWrite: 90, cacheRead: 700_000, output: 500, thinking: 400 });
    expect(metricValue(c, 'fresh')).toBe(100);
    expect(metricValue(c, 'output')).toBe(500);
    expect(metricValue(c, 'cacheRead')).toBe(700_000);
    expect(metricValue(c, 'calls')).toBe(1);
  });

  it('never folds thinking into output, which would count it twice', () => {
    expect(metricValue(counts({ output: 500, thinking: 400 }), 'output')).toBe(500);
  });
});

describe('mergeDays', () => {
  it('adds the same day across sessions', () => {
    const merged = mergeDays([
      session({ '2026-09-16': counts({ output: 5 }) }),
      session({ '2026-09-16': counts({ output: 7 }) }),
    ]);
    expect(merged['2026-09-16'].output).toBe(12);
    expect(merged['2026-09-16'].calls).toBe(2);
  });

  it('skips a session whose harness records nothing, instead of counting zeros', () => {
    // A harness with no usage must not be able to darken the graph of one that
    // has it, nor to add a day that measured nothing.
    const merged = mergeDays([session(null), session({ '2026-09-16': counts() })]);
    expect(Object.keys(merged)).toEqual(['2026-09-16']);
  });

  it('counts those silent sessions instead of hiding them', () => {
    expect(silentSessions([session(null), session(null), session({})])).toBe(2);
  });
});

describe('thresholds', () => {
  it('uses the distribution of active days, not a fraction of the maximum', () => {
    // One marathon day among ordinary ones. Against the maximum every ordinary
    // day would fall in the palest shade and the graph would say nothing.
    const t = thresholds([1, 2, 3, 4, 1000]);
    expect(t).not.toBeNull();
    expect(levelOf(1000, t)).toBe(4);
    expect(levelOf(3, t)).toBeGreaterThan(1);
  });

  it('ignores empty days when deciding where the shades begin', () => {
    expect(thresholds([0, 0, 0, 5, 10, 15, 20])).toEqual(thresholds([5, 10, 15, 20]));
  });

  it('returns nothing to contrast with when every active day is identical', () => {
    expect(thresholds([7, 7, 7])).toBeNull();
    // and those days get a middle shade, not the faintest, which would read as
    // "barely" on a machine that simply has no variation yet.
    expect(levelOf(7, null)).toBe(3);
  });

  it('leaves an empty day empty whatever the thresholds say', () => {
    expect(levelOf(0, [1, 2, 3])).toBe(0);
    expect(levelOf(0, null)).toBe(0);
  });

  it('has no thresholds at all when nothing is active', () => {
    expect(thresholds([0, 0])).toBeNull();
  });
});

describe('streaks', () => {
  const today = day(2026, 9, 16);

  it('counts consecutive days back from today', () => {
    const days = new Set([key(2026, 9, 14), key(2026, 9, 15), key(2026, 9, 16)]);
    expect(streaks(days, today).streak).toBe(3);
  });

  it('does not break the run on a morning when nothing has happened YET', () => {
    // The day is not over. Without this the number reads as broken every
    // morning, which teaches people to ignore it.
    const days = new Set([key(2026, 9, 14), key(2026, 9, 15)]);
    expect(streaks(days, today).streak).toBe(2);
  });

  it('does break it on a silent yesterday', () => {
    const days = new Set([key(2026, 9, 13), key(2026, 9, 14)]);
    expect(streaks(days, today).streak).toBe(0);
  });

  it('finds the longest run anywhere in the window', () => {
    const days = new Set([
      key(2026, 9, 1), key(2026, 9, 2), key(2026, 9, 3), key(2026, 9, 4),
      key(2026, 9, 10),
      key(2026, 9, 15), key(2026, 9, 16),
    ]);
    const s = streaks(days, today);
    expect(s.best).toBe(4);
    expect(s.streak).toBe(2);
  });

  it('crosses a month boundary, where a naive day+1 would stop', () => {
    const days = new Set([key(2026, 8, 30), key(2026, 8, 31), key(2026, 9, 1)]);
    expect(streaks(days, day(2026, 9, 1)).streak).toBe(3);
  });

  it('is zero on an empty history rather than one', () => {
    expect(streaks(new Set(), today)).toEqual({ streak: 0, best: 0 });
  });
});

describe('buildGrid', () => {
  const now = day(2026, 9, 16);         // a Wednesday

  it('paints whole weeks, Monday first', () => {
    const g = buildGrid({}, 'calls', { now });
    expect(g.weeks.every(w => w.length === 7)).toBe(true);
    const monday = new Date(`${g.weeks[0][0].day}T12:00:00`);
    expect(monday.getDay()).toBe(1);
  });

  it('marks the days after today as holes, never as empty days', () => {
    // A quiet Tuesday and a Tuesday that has not happened are different facts.
    const g = buildGrid({}, 'calls', { now });
    const last = g.weeks[g.weeks.length - 1];
    const cells = last.filter(c => c.day > key(2026, 9, 16));
    expect(cells.length).toBe(4);              // Thu..Sun of the current week
    expect(cells.every(c => c.future)).toBe(true);
    expect(last.find(c => c.day === key(2026, 9, 16))?.future).toBe(false);
  });

  it('shows a quarter, not a blank year, on a machine with three days of history', () => {
    const g = buildGrid({ [key(2026, 9, 14)]: counts() }, 'calls', { now });
    expect(g.weeks.length).toBe(13);
  });

  it('stops at a year even when the history is longer', () => {
    const g = buildGrid({ [key(2020, 1, 1)]: counts() }, 'calls', { now });
    expect(g.weeks.length).toBe(53);
  });

  it('grows the window to cover the history in between', () => {
    const g = buildGrid({ [key(2026, 4, 1)]: counts() }, 'calls', { now });
    expect(g.weeks.length).toBeGreaterThan(13);
    expect(g.weeks.length).toBeLessThan(53);
    expect(g.from <= key(2026, 4, 1)).toBe(true);
  });

  it('puts a day on its own square', () => {
    const g = buildGrid({ [key(2026, 9, 15)]: counts({ output: 42 }) }, 'output', { now });
    const cell = g.weeks.flat().find(c => c.day === key(2026, 9, 15));
    expect(cell?.value).toBe(42);
    expect(cell?.level).toBeGreaterThan(0);
  });

  it('leaves a day outside the window out of the totals', () => {
    const g = buildGrid({
      [key(2020, 1, 1)]: counts({ output: 999 }),
      [key(2026, 9, 15)]: counts({ output: 1 }),
    }, 'output', { now });
    // 2020 is before the 53-week window: it sets the window's length, it does
    // not get added to a headline that describes the squares on screen.
    expect(g.total.output).toBe(1);
    expect(g.activeDays).toBe(1);
  });

  it('keeps the streak on days that happened, not on the metric being shown', () => {
    // A fresh conversation reads nothing from cache. Shading by cache read
    // must not tell someone they broke a run on the day they started one.
    const g = buildGrid({
      [key(2026, 9, 15)]: counts({ cacheRead: 5000 }),
      [key(2026, 9, 16)]: counts({ cacheRead: 0, output: 10 }),
    }, 'cacheRead', { now });
    expect(g.streak).toBe(2);
    expect(g.activeDays).toBe(2);
  });

  it('labels the months it spans, in the language it was given', () => {
    const g = buildGrid({}, 'calls', {
      now, monthNames: ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'],
    });
    expect(g.months.map(m => m.label)).toContain('sep');
    expect(g.months[0].week).toBe(0);
  });

  it('survives having no data at all', () => {
    const g = buildGrid({}, 'calls', { now });
    expect(g.total.calls).toBe(0);
    expect(g.activeDays).toBe(0);
    expect(g.streak).toBe(0);
    expect(g.weeks.flat().every(c => c.level === 0)).toBe(true);
  });
});

describe('compact', () => {
  it('shortens the eleven-digit numbers this data actually reaches', () => {
    expect(compact(39_521_868_448, 'en')).toBe('39.5B');
    expect(compact(39_521_868_448, 'fr')).toBe('39,5Md');
    expect(compact(1_404_917, 'en')).toBe('1.4M');
    expect(compact(1234, 'fr')).toBe('1,2k');
  });

  it('leaves a small number alone rather than rounding it to nothing', () => {
    expect(compact(0, 'en')).toBe('0');
    expect(compact(7, 'en')).toBe('7');
    expect(compact(999, 'en')).toBe('999');
  });

  it('drops the decimal once it would be noise', () => {
    expect(compact(123_400, 'en')).toBe('123k');
  });
});

describe('readableDay', () => {
  it('falls back to the raw day rather than losing the graph on a bad locale', () => {
    expect(readableDay('2026-09-16', 'not a locale!')).toBe('2026-09-16');
    expect(readableDay('nonsense', 'en')).toBe('nonsense');
  });

  it('reads a real day in the given language', () => {
    expect(readableDay('2026-09-16', 'en')).toMatch(/Sep/);
  });
});
