/**
 * The claim has to be exact. "A human edited this" is not provable from a
 * filesystem timestamp; "this changed after the last agent action we saw" is.
 * Every test here defends the distance between those two sentences.
 */
import { describe, it, expect } from 'vitest';
import { editMark, lastAgentTouch } from './handEdits';
import { DEFAULTS, rememberEdited, type Settings } from './settings';

const T = (h: number, m = 0) =>
  `2026-08-28T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const ms = (iso: string) => Date.parse(iso);

const session = (artifacts: { path: string; at: string | null }[], lastEventAt: string | null = T(11)) =>
  ({ artifacts, lastEventAt });

describe('editMark', () => {
  it('says "here" for a file Ariadne wrote, whatever the timestamps say', () => {
    const s = rememberEdited(DEFAULTS, 'C:/a.md', { at: T(9) });
    expect(editMark('C:/a.md', ms(T(1)), T(23), s)).toBe('here');
  });

  it('matches its own record across separators and case', () => {
    const s = rememberEdited(DEFAULTS, 'C:\\Notes\\A.md', { at: T(9) });
    expect(editMark('c:/notes/a.md', null, null, s)).toBe('here');
  });

  it('says "after" when the file is newer than the last agent action', () => {
    expect(editMark('C:/a.md', ms(T(15)), T(11), DEFAULTS)).toBe('after');
  });

  it('says nothing when the agent action is the more recent of the two', () => {
    expect(editMark('C:/a.md', ms(T(9)), T(11), DEFAULTS)).toBeNull();
  });

  // The harness logs the call, then the write lands. A second or two of gap is
  // the normal case, and calling it a hand edit would mark every file.
  it('does not call a two-second gap an edit', () => {
    expect(editMark('C:/a.md', ms(T(11)) + 2_000, T(11), DEFAULTS)).toBeNull();
    expect(editMark('C:/a.md', ms(T(11)) + 60_000, T(11), DEFAULTS)).toBe('after');
  });

  // An absent measurement must never produce a claim. Both of these used to be
  // the shape that turns "we did not look" into "nothing happened".
  it('makes no claim when the mtime is unknown', () => {
    expect(editMark('C:/a.md', null, T(11), DEFAULTS)).toBeNull();
  });

  it('makes no claim when no agent action ever named the file', () => {
    expect(editMark('C:/a.md', ms(T(15)), null, DEFAULTS)).toBeNull();
  });

  it('makes no claim on an unparseable agent timestamp', () => {
    expect(editMark('C:/a.md', ms(T(15)), 'not a date', DEFAULTS)).toBeNull();
  });

  it('leaves a file with no evidence unmarked rather than reassuring about it', () => {
    expect(editMark('C:/a.md', null, null, DEFAULTS)).toBeNull();
  });
});

describe('lastAgentTouch', () => {
  it('finds the most recent action naming that path, across sessions', () => {
    const sessions = [
      session([{ path: 'C:/a.md', at: T(9) }]),
      session([{ path: 'C:/a.md', at: T(14) }]),
      session([{ path: 'C:/b.md', at: T(20) }]),
    ];
    expect(lastAgentTouch('C:/a.md', sessions)).toBe(T(14));
  });

  it('matches across separators and case', () => {
    expect(lastAgentTouch('c:/notes/a.md', [session([{ path: 'C:\\Notes\\A.md', at: T(9) }])])).toBe(T(9));
  });

  // A tool call with no timestamp still proves the session touched the file,
  // and the session's own last event is a real upper bound on when.
  it('falls back to the session time for an action with no timestamp', () => {
    expect(lastAgentTouch('C:/a.md', [session([{ path: 'C:/a.md', at: null }], T(11))])).toBe(T(11));
  });

  it('answers null when nothing named it, rather than a date', () => {
    expect(lastAgentTouch('C:/never.md', [session([{ path: 'C:/a.md', at: T(9) }])])).toBeNull();
    expect(lastAgentTouch('C:/a.md', [])).toBeNull();
  });

  it('answers null when the only session that touched it has no time at all', () => {
    expect(lastAgentTouch('C:/a.md', [session([{ path: 'C:/a.md', at: null }], null)])).toBeNull();
  });
});

describe('the two marks together', () => {
  it('lets a record win over the inference for the same file', () => {
    const s: Settings = rememberEdited(DEFAULTS, 'C:/a.md', { at: T(20) });
    // The mtime would also support "after"; the record is the stronger claim.
    expect(editMark('C:/a.md', ms(T(20)), T(11), s)).toBe('here');
    expect(editMark('C:/other.md', ms(T(20)), T(11), s)).toBe('after');
  });
});
