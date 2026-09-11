/**
 * Ariadne's side of the cockpit (doc 110).
 *
 * The host owns the ONE fact — which sessions are pinned, where, at which
 * level. Ariadne never keeps a copy it could disagree with: every answer from
 * `cockpit.pin` / `cockpit.unpin` / `cockpit.publish` carries the pinned ids,
 * and that answer is what the toggles are drawn from. Removing a card from the
 * canvas itself therefore shows up here within one scan, not never.
 *
 * Three moments:
 *   - boot: `cockpit.state` (ungated) asks what is pinned, so an app whose
 *     cards were pinned yesterday resumes publishing without a gesture;
 *   - a gesture: `cockpit.pin` with the card itself, so it appears in the same
 *     frame — this is the first call that can raise the permission dialog,
 *     and it is on a press;
 *   - every scan: while something is pinned, `cockpit.publish` refreshes the
 *     snapshot. Nothing is published while nothing is pinned — a cartridge
 *     that talks to the shell for nobody is noise.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { liveSessions } from '@mnemosyne_os/agent-transcripts';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { buildSnapshot, sessionCard, type CardSource, type CardWords } from '../lib/cockpitCards';

interface PinResult { success: boolean; pinned?: string[]; error?: string }
interface PublishResult { success: boolean; pinned?: string[]; dropped?: number }

export interface Cockpit {
  pinned: ReadonlySet<string>;
  /** Cards past the host's cap on the last publish. Zero is silent. */
  omitted: number;
  /** The last refusal, in the person's words. Null once a call succeeds. */
  error: string | null;
  toggle: (row: CardSource) => void;
  pinLive: () => void;
}

export function useCockpit(
  sdk: MnemoCartridgeSDK,
  rows: readonly CardSource[],
  words: CardWords & { pinFailed: string },
): Cockpit {
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const [omitted, setOmitted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the host refused a publish. The scan loop then stays quiet until
   * the next GESTURE: a permission revoked after the fact would otherwise
   * re-raise the native dialog on every scan, five seconds apart, forever.
   */
  const [paused, setPaused] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const wordsRef = useRef(words);
  wordsRef.current = words;

  // 🚨 Same membership = same Set. A fresh Set on every answer would re-run
  // the publish effect below, whose answer would build a fresh Set, which
  // would re-run the effect — a publish loop with no scan behind it.
  const adopt = useCallback((res: { pinned?: string[] } | null | undefined) => {
    if (!res || !Array.isArray(res.pinned)) return;
    const next = res.pinned;
    setPinned(prev => (sameMembers(prev, next) ? prev : new Set(next)));
  }, []);

  // Boot: what did the host keep for us?
  useEffect(() => {
    let alive = true;
    sdk.invoke<PinResult>('cockpit.state').then(res => {
      if (alive) adopt(res);
    }).catch(err => {
      // An old host without the action: the toggles simply start empty.
      console.warn('[Ariadne] cockpit.state unavailable:', err);
    });
    return () => { alive = false; };
  }, [sdk, adopt]);

  // Every scan: refresh the cards the host is showing.
  useEffect(() => {
    if (pinned.size === 0 || paused) return;
    let alive = true;
    const { cards, omitted: past } = buildSnapshot(rows, pinned, Date.now(), wordsRef.current);
    sdk.invoke<PublishResult>('cockpit.publish', { cards }).then(res => {
      if (!alive) return;
      adopt(res);
      setOmitted(past);
      if (res?.success) setError(null);
      else { setError(wordsRef.current.pinFailed); setPaused(true); }
    }).catch(err => {
      if (!alive) return;
      console.warn('[Ariadne] cockpit.publish refused:', err);
      setError(wordsRef.current.pinFailed);
      setPaused(true);
    });
    return () => { alive = false; };
  }, [sdk, rows, pinned, paused, adopt]);

  const toggle = useCallback((row: CardSource) => {
    const id = row.session.path;
    const action = pinned.has(id) ? 'cockpit.unpin' : 'cockpit.pin';
    const payload = action === 'cockpit.pin'
      ? { id, card: sessionCard(row, Date.now(), wordsRef.current) }
      : { id };
    setPaused(false);
    sdk.invoke<PinResult>(action, payload).then(res => {
      adopt(res);
      setError(res?.success ? null : wordsRef.current.pinFailed);
    }).catch(err => {
      console.warn(`[Ariadne] ${action} refused:`, err);
      setError(wordsRef.current.pinFailed);
    });
  }, [sdk, pinned, adopt]);

  const pinLive = useCallback(() => {
    const now = Date.now();
    setPaused(false);
    const live = rowsRef.current.filter(r => liveSessions([r.session], now).length > 0 && !pinned.has(r.session.path));
    // One at a time: each answer is the host's current truth, and a burst of
    // parallel pins would race the same right-hand column for a spot.
    void (async () => {
      for (const row of live) {
        try {
          const res = await sdk.invoke<PinResult>('cockpit.pin', { id: row.session.path, card: sessionCard(row, now, wordsRef.current) });
          adopt(res);
          if (!res?.success) { setError(wordsRef.current.pinFailed); return; }
        } catch (err) {
          console.warn('[Ariadne] cockpit.pin refused:', err);
          setError(wordsRef.current.pinFailed);
          return;
        }
      }
      setError(null);
    })();
  }, [sdk, pinned, adopt]);

  return { pinned, omitted, error, toggle, pinLive };
}

/** Same ids, any order. Exported for the test that pins the loop away. */
export function sameMembers(prev: ReadonlySet<string>, next: readonly string[]): boolean {
  if (prev.size !== next.length) return false;
  for (const id of next) if (!prev.has(id)) return false;
  return true;
}
