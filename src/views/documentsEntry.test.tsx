/**
 * The way into the documents an agent wrote: the dashboard's count, and what
 * the files pane does when it is pressed.
 *
 * Two halves, tested apart because they are two components; App wires them in
 * six lines that tsc checks. What is NOT obvious and is pinned here: the count
 * comes from the SAME list the pane counts, the press is a counter and not a
 * flag, and a count with nowhere to go is not a button.
 *
 * Mounted with react-dom directly, like the other component tests here — no
 * testing-library, so this adds no dependency.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Dashboard from './Dashboard';
import NotesTab from './NotesTab';
import { dictFor } from '../i18n';
import { buildArtifactRows, documentRows, notePathSet } from '../lib/artifactRows';
import { savedKey } from '../lib/settings';
import type { SessionState, Connector } from '@mnemosyne_os/agent-transcripts';
import type { Settings } from '../lib/settings';

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

const CONNECTOR = {
  id: 'claude', displayName: 'Claude Code', mark: { label: 'CC', tint: '#e07a3f' },
} as unknown as Connector;

const SETTINGS = { saved: {}, folders: {} } as unknown as Settings;

function session(id: string, files: string[]): SessionState {
  return {
    path: `C:/t/${id}.jsonl`,
    sessionId: id,
    title: id,
    lastEventAt: '2026-09-08T20:00:00.000Z',
    projectPath: 'C:/proj',
    branch: 'main',
    model: 'claude-opus-5',
    humanTurns: [],
    isSidechain: false,
    artifactsCapped: false,
    artifacts: files.map(p => ({ path: p, origin: 'tool' as const, at: '2026-09-08T20:00:00.000Z' })),
  } as unknown as SessionState;
}

const SESSIONS = [session('a', ['C:/proj/doc.md', 'C:/proj/index.ts', 'C:/proj/notes.markdown'])];

function dashboard(over: Partial<Parameters<typeof Dashboard>[0]> = {}) {
  const rows = buildArtifactRows(SESSIONS, SETTINGS);
  const props = {
    t, sessions: SESSIONS, docs: [], live: 0, collisions: [],
    agentOf: new Map(), unplaceable: 0, busy: false, error: null, stats: null,
    folder: 'C:/t', openSession: null, onOpenSession: () => {},
    connector: CONNECTOR, pinned: new Set<string>(), onTogglePin: () => {},
    onPinLive: () => {}, pinError: null, pinOmitted: 0,
    agentPort: { status: null },
    documents: documentRows(rows, notePathSet([])),
    onBrowseDocuments: () => {},
    exported: {},
    onOpenFile: () => {},
    ...over,
    /**
     * 🪤 The cast below is what lets a missing prop reach the runtime: `as
     * Props` claims the object is already complete, so tsc says nothing.
     * `exported` broke four tests here that way, the trap was written down,
     * and `artifacts` broke SEVEN of them the very next time — a note is not
     * a guard. Kept because the fixture cannot honestly build a whole
     * SessionState, but every new prop has to be added above by hand, and a
     * wave of "Cannot read properties of undefined" here means exactly that.
     */
  } as Parameters<typeof Dashboard>[0];
  act(() => root.render(<Dashboard {...props} />));
  // The COUNT, not the tile around it: the tile also holds the list of names,
  // so the assertions about "is it a control" belong to the count itself.
  return host.querySelector('[data-testid="documents-count"]') as HTMLElement;
}

describe('the dashboard count', () => {
  it('counts the markdown of the SAME list the files pane counts', () => {
    // 🚨 Not a second way of counting. Two figures about one folder, computed
    // twice, is the screen stating two incompatible things — App builds the
    // rows once and hands the same list to both.
    const cell = dashboard();
    expect(cell.querySelector('b')?.textContent).toBe('2');
    expect(documentRows(buildArtifactRows(SESSIONS, SETTINGS), notePathSet([])).length).toBe(2);
  });

  it('is a button when there is somewhere to go, and a plain figure when there is not', () => {
    // ⛔ The files pane lives in a tab that exists only on a source with a
    // NOTES connector, so on the others there is nothing to open. A clickable
    // figure that opens nothing is worse than a figure.
    expect(dashboard().tagName).toBe('BUTTON');
    expect(dashboard({ onBrowseDocuments: null }).tagName).toBe('DIV');
  });

  it('asks once per press', () => {
    let presses = 0;
    const cell = dashboard({ onBrowseDocuments: () => { presses += 1; } });
    act(() => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(presses).toBe(1);
  });

  it('says zero when the agents wrote no markdown, rather than hiding', () => {
    // A measured zero is a fact about this machine; an absent tile would read
    // as a missing feature.
    const cell = dashboard({ documents: [] });
    expect(cell.querySelector('b')?.textContent).toBe('0');
  });
});

describe('the files pane answering that press', () => {
  function pane(documentsRequest: number) {
    const rows = buildArtifactRows(SESSIONS, SETTINGS);
    act(() => root.render(
      <NotesTab
        t={t} docs={[]} sessions={SESSIONS}
        openNote={null} onOpenNote={() => {}}
        openFile={null} onOpenFile={() => {}}
        artifacts={rows} documentsRequest={documentsRequest}
      />,
    ));
    return host;
  }

  it('opens on the files, filtered to markdown', () => {
    const el = pane(1);
    // The markdown chip is on, so the non-markdown file is not in the list.
    expect(el.textContent).toContain('doc.md');
    expect(el.textContent).toContain('notes.markdown');
    expect(el.textContent).not.toContain('index.ts');
  });

  it('leaves the tab alone when nobody pressed anything', () => {
    /**
     * 🚨 The request starts at ZERO and must do nothing. Reacting on mount
     * unconditionally would force the files pane on someone who opened this
     * tab to read their own notes, which is what the tab is named after.
     */
    const el = pane(0);
    expect(el.textContent).not.toContain('doc.md');
  });

  it('re-applies the filter on a second press', () => {
    /**
     * 🪤 Why it is a counter and not a boolean. Pressing the dashboard tile,
     * turning the markdown chip off by hand, then pressing the tile again must
     * filter again — with a flag that is already `true` nothing changes and
     * the tile reads as broken.
     */
    pane(1);
    const chip = [...host.querySelectorAll('button')]
      .find(b => b.className.includes('spaced')) as HTMLButtonElement;
    expect(chip).toBeTruthy();
    act(() => { chip.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('index.ts');

    pane(2);
    expect(host.textContent).not.toContain('index.ts');
  });
});

describe('a session whose conversation was written out', () => {
  const KEY = savedKey(SESSIONS[0].path);
  const MARK = { file: 'C:/t/a/conversation.md', at: '2026-09-08T20:00:00.000Z', turns: 529, skipped: 3 };

  it('carries a way into the document, on that row only', () => {
    // ⛔ Not a column on all 211 rows: most would open nothing, and making one
    // is a press away in the drawer.
    dashboard({ exported: {} });
    expect(host.querySelector('[data-testid="open-doc"]')).toBeNull();

    dashboard({ exported: { [KEY]: MARK } });
    expect(host.querySelector('[data-testid="open-doc"]')).toBeTruthy();
  });

  it('opens the file Ariadne actually wrote, and does not open the session too', () => {
    // 🚨 The row itself opens the session; this button must stop there, or one
    // press opens two panels and the second wins.
    const opened: string[] = [];
    let sessions = 0;
    dashboard({
      exported: { [KEY]: MARK },
      onOpenFile: (p: string) => opened.push(p),
      onOpenSession: () => { sessions += 1; },
    });
    const btn = host.querySelector('[data-testid="open-doc"]') as HTMLElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opened).toEqual([MARK.file]);
    expect(sessions).toBe(0);
  });

  it('keys the mark the way the rest of the settings key paths', () => {
    // A mark stored under a raw Windows path would never match the row again,
    // and the button would simply never appear.
    expect(KEY).toBe(SESSIONS[0].path.toLowerCase());
    expect(savedKey('C:\\t\\A.jsonl')).toBe('c:/t/a.jsonl');
    dashboard({ exported: { [SESSIONS[0].path.toUpperCase()]: MARK } });
    expect(host.querySelector('[data-testid="open-doc"]')).toBeNull();
  });
});

describe('the documents tile', () => {
  it('lists the documents themselves, not only how many', () => {
    // 🚨 « je les veux dans ma tuile ». A count you have to click to find out
    // what it counts is a count.
    dashboard();
    // The list is a SIBLING of the count inside the tile, so it is queried
    // from the host and not from the count element.
    const names = [...host.querySelectorAll('[data-testid="documents-recent"] button')]
      .map(b => b.textContent);
    expect(names).toEqual(['doc.md', 'notes.markdown']);
    // The number is still the way into the full list.
    expect(host.querySelector('[data-testid="documents-count"]')).toBeTruthy();
  });

  it('opens one in the drawer, without going through the full list', () => {
    const opened: string[] = [];
    let browsed = 0;
    dashboard({ onOpenFile: (p: string) => opened.push(p), onBrowseDocuments: () => { browsed += 1; } });
    const first = host.querySelector('[data-testid="documents-recent"] button') as HTMLElement;
    act(() => { first.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opened).toEqual(['C:/proj/doc.md']);
    // ⛔ And it did NOT also navigate: one press, one thing.
    expect(browsed).toBe(0);
  });

  it('shows no list at all when the agents wrote no markdown', () => {
    // ⛔ Not a tile of empty slots — that reads as a broken tile.
    dashboard({ documents: [] });
    expect(host.querySelector('[data-testid="documents-recent"]')).toBeNull();
    expect(host.querySelector('[data-testid="documents-count"]')).toBeTruthy();
  });

  it('caps the list, and keeps the newest', () => {
    // The rows arrive newest-first; the tile slices and never re-sorts, so it
    // cannot disagree with the pane about what is recent.
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...buildArtifactRows(SESSIONS, SETTINGS)[0], path: `C:/p/d${i}.md`,
    }));
    dashboard({ documents: many });
    const names = [...host.querySelectorAll('[data-testid="documents-recent"] button')]
      .map(b => b.textContent);
    expect(names).toEqual(['d0.md', 'd1.md', 'd2.md', 'd3.md']);
  });
});
