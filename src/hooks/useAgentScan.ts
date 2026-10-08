/**
 * Everything read off an agent's folder, and the memory of what was read.
 *
 * This is one hook rather than five loose pieces in the shell because the five
 * refs below are MODULE STATE: split any of their users away from them and you
 * get a second, silent copy of the walk memory, with nothing throwing. Whoever
 * touches this next should move the state and its accessors together, or move
 * neither.
 *
 * Nothing here decides WHERE to look. It is handed the folders the human
 * designated and reads those.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readSession, readDoc, walkSource, activeDirs, shouldSweep,
  type SessionState, type DocState, type DirEntry,
} from '@mnemosyne_os/agent-transcripts';
import type { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { SOURCES, type Source } from '../lib/sources';
import type { ScanStats } from '../lib/shared';

/** One agent's current picture: what it holds, whether a pass is running, and
 *  why the last one came back empty. */
export interface SourceData {
  sessions: SessionState[];
  docs: DocState[];
  stats: ScanStats | null;
  busy: boolean;
  error: string | null;
}

export const EMPTY: SourceData = { sessions: [], docs: [], stats: null, busy: false, error: null };

const POLL_MS = 5000;
/** Sessions whose fingerprint changed are re-read; this caps how many of them
 *  we pull in one pass so a first run on a large folder stays responsive. */
const MAX_SESSION_READS = 12;

export interface AgentScan {
  /** Keyed by source id. A source never scanned is absent, not empty: the two
   *  are different answers and the hub renders them differently. */
  data: Record<string, SourceData>;
  /** Forget one agent, caches and rendered rows together. Re-pointing a folder
   *  must not cost the OTHER agent its walk memory, which is why this is not
   *  forgetEverything with an argument. */
  forgetSource: (sourceId: string) => void;
  /** Forget all of them. */
  forgetEverything: () => void;
  /** Drop the cached parse of one file, whichever agent it belongs to, so the
   *  next pass re-reads it. Needed after a hand edit: the fingerprint is
   *  size:mtime, and an edit that changes neither enough would otherwise leave
   *  the panel showing the text from before it. */
  dropCached: (path: string) => void;
}

/**
 * @param folders the agents to poll, keyed by source id, as the human chose them.
 * @param errorLabel what to show when a scan throws something that is not an Error.
 */
export function useAgentScan(
  sdk: MnemoCartridgeSDK, folders: Record<string, string>, errorLabel: string,
): AgentScan {
  const [data, setData] = useState<Record<string, SourceData>>({});

  /** Per source, keyed "<sourceId>|<path>": the fingerprint "size:mtime" of a
   *  file already read, and what it parsed to. Keyed by SOURCE, not by path
   *  alone: two agents pointed at the same folder would otherwise hand each
   *  other entries parsed with the wrong connector. */
  const seen = useRef(new Map<string, string>());
  /** Per source: the session directories a pass found files in, and when the
   *  last full sweep ran. A buried layout costs one listing per session, so a
   *  cheap pass revisits only what was recently active (see lib/walk). */
  const activeBySource = useRef(new Map<string, string[]>());
  const lastSweep = useRef(new Map<string, number>());
  const sessionCache = useRef(new Map<string, SessionState>());
  const docCache = useRef(new Map<string, DocState>());

  /**
   * Forget everything read for one agent.
   *
   * Its walk memory goes too: keeping it would send the next cheap pass to the
   * directories of the FOLDER THAT WAS JUST REPLACED, and nothing would appear
   * until the sweep timer came round a minute later.
   */
  const forgetSource = useCallback((sourceId: string) => {
    const mine = `${sourceId}|`;
    for (const k of [...seen.current.keys()]) if (k.startsWith(mine)) seen.current.delete(k);
    for (const k of [...sessionCache.current.keys()]) if (k.startsWith(mine)) sessionCache.current.delete(k);
    for (const k of [...docCache.current.keys()]) if (k.startsWith(mine)) docCache.current.delete(k);
    activeBySource.current.delete(sourceId);
    lastSweep.current.delete(sourceId);
    // The rendered rows go with the caches. Both call sites did these two
    // things in a row, and a caller that did one and forgot the other would
    // paint an agent's old sessions under a folder that no longer holds them.
    setData(d => ({ ...d, [sourceId]: EMPTY }));
  }, []);

  const forgetEverything = useCallback(() => {
    seen.current.clear();
    sessionCache.current.clear();
    docCache.current.clear();
    activeBySource.current.clear();
    lastSweep.current.clear();
    setData({});
  }, []);

  const scan = useCallback(async (source: Source, root: string) => {
    setData(d => ({ ...d, [source.id]: { ...(d[source.id] ?? EMPTY), busy: true, error: null } }));
    try {
      const now = Date.now();
      const sweep = shouldSweep(lastSweep.current.get(source.id) ?? null, now);
      const { sessionFiles, noteFiles, entries } = await walkSource(
        (dirPath) => sdk.invoke<{ success: boolean; files?: DirEntry[]; error?: string }>(
          'dialog.readDir', { dirPath }),
        root, source.sessions, source.notes,
        { sweep, knownDirs: activeBySource.current.get(source.id) },
      );
      if (sweep) lastSweep.current.set(source.id, now);

      // Newest first: mtime comes free with the listing, so recency costs no
      // file reads at all. Only what actually moved is opened.
      sessionFiles.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
      noteFiles.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));

      let readError: string | null = null;
      let refused = 0;
      const read = async (f: DirEntry): Promise<string | null> => {
        const res = await sdk.invoke<{ success: boolean; content?: string; error?: string }>(
          'dialog.readFile', { filePath: f.path });
        if (!res?.success || typeof res.content !== 'string') {
          // Never swallow this. A silently skipped read looks exactly like an
          // empty folder, and that is how a host-side refusal (an extension
          // the bridge will not open, a file too large) stayed invisible.
          if (!readError) readError = res?.error ?? 'read refused';
          refused++;
          console.warn(`[Ariadne] read refused for ${f.name}: ${readError}`);
          return null;
        }
        return res.content;
      };

      const key = (path: string) => `${source.id}|${path}`;

      let reads = 0;
      for (const f of sessionFiles) {
        const print = `${f.sizeBytes ?? 0}:${f.mtime ?? 0}`;
        if (seen.current.get(key(f.path)) === print && sessionCache.current.has(key(f.path))) continue;
        if (reads >= MAX_SESSION_READS) break;
        reads++;
        const content = await read(f);
        if (content === null) continue;
        const st = readSession(source.sessions, f.name, f.path, content, f.sizeBytes ?? 0);
        // A session with no title borrows the one-line summary of its task
        // note, which only harnesses that write a notes sidecar have. Asked of
        // every source, this was three refused reads per Claude Code session
        // on every pass.
        const sidecar = source.notes?.sidecar;
        if (st && !st.title && sidecar) {
          const sessionDir = f.path.replace(/\\/g, '/').split('/').slice(0, -3).join('/');
          for (const noteName of ['task.md', 'implementation_plan.md', 'walkthrough.md']) {
            const metaPath = `${sessionDir}/${noteName}${sidecar.suffix}`;
            const res = await sdk.invoke<{ success: boolean; content?: string }>(
              'dialog.readFile', { filePath: metaPath });
            if (res?.success && typeof res.content === 'string') {
              try {
                const meta = JSON.parse(res.content) as { summary?: string };
                if (meta.summary?.trim()) {
                  st.title = meta.summary.trim();
                  break;
                }
              } catch (err) {
                console.warn(`[Ariadne] unreadable note sidecar ${metaPath}:`, err);
              }
            }
          }
        }
        seen.current.set(key(f.path), print);
        if (st) sessionCache.current.set(key(f.path), st);
      }

      // Notes are small and few; reading all of them in one pass is cheap and
      // spares the user a list that fills in over several ticks.
      if (source.notes) {
        for (const f of noteFiles) {
          const print = `${f.sizeBytes ?? 0}:${f.mtime ?? 0}`;
          if (seen.current.get(key(f.path)) === print && docCache.current.has(key(f.path))) continue;
          const content = await read(f);
          if (content === null) continue;
          // The sidecar is best-effort: it carries the description, and a
          // document with none still belongs in the list.
          let sidecar: string | null = null;
          if (source.notes.sidecar) {
            const res = await sdk.invoke<{ success: boolean; content?: string }>(
              'dialog.readFile', { filePath: f.path + source.notes.sidecar.suffix });
            if (res?.success && typeof res.content === 'string') sidecar = res.content;
          }
          seen.current.set(key(f.path), print);
          docCache.current.set(key(f.path), readDoc(
            source.notes, f.name, f.path, content, f.sizeBytes ?? 0, f.mtime ?? 0, sidecar));
        }
      }

      // A cheap pass visits fewer directories than a sweep, so the FILES it
      // returns are a subset. Rendering only those would make the list shrink
      // and grow every five seconds; the cache is the full picture, and the
      // pass only refreshes part of it.
      const mine = `${source.id}|`;
      const sessions = [...sessionCache.current.entries()]
        .filter(([k]) => k.startsWith(mine))
        .map(([, v]) => v)
        .sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));
      activeBySource.current.set(source.id, activeDirs(sessionFiles, source.sessions));

      const docs = [...docCache.current.entries()]
        .filter(([k]) => k.startsWith(mine))
        .map(([, v]) => v)
        .sort((a, b) => b.mtime - a.mtime);

      // Files were found but none could be opened: that is a refusal, not an
      // empty folder, and it must say so rather than render a blank screen.
      const found = sessionFiles.length + noteFiles.length;
      const failed = readError && sessions.length + docs.length === 0 && found > 0;

      setData(d => ({
        ...d,
        [source.id]: {
          sessions, docs, busy: false,
          // 🚨 A refusal is counted even when other files read: one transcript
          // over the host's ceiling among 200 used to vanish from the list
          // without a word (only an ALL-refused folder said anything).
          stats: {
            entries, sessionFiles: sessionFiles.length, noteFiles: noteFiles.length,
            ...(refused > 0 ? { unreadable: refused, refusal: readError ?? undefined } : {}),
          },
          error: failed ? readError : null,
        },
      }));
    } catch (err) {
      console.error(`[Ariadne] scan failed for ${source.id}:`, err);
      setData(d => ({
        ...d,
        [source.id]: {
          ...(d[source.id] ?? EMPTY),
          busy: false,
          error: err instanceof Error ? err.message : errorLabel,
        },
      }));
    }
  }, [sdk, errorLabel]);

  // Every configured source is polled, not only the one being looked at: the
  // hub shows live counts for all of them, and an unchanged file costs a
  // directory listing and no read.
  useEffect(() => {
    const configured = SOURCES.filter(s => folders[s.id]);
    if (configured.length === 0) return;
    const run = () => { for (const s of configured) void scan(s, folders[s.id]); };
    run();
    const id = window.setInterval(run, POLL_MS);
    return () => window.clearInterval(id);
  }, [folders, scan]);

  /** One file, across every agent, so a hand edit is re-read on the next pass. */
  const dropCached = useCallback((path: string) => {
    for (const k of [...seen.current.keys()]) {
      if (k.endsWith(`|${path}`)) seen.current.delete(k);
    }
  }, []);

  return { data, forgetSource, forgetEverything, dropCached };
}
