import { describe, it, expect } from 'vitest';
import {
  EMPTY_HISTORY, canGoBack, canGoForward, currentPanel, goBack, goForward, navigate, trail,
  type PanelHistory, type PanelRef,
} from './panelHistory';

const ref = (kind: PanelRef['kind'], file: string): PanelRef => ({ kind, file });
const walk = (...refs: PanelRef[]): PanelHistory =>
  refs.reduce<PanelHistory>((h, r) => navigate(h, r), EMPTY_HISTORY);

describe('panelHistory', () => {
  it('starts closed, with nothing to go back to', () => {
    expect(currentPanel(EMPTY_HISTORY)).toBeNull();
    expect(canGoBack(EMPTY_HISTORY)).toBe(false);
    expect(canGoForward(EMPTY_HISTORY)).toBe(false);
  });

  it('opens on what you asked for', () => {
    expect(currentPanel(navigate(EMPTY_HISTORY, ref('session', 'C:/s.jsonl'))))
      .toEqual(ref('session', 'C:/s.jsonl'));
  });

  it('walks back and forward across a trail of links', () => {
    let h = walk(ref('session', 'C:/s.jsonl'), ref('note', 'C:/a.md'), ref('file', 'C:/x.ts'));
    expect(currentPanel(h)?.file).toBe('C:/x.ts');

    h = goBack(h);
    expect(currentPanel(h)?.file).toBe('C:/a.md');
    h = goBack(h);
    expect(currentPanel(h)?.file).toBe('C:/s.jsonl');
    expect(canGoBack(h)).toBe(false);

    h = goForward(h);
    expect(currentPanel(h)?.file).toBe('C:/a.md');
  });

  it('refuses to walk past either end rather than closing', () => {
    const h = walk(ref('note', 'C:/a.md'));
    expect(goBack(h)).toBe(h);
    expect(goForward(h)).toBe(h);
    expect(currentPanel(goBack(h))).not.toBeNull();
  });

  // The ordinary browser rule. What was ahead is no longer where you came
  // from, and offering "forward" into an abandoned branch is a lie about
  // where you have been.
  it('drops the forward trail when you leave from the middle', () => {
    let h = walk(ref('note', 'C:/a.md'), ref('note', 'C:/b.md'), ref('note', 'C:/c.md'));
    h = goBack(h);
    expect(canGoForward(h)).toBe(true);
    h = navigate(h, ref('note', 'C:/d.md'));
    expect(canGoForward(h)).toBe(false);
    expect(h.entries.map(e => e.file)).toEqual(['C:/a.md', 'C:/b.md', 'C:/d.md']);
  });

  it('treats reopening the entry on screen as a close, the way the lists toggle', () => {
    const h = walk(ref('note', 'C:/a.md'), ref('note', 'C:/b.md'));
    expect(navigate(h, ref('note', 'C:/b.md'))).toEqual(EMPTY_HISTORY);
  });

  // Same path, different panel: a session transcript and a file at the same
  // path are not the same screen.
  it('does not confuse two kinds pointing at one path', () => {
    const h = walk(ref('note', 'C:/a.md'));
    expect(currentPanel(navigate(h, ref('file', 'C:/a.md')))).toEqual(ref('file', 'C:/a.md'));
  });

  it('closing forgets the trail rather than leaving a back to press', () => {
    const h = walk(ref('note', 'C:/a.md'), ref('note', 'C:/b.md'));
    expect(navigate(h, null)).toEqual(EMPTY_HISTORY);
  });

  it('revisiting a place you already saw adds a step rather than jumping back', () => {
    const h = walk(ref('note', 'C:/a.md'), ref('note', 'C:/b.md'), ref('note', 'C:/a.md'));
    expect(h.entries).toHaveLength(3);
    expect(currentPanel(h)?.file).toBe('C:/a.md');
    expect(currentPanel(goBack(h))?.file).toBe('C:/b.md');
  });

  describe('trail', () => {
    it('names where back leads, oldest first', () => {
      const h = walk(ref('session', 'C:/s.jsonl'), ref('note', 'C:/a.md'), ref('file', 'C:/x.ts'));
      expect(trail(h).map(e => e.file)).toEqual(['C:/s.jsonl', 'C:/a.md']);
    });

    it('is empty at the start of the trail and when closed', () => {
      expect(trail(walk(ref('note', 'C:/a.md')))).toEqual([]);
      expect(trail(EMPTY_HISTORY)).toEqual([]);
    });
  });
});
