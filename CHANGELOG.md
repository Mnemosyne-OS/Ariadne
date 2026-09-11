# Changelog

## 0.6.0 - 2026-09-11

The documents your agents write are the subject of this one: found from the
dashboard, read inside Mnemosyne with a reader's tools, or handed to the Notes
app. One permission more than 0.5.0 — `agent:export` — which is why the minor
moves: the app will ask you again.

### Added

- **A way into the documents the agents wrote**, from the dashboard rather than
  from a session you have to find first. The tile carries the four most recent
  names under the count, each opening that document; the number opens the full
  list. No placeholder rows, and no list at all where the agents wrote none — a
  tile of empty slots reads as a broken tile.
- **A document drawer with a reader's tools.** What it is: words, characters,
  reading time. What is in it: the headings, indented by level, each scrolling
  the body. What is beside it: the folder, **listed here**, so every file in it
  opens in this same drawer instead of being handed to Explorer. Opening in the
  OS stays as a small secondary link — taking away a working way out because a
  better one exists is how someone ends up stuck when the better one does not
  cover their case.
  - The 200 wpm is **copied from Mnemosyne's own Notes inspector**, not chosen
    here: one markdown file must not get two reading times depending on which
    surface opened it.
  - Absent rather than invented: an empty document has no reading time and no
    bar, a document without headings gets no outline, and a folder that cannot
    be read says so instead of being drawn as an empty one.
- **Open a document in Mnemosyne's Notes app** — the surface that already is a
  reader, rather than a third one rebuilt here. A file Notes cannot render is
  refused by name and gets no button: handed a `.pdf`, the Notes app passes the
  file to the operating system's default application, which is the one thing
  this exists to keep out of the way.
- **Write a session's conversation as a document.** The `conversation.md` that
  Mnemosyne's cockpit card can produce was something Ariadne could neither find
  nor ask for, so a list of them was empty on almost every session. A button in
  the session drawer now asks for one, and it opens in the same drawer as any
  other file — rendered, with the existing "keep this" button working on it.
  - New permission **`agent:export`**, deliberately not folded into
    `dialog:open`: that one is a READ, and letting a read grant a write is how
    a permission stops meaning what its sentence says. It writes one file, in
    the folder of a transcript that already exists, and nothing leaves your
    machine.
  - Dashboard rows carry a 📄 only when there is a document behind it. An icon
    on every row, most of them opening nothing, is a column of noise.
- **Real marks for the agents**, with how each one got here written down in
  NOTICE.md rather than smoothed over: OpenClaw's is the publisher's own file,
  Antigravity's is traced from its artwork, and Claude Code's is drawn and says
  so — an approximation of a trademark, labelled as one. A shape recalled from
  memory and presented without that label is the thing avoided.

### Changed

- **Three levels of text instead of one grey.** Six different roles — section
  headings, band labels, counts, caveats, chips, secondary columns — were all
  painted the same muted colour at 11-12px, so everything secondary receded by
  exactly the same amount and the eye had no structure to rest on. Titles and
  file names, then structure and data, then genuine asides: three, and only
  three. The "changed while it ran" chips keep their dashes and lose the
  dimming — a distinction is not worth paying for in legibility.
- **The tile lists documents, not every markdown an agent touched.** A working
  session writes half a dozen memory notes into the folder its own connector
  reads, so ranked by recency the newest markdown are always the machine's own
  notes and the document you asked for is never on screen. Ariadne already
  recorded the difference; the tile now uses it, and its tooltip says what is
  counted.

### Fixed

- **OpenClaw is registered where the screen actually reads**, and the hub says
  it has no usual place on disk rather than implying one.
- **An agent is identified from far away the way it is up close** — same badge,
  beside the title and not only in the rows.

## 0.5.0 - 2026-09-06

Sessions can now sit on the board, and the cartridge says who is answering the
agents. Two permissions more than 0.4.1, which is why the minor moves: the app
will ask you again.

### Added

- **OpenClaw sessions can be read** — with one honest limit stated up front.
  OpenClaw 2 moved its live sessions into SQLite, so nothing on disk fills by
  itself; what this reads is the bundle a human exports with `openclaw sessions
  export-trajectory`. Tool writes and shell redirections both come through, so
  a session that wrote every one of its files through the shell is not reported
  as having written none. The export redacts the workspace root, so those rows
  carry **no project path and no branch** rather than a placeholder that looks
  like a directory. Measured against a real session, not the vendor's docs.
- **Pin a session to the canvas.** A row's pin puts a small card on Mnemosyne's
  board — name, what the agent said it was doing, where it runs, files written,
  time since it was last seen — and it stays there while you work elsewhere.
  *Pin the live sessions* places all of them at once, a counter says how many
  are on the board, and cards past the host's per-app ceiling are **counted on
  screen** rather than silently dropped. Permission: `cockpit:pin`. Nothing is
  pinned without a press, and a card you remove stays removed.
- **A line saying whether those agents are reaching THIS app.** When Mnemosyne
  is closed, an agent's MCP starts a headless backend, and that backend can
  still hold the SDK port when the app comes back: the app then looks perfectly
  healthy while every memory call on the machine is answered by another process.
  The line says *reaching this app*, *another process answers*, or *not readable
  from here*. Permission: `metrics:read` — a count and a port, never a name and
  never memory.

### Changed

- **One card per session, not two.** A Claude Code session publishes its own
  card through a hook; pinning the same session here used to add a second one
  beside it, same work, two ids, disagreeing on how fresh they were. Both cards
  now declare what they are ABOUT, and the host draws one — the session's own
  when it exists, because that is the one whose state is declared rather than
  read from a file, and the only one that can be replied to. Ariadne's card is
  what every agent without such a hook gets.

### Fixed

- **"20 files" appeared next to "6 fichiers" on the same board.** The host
  localises what it draws; this cartridge built that line with the count and the
  English word hardcoded, so its cards spoke English on a French screen. EN/FR/ES,
  like everything else here.

- **A refusal no longer asks again ten seconds later.** The host re-asks for
  permission after a deny, so a poll that retried would raise the native dialog
  forever, on nobody's gesture. The port line reads once, keeps reading while it
  is answered, and stops for good the first time it is refused.

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
