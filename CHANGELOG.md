# Changelog

## 0.4.1 - 2026-08-31

Housekeeping, after the first public release. Nothing changes on screen.

### Fixed

- **The README described a source layout that does not exist.** It listed
  `connector.ts`, `shellWrites.ts` and `walk.ts` under `src/lib/`, and a
  `src/connectors/` folder holding one file per agent. All four moved into
  `@mnemosyne_os/agent-transcripts` when the MCP server started reading the same
  transcripts, and nobody updated the map. It also claimed 250 tests when there
  were 204.
- **A `.test.tsx` file would have been run by nobody.** vitest collected
  `src/**/*.test.ts` only, so a rendering test would have been silently absent
  from a green suite.
- **Nothing type-checked the tests.** The build's `tsc` excludes them on purpose,
  so that shipping does not require vitest to be installed, and ESLint's rules
  are not a type-checker. `pnpm typecheck` now covers everything.

### Changed

- **The note renderer has tests**, 24 of them, over blocks, fenced code, the
  inline set and the `[[link]]` callback. It is a hand-written parser and the
  only thing between a note on disk and what the panel shows, and it had none.
  Nine mutations were applied to it to check the tests hold something: eight
  turned the suite red, and the ninth is documented as uncatchable rather than
  left looking like coverage.
- **App.tsx went from 651 lines to 394.** Reading an agent's folder, its caches
  and its poll timer are one hook now, and the panel's labels are a pure module
  with their own tests. The moved code is unchanged apart from arguments
  replacing closures.
- **Forgetting an agent now clears its rows as well as its caches.** Three call
  sites did those two things on consecutive lines, and one that did the first
  and forgot the second would have painted an agent's old sessions under a
  folder that no longer held them.

## 0.4.0 - 2026-08-29

The version where the file list stopped lying about its own length, and where a
draft can cross into memory without a copy-paste.

### Fixed

- **The files pane showed 30 rows under a counter announcing thousands**, with
  nothing to explain the gap. The runs list showed 12 sessions of 211 the same
  way. Both are now reachable in full, a page at a time, with the remaining
  count on the button.
- **A session could list only 40 files.** 42 of 211 sessions here exceeded that
  in silence; one wrote 101 files and reported 40. The ceiling is 400 and a
  session that reaches it says so.
- **Two thirds of what an agent writes was invisible.** Only four file-writing
  tools counted, so anything produced through a shell -- a heredoc, a
  redirection, a python script -- did not exist. Measured over 211 real
  transcripts: 98 sessions wrote files that way and no other, and one wrote 29
  while showing zero. Reading the commands finds 920 more files here.
- **A note written by a shell command was filed as a coincidence.** MEMORY.md,
  rewritten by a python heredoc, appeared under *changed while it was open* --
  the column for two sessions overlapping in time -- when the session had
  demonstrably written it.
- **Two files in five could not be opened at all.** `dialog:readFile` refused
  their extension: of 14 675 write calls here, 39.4% named one the host would
  not read, `.tsx` alone 3 703 times. Fixed in the host, with the allowlist
  moved to a tested module.

### Added

- **A way back out of the panel.** Everything in the drawer links to everything
  else, and following any of it was a one-way trip: the only control was Close.
  The panel keeps a history now, with the ordinary browser rules, and the
  arrows carry the NAME of their destination. Escape closes, Alt+arrows walk.
- **Editing by hand**, in the panel already showing the file. It re-reads the
  whole file at open rather than trusting the rendered view -- a note's
  frontmatter is stripped for display, and writing back what was displayed
  would delete it. A file the host will not write says so instead of offering
  a Save button that fails on press.
- **Two marks about who touched a file**, never merged: *edited here* (Ariadne
  wrote it, a record, with a time) and *changed after the agent* (the file is
  newer than the last agent action seen on it -- which could be a person, a
  build or a formatter, so the label says WHEN and never WHO). No mark is not
  "untouched": it is no evidence either way.
- **Keep in memory.** Any file in the list opens in the drawer, shows its
  content, and goes into a vault you name on the button. The chronicle carries
  a provenance header and the file's own text, never a paraphrase; a file too
  long to fit is cut **and says it was cut**. One file, one press -- no watcher,
  no rule, no standing import.
- **Files already kept carry a mark**, with the vault in its tooltip.
- **Filters** on the files pane: recorded, from a command, already kept.
- **Origin on every file.** A tool call is a record, a redirection read out of a
  command is an inference, and they are never rendered as the same fact.

### Changed

- The manifest asks for `vault:read` and `vault:write` for the first time, and
  says in itself what they are used for. Because enforcement reads the registry
  built at startup, the panel asks the host to re-read the manifest before its
  first call -- otherwise the run that gained the permission would refuse every
  save with a message that reads like a bug.
- Connector versions: claude-code 1.5.0, antigravity 1.1.0, antigravity-ide
  1.1.0. Each gained a `shellWrite` clause saying WHERE a command string sits.
  The patterns applied to it live in the app, never in a connector: a connector
  is data a stranger can ship, and a pathological pattern would hang the reader
  on your machine. A drift test now asserts that no shipped connector carries
  one.

## 0.3.0 - 2026-08-28

First version fit to hand to someone else.

### Added

- **A hub of agents.** One card per connected agent, with its mark, live
  count, total, and last sign of life. A big **+** opens a chooser showing each
  available agent with the folder its picker will open at, so you see where
  this is about to look before clicking.
- **Antigravity**, the second agent. Transcripts under
  `~/.gemini/antigravity/brain/<id>/.system_generated/logs/`, plus its own
  documents (`task.md`, `implementation_plan.md`, `walkthrough.md`), 271 of
  them here, every one carrying a description in a sidecar file.
- **Conversation names.** The harness names most sessions; 221 of 229 here.
  A session it never named falls back to an excerpt of the first message,
  dimmed so it is not mistaken for a real title.
- **Notes and files tab**, with the documents an agent wrote and every file it
  edited, deduplicated by path.
- **A session's notes**, in two groups that never merge: *written by this
  session* (its own tool calls, a record) and *changed while it was open*
  (timing only, and a parallel session leaves the same trace).
- **First-person summaries**, off by default. Only your own messages are sent,
  about 1% of a transcript. Optional tone reading, also off, which describes the
  session and never you.
- **A view from afar.** Below 60% canvas zoom, every length is divided by the
  zoom so a card painted at 24% lands on screen the size it would have had up
  close.
- **138 tests**, ESLint, and a licence.

### Added, 2026-08-28 (later)

- **Antigravity installs twice**, as the standalone app and as the IDE, and both
  are read: 197 and 113 session folders here. Connect one and the other is derived
  from it, shown with its full path, and connected in a click.
- The connectors gained an `artifact` block with Antigravity's real tool names,
  which surfaces 684 files written on one install and 140 on the other.
- Marks for both agents, and one for Claude Code.

### Fixed

- The SDK dropped `zoom` in transit, so the far view could never fire despite
  being wired at both ends.
- CRLF cost 132 of 249 notes their metadata: in JavaScript `.` does not match
  `\r` and `$` will not match before one, so `key: value\r` failed to parse
  while `key: \r` succeeded, so the bug hid behind its own successes.
- `pick()` crashed on a connector that honestly omitted a field it does not
  have, punishing the honest connector and rewarding one that invents a mapping.
- A refused read was swallowed with a bare `continue`, so a host-side denial
  rendered as an empty folder.
- `filter(Boolean)` ate the leading segment of a POSIX path, turning `/root/p`
  into `root/p`, a directory matching nothing.

### Performance

- A buried layout cost 197 directory listings every five seconds. The walk now
  runs at two speeds: a cheap pass over the 25 most recently active
  directories, a full sweep every 60s. Measured: 101 listings for a sweep over
  100 sessions, 26 for a cheap pass.

### Known limits

- Antigravity records no model, no project path and no branch at line level.
  Those columns stay empty rather than being guessed from a tool argument.
- Token cost per session needs a full pass over the file; the live view reads
  tails only, so costs are not shown.
- The note renderer mirrors the shell's note grammar rather than sharing its
  code, because a sandboxed cartridge cannot import a host component. If that syntax
  grows, this drifts, and no test binds the two.

## 0.1.0 - 2026-08-27

Live view of Claude Code sessions: model, project, branch, last action, last
sign of life, and a warning when two are live on the same branch.
