/**
 * The calendar on screen, and the token column in the runs table.
 *
 * `lib/activity` is tested on its own; this file exercises the WIRING, which
 * is where the pieces being individually right stops being enough. Every case
 * below is something the arithmetic cannot catch: a square painted for a day
 * that has not happened, a harness that records nothing rendered as a quiet
 * year, a column that turns "never said" into a zero.
 *
 * Mounted with react-dom directly, like the other component tests here — no
 * testing-library, so this adds no dependency.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Activity from './Activity';
import Dashboard from './Dashboard';
import { dictFor } from '../i18n';
import type { Connector, SessionState, TokenCounts } from '@mnemosyne_os/agent-transcripts';

const t = dictFor('fr');
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const counts = (over: Partial<TokenCounts> = {}): TokenCounts => ({
  input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, calls: 1, ...over,
});

const session = (over: Partial<SessionState> = {}): SessionState => ({
  file: 's.jsonl', path: 'C:/t/s.jsonl', sessionId: 'S1', title: 'a session',
  model: 'claude-opus-5', projectPath: 'C:/proj', branch: 'main', isSidechain: false,
  lastEventAt: '2026-09-16T10:00:00.000Z', firstEventAt: null, tool: null, sizeBytes: 1,
  artifacts: [], artifactsCapped: false, humanTurns: [], tokens: null, ...over,
});

/** Today, as a local day key — the calendar works in local days. */
const todayKey = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const mount = (el: JSX.Element) => act(() => root.render(el));

describe('Activity', () => {
  it('paints a square for today when today measured something', () => {
    mount(<Activity t={t} lang="fr" filesFound={1}
      sessions={[session({ tokens: { [todayKey]: counts({ output: 100 }) } })]} />);
    const cell = host.querySelector(`[data-testid="cal-day-${todayKey}"]`);
    expect(cell).not.toBeNull();
    expect(cell?.className).not.toContain('l0');
  });

  it('never paints a day that has not happened', () => {
    // A quiet Tuesday and a Tuesday in three days are different facts, and the
    // second one shading like the first is a calendar telling you that you did
    // nothing next week.
    mount(<Activity t={t} lang="fr" filesFound={1}
      sessions={[session({ tokens: { [todayKey]: counts() } })]} />);
    for (const el of host.querySelectorAll('[data-testid="cal-future"]')) {
      expect(el.className).toContain('future');
      expect(el.className).not.toMatch(/\bl[1-4]\b/);
    }
  });

  it('says the harness records nothing instead of drawing an empty year', () => {
    mount(<Activity t={t} lang="fr" filesFound={1} sessions={[session({ tokens: null })]} />);
    expect(host.textContent).toContain(t.activityUnsupported);
    expect(host.querySelector('.cal-grid')).toBeNull();
  });

  it('renders nothing at all when there are no sessions yet', () => {
    // Not the "this harness cannot" line: nobody has been read yet, and saying
    // a harness is incapable on the strength of zero files would be a claim
    // about something nobody measured.
    mount(<Activity t={t} lang="fr" filesFound={0} sessions={[]} />);
    expect(host.textContent).toBe('');
  });

  it('says how much of the folder it has actually read', () => {
    // The reader opens a dozen files per pass, so this graph fills in over
    // minutes. Without this line a half-read calendar reads as a quiet summer.
    mount(<Activity t={t} lang="fr" filesFound={300}
      sessions={[session({ tokens: { [todayKey]: counts() } })]} />);
    expect(host.textContent).toContain('300');
  });

  it('is silent about the read count once everything is read', () => {
    mount(<Activity t={t} lang="fr" filesFound={1}
      sessions={[session({ tokens: { [todayKey]: counts() } })]} />);
    expect(host.textContent).not.toContain(t.activityPartial.slice(0, 20));
  });

  it('counts the sessions its graph leaves out', () => {
    mount(<Activity t={t} lang="fr" filesFound={2} sessions={[
      session({ path: 'a', tokens: { [todayKey]: counts() } }),
      session({ path: 'b', tokens: null }),
    ]} />);
    expect(host.textContent).toContain(t.activitySilent.replace('{n}', '1'));
  });

  it('changes what the squares measure when another metric is pressed', () => {
    mount(<Activity t={t} lang="fr" filesFound={1} sessions={[session({
      tokens: { [todayKey]: counts({ output: 300, cacheRead: 900_000 }) },
    })]} />);
    // The headline starts on calls, which is 1 here.
    expect(host.querySelector('.activity-head .big')?.textContent).toBe('1');

    const outputChip = [...host.querySelectorAll('.metrics .chip')]
      .find(b => b.textContent === t.metricOutput) as HTMLButtonElement;
    act(() => outputChip.click());
    expect(host.querySelector('.activity-head .big')?.textContent).toBe('300');
    expect(outputChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the four exact counters in the tooltip and never their sum', () => {
    mount(<Activity t={t} lang="fr" filesFound={1} sessions={[session({
      tokens: { [todayKey]: counts({ input: 2, cacheWrite: 1088, cacheRead: 728752, output: 528, thinking: 406 }) },
    })]} />);
    const title = host.querySelector(`[data-testid="cal-day-${todayKey}"]`)?.getAttribute('title') ?? '';
    expect(title).toContain(t.metricFresh);
    expect(title).toContain(t.metricCacheRead);
    expect(title).toContain(t.metricThinking);
    // 2 + 1088 = 1090 fresh, and nowhere the 730 370 a sum would produce.
    expect(title.replace(/[\u202f\u00a0\s]/g, '')).toContain('1090');
    expect(title.replace(/[\u202f\u00a0\s]/g, '')).not.toContain('730370');
  });

  it('says so in words when a square has nothing, rather than measuring a zero', () => {
    mount(<Activity t={t} lang="fr" filesFound={1}
      sessions={[session({ tokens: { [todayKey]: counts() } })]} />);
    const empty = [...host.querySelectorAll('.cal-day.l0')]
      .find(e => e.getAttribute('title'));
    expect(empty?.getAttribute('title')).toContain(t.nothingMeasured);
  });
});

describe('the tokens column', () => {
  const dash = (sessions: SessionState[]) => (
    <Dashboard
      t={t} lang="fr" sessions={sessions} docs={[]} live={0} collisions={[]}
      agentOf={new Map()} unplaceable={0} busy={false} error={null}
      stats={{ entries: 1, sessionFiles: sessions.length, noteFiles: 0 }}
      folder="C:/t" openSession={null} onOpenSession={() => {}}
      connector={{ id: 'claude', displayName: 'Claude Code', mark: { label: 'CC' } } as unknown as Connector}
      pinned={new Set()} onTogglePin={() => {}} onPinLive={() => {}}
      pinError={null} pinOmitted={0}
      agentPort={{ answered: false, status: null }}
      selected={null} onToggleSelect={() => {}} onClearSelection={() => {}} keepSlot={null}
      documents={[]} onBrowseDocuments={null} exported={{}} onOpenFile={() => {}}
    />
  );

  it('shows what went up and what came down, and not one merged number', () => {
    act(() => root.render(dash([session({
      tokens: { [todayKey]: counts({ input: 10, cacheWrite: 1190, output: 3400 }) },
    })])));
    const cell = host.querySelector('td.tok');
    expect(cell?.textContent).toContain('↑1,2k');
    expect(cell?.textContent).toContain('↓3,4k');
  });

  it('writes an em dash, never a zero, when the harness records nothing', () => {
    // "Used no tokens" and "never said" are different claims, and only one of
    // them is true.
    act(() => root.render(dash([session({ tokens: null })])));
    const cell = host.querySelector('td.tok');
    expect(cell?.textContent).toBe(t.unknown);
    expect(cell?.querySelector('span')?.getAttribute('title')).toBe(t.tokensNotRecorded);
  });

  it('shows a measured zero as a zero', () => {
    // The other half of the rule: a session that really did use nothing must
    // not be dressed up as a harness that cannot report.
    act(() => root.render(dash([session({ tokens: { [todayKey]: counts({ calls: 0 }) } })])));
    expect(host.querySelector('td.tok')?.textContent).toContain('↑0');
  });
});
