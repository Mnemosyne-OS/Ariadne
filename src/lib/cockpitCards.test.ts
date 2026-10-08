/**
 * cockpitCards.test.ts — a session becomes a card the same way every time,
 * pins survive the host's cap, and the omission is counted rather than lost.
 */
import { describe, it, expect } from 'vitest';
import type { SessionState } from '@mnemosyne_os/agent-transcripts';
import { buildSnapshot, sessionCard, HOST_MAX_CARDS } from './cockpitCards';

const NOW = Date.parse('2026-09-05T20:00:00.000Z');
const T = { unknown: '—', sidechain: 'subagent', files: '{n} fichiers' };

function session(patch: Partial<SessionState> & { path: string }): SessionState {
  return {
    file: 's.jsonl', sessionId: 'id', title: null, model: null, projectPath: null, branch: null,
    isSidechain: false, lastEventAt: null, firstEventAt: null, tool: null, sizeBytes: 0,
    artifacts: [], artifactsCapped: false, humanTurns: [], tokens: null,
    ...patch,
  };
}

const CC = { label: 'CC', tint: '#e07a3f' };

describe('sessionCard', () => {
  it("forwards the connector's own drawing to the plane", () => {
    // The card is how an agent is recognised from across the canvas, so it has
    // to carry the same mark every other surface shows. Falling back to two
    // letters there would identify one session two different ways.
    const s = session({ path: 'C:/t/b.jsonl', lastEventAt: new Date(NOW).toISOString() });
    const withLogo = { label: 'OC', tint: '#ff4d4d', svg: 'M1 1 L2 2 Z' };
    expect(sessionCard({ session: s, mark: withLogo }, NOW, T).mark)
      .toEqual({ label: 'OC', tint: '#ff4d4d', svg: 'M1 1 L2 2 Z' });
  });

  it('carries the title, the harness mark, where it runs and when it was last seen', () => {
    const s = session({
      path: 'C:/t/a.jsonl', title: 'Widget épinglable', model: 'claude-fable-5-1',
      projectPath: 'C:/Users/x/_MNEMOSYNE OS', branch: 'main',
      lastEventAt: new Date(NOW - 60_000).toISOString(),
      artifacts: [{ path: 'a' } as SessionState['artifacts'][number]], artifactsCapped: true,
    });
    expect(sessionCard({ session: s, mark: CC }, NOW, T)).toEqual({
      id: 'C:/t/a.jsonl',
      // The transcript PATH identifies the card; the SESSION identifies what
      // it is about, so the host can tell it is the same work as the card the
      // session publishes about itself.
      subject: 'id',
      title: 'Widget épinglable',
      mark: { label: 'CC', tint: '#e07a3f', svg: null },
      status: 'claude-fable-5-1',
      seenAt: s.lastEventAt,
      lines: ['_MNEMOSYNE OS · main', '1+ fichiers'],
      tone: 'live',
    });
  });

  it('falls back to the first human turn, then to the unknown mark — never an invented name', () => {
    const turn = session({ path: 'p', humanTurns: [{ at: null, text: '  fix the   build ' }] });
    expect(sessionCard({ session: turn, mark: null }, NOW, T).title).toBe('fix the build');
    const bare = session({ path: 'p' });
    expect(sessionCard({ session: bare, mark: null }, NOW, T).title).toBe('—');
  });

  it('is idle, not live, past the liveness window', () => {
    const old = session({ path: 'p', lastEventAt: new Date(NOW - 11 * 60_000).toISOString() });
    expect(sessionCard({ session: old, mark: null }, NOW, T).tone).toBe('idle');
  });

  it('names a subagent as one', () => {
    const side = session({ path: 'p', isSidechain: true });
    expect(sessionCard({ session: side, mark: null }, NOW, T).lines).toEqual(['subagent']);
  });
});

describe('buildSnapshot', () => {
  const live = (i: number) => ({
    session: session({ path: `live${i}`, lastEventAt: new Date(NOW - i * 1000).toISOString() }), mark: CC,
  });
  const quiet = (i: number) => ({
    session: session({ path: `quiet${i}`, lastEventAt: new Date(NOW - (30 + i) * 60_000).toISOString() }), mark: CC,
  });

  it('publishes the pinned sessions first, then the live ones, newest first', () => {
    const rows = [live(3), quiet(1), live(1), quiet(2), live(2)];
    const { cards, omitted } = buildSnapshot(rows, new Set(['quiet2']), NOW, T);
    expect(cards.map(c => c.id)).toEqual(['quiet2', 'live1', 'live2', 'live3']);
    expect(omitted).toBe(0);
  });

  it('keeps every pin when the cap bites, and counts what fell past it', () => {
    const rows = Array.from({ length: HOST_MAX_CARDS + 4 }, (_, i) => live(i));
    const pinned = new Set([`live${HOST_MAX_CARDS + 3}`]);
    const { cards, omitted } = buildSnapshot(rows, pinned, NOW, T);
    expect(cards.length).toBe(HOST_MAX_CARDS);
    expect(cards[0].id).toBe(`live${HOST_MAX_CARDS + 3}`);
    expect(omitted).toBe(4);
  });

  it('does not publish a quiet session nobody pinned', () => {
    const { cards } = buildSnapshot([quiet(1)], new Set(), NOW, T);
    expect(cards).toEqual([]);
  });
});

describe('the words on a card', () => {
  it("speaks the reader's language, not the developer's", () => {
    // 🪤 It was `${n} files`, hardcoded, so a card published by Ariadne read
    // "20 files" next to a host card reading "6 fichiers" on the same board.
    const card = sessionCard(
      {
        session: session({
          path: 'C:/t/s.jsonl',
          artifacts: [
            { path: 'a.ts', origin: 'tool' },
            { path: 'b.ts', origin: 'tool' },
          ] as SessionState['artifacts'],
        }),
        mark: null,
      },
      NOW, T,
    );
    expect(card.lines).toContain('2 fichiers');
  });

});
