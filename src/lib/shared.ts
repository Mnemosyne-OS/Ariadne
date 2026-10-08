/** Types and constants shared by the shell and its views. Kept out of App.tsx
 *  so a view importing them does not create a cycle back into the shell. */

/** What one pass actually saw, so an empty result can say WHY it is empty
 *  instead of looking like a breakage. */
export interface ScanStats {
  entries: number;
  sessionFiles: number;
  noteFiles: number;
  /** Files the host refused to open this pass (too large, extension refused). */
  unreadable?: number;
  /** The first refusal's reason, as the host said it. */
  refusal?: string;
}

/* ⛔ `LIVE_MINUTES` and `DirEntry` are NOT re-exported here. Every caller now
   imports them straight from `@mnemosyne_os/agent-transcripts`, and a hop
   through this file only creates a second name for one fact. */
