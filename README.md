<img src="docs/logo.svg" alt="" width="88" align="left" hspace="16" vspace="4">

# Ariadne

Every draft your coding agents wrote, browsable, and the ones worth keeping one
press from your memory. A [Mnemosyne OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
cartridge that reads the session transcripts and notes your agents already write
on this machine.

<br clear="left">

> [!WARNING]
> **Ariadne is in beta, and it is not in the store yet.**
>
> Version 0.4.1 means what it says. You add it by hand, by pasting this repo's
> URL into Mnemosyne (see [Installing it](#installing-it)). There is no catalog
> entry, no review, and no signed listing behind it.
>
> What has actually been observed: it was built and driven against **212 real
> transcripts** on the author's machine, Claude Code and Antigravity, on
> **Windows**, and it carries **249 tests**.
>
> What nobody has watched yet: macOS, Linux, anyone else's folder layout, and
> any agent other than those two. Transcript formats are undocumented and shift
> between releases, so the connector that reads yours may be reading a shape it
> has never seen. **If a column is empty or a number looks wrong, that is the
> bug I want.** See [What would help most](#what-would-help-most).

---

Coding agents keep a full transcript of every session on disk. Ariadne reads
those files and shows you, per session: which agent, what the conversation was
called, the project, the git branch, the last action, the files it wrote, and
when it was last seen.

Working with an agent produces a heap of drafts, and only a few are worth
keeping. Ariadne lists all of them, opens any one of them, and sends the one you
choose into a vault you name, with a header saying where it came from and the
file's own text unparaphrased. One file, one press. There is no watcher and no
standing import.

It also warns you when two sessions are live on the same branch, because a
commit from one picks up the other's staged work.

Nothing leaves the machine, and no file is opened until you connect a folder.

One nuance. Once an agent is connected, Ariadne may check whether a twin lives
beside it, since Antigravity installs twice, as the app and as the IDE. That
check is a directory listing on a path DERIVED from the folder you already
designated, it is shown to you before anything happens, and connecting it is
still a click. The app never resolves a location you did not give it.

---

## Installing it

Ariadne is a cartridge: it runs inside Mnemosyne OS, in a sandboxed iframe. You
need the host first ([latest release](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest)).

Then, in the app:

1. Open **MnemoHub**.
2. **Add an external cartridge**, then **A repository**.
3. Paste `https://github.com/Mnemosyne-OS/Ariadne` and press **Read it**.
4. Mnemosyne downloads the manifest and shows you the name, the version and the
   permissions *before* installing anything. Confirm with **Install**.

Two things worth knowing before you do that:

- **It spends your free external-cartridge slot.** Mnemosyne allows one
  cartridge from outside the store without a license, and a second one needs an
  active Engramm. A repo install and a local folder link draw on the same slot.
- **Updates come from this repo.** The manifest declares `updateStrategy: git`,
  so the app checks this URL rather than a catalog. Nothing is fetched on its
  own between those checks.

## What it reads today

| Agent | Sessions | Documents |
|---|---|---|
| **Claude Code** | `~/.claude/projects/<project>/*.jsonl` | `memory/*.md` |
| **Antigravity** | `~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl` | `task.md`, `implementation_plan.md`, `walkthrough.md` … |

Adding another agent means adding a **connector file**, which is data rather
than code. See [`docs/CONNECTORS.md`](docs/CONNECTORS.md). If you write one that
works, it is the single most useful thing you could send back.

## What it deliberately does not do

**It never says an agent is "working".** A crashed agent and an idle one produce
exactly the same silence, so a green light would be a guess. It shows *last seen
3 s ago*, which the timestamps actually prove, and lets you conclude.

**It never asks the agent about itself.** The narrator cannot be the subject: an
agent that dies stops writing its own status. Everything here comes from what
the harness writes, so a crashed session still reports truthfully by falling
silent.

**It never invents a field.** An agent that records no model, no project and no
branch, as Antigravity does not, leaves those columns empty rather than guessing
them from a tool argument.

**It never presents a guess as a record.** A file named by a `Write` call was
written down by the harness. A file read out of a redirection in a shell command
is an inference, since the command may have failed, and it is labelled *from a
command* wherever it appears. Both belong on screen, and merging them would not.

**It never truncates in silence.** A list that stops says how much is left, and
a session whose own file list hit the ceiling says so. A list of 30 rows under a
counter showing thousands is a lie told by omission, and it is the reason this
version exists.

## Permissions

Four, and what each one is for:

- **`dialog:open`**: shows you a folder picker and reads what you point it at.
  This is the one it always uses.
- **`model:infer`**: the session summary, and nothing else. Summaries are off by
  default, so this permission stays unused until you turn them on.
- **`vault:read`**: lists your vaults, so a save can name its destination. Used
  when you open a file, never before.
- **`vault:write`**: performs that save. Used only on a press, one file at a
  time.

## The summary, and what it costs

Opening a session offers a first-person summary, written by Mnemosyne as your
assistant. It is **off by default**, and it sends **only your own messages**,
about 1% of a transcript's bytes. The other 99% is tool output the model would
just be re-reading.

The prompt forbids inventing an outcome or claiming to have seen code, and the
interface says how many turns of how many were used rather than truncating in
silence.

There is an optional reading of the session's **tone**, off by default, riding
the same call. It describes *the session*, never you, has to point at what it
reads from, and is allowed to answer "not readable". A caveat sits under every
verdict, because a tone rendered as a fact is a fabricated measurement of a
human being.

## Keeping a draft

Open any file in the list and it shows you its content, where it came from, and
a vault to send it to. What gets written is the file's own text under a short
provenance header: the path, the agent, the session. Nothing is paraphrased, so
what you read on screen is what memory holds.

If the file is longer than what the host accepts, it is cut **and the cut is
stated**. A chronicle silently holding two thirds of a file is worse than one
that was never written, because you would go on trusting it.

Files you already kept carry a mark, with the vault in its tooltip, so choosing
what to keep is not a memory exercise.

## Privacy

- Ariadne never writes to, moves or deletes anything an agent wrote. The one
  thing it writes is a chronicle you asked it to write, into a vault you named.
- No network. No telemetry. No account. Nothing is uploaded anywhere.
- A connector **cannot** choose where to read. It says how to interpret a
  folder, and you designate the folder. A twin agent's folder can be *derived*
  from one you designated and offered to you, never adopted on its own.
- Preferences live in `localStorage`, on your machine.

⚠️ Transcripts contain everything that passed in front of your agent, including
secrets you pasted and source you may not want to share. Ariadne only displays
them locally, so be careful what you screenshot.

## What would help most

In rough order of usefulness, while this is in beta:

1. **Does your agent's folder open at all?** Press **+**, pick the agent,
   validate the folder the picker offers. If it finds nothing, say which agent
   and which version, and describe the empty screen.
2. **Is a column empty that should not be?** Model, project, branch, last
   action. An empty cell means the connector did not find the field, and the
   transcript shape has probably moved.
3. **Is a number wrong?** A session showing fewer files than it wrote, a count
   that disagrees with the list under it, a *last seen* that does not match.
   A fabricated number is the bug at the top of the list.
4. **Does the live-session warning fire when it should?** Two agents on one
   branch is the thing it exists for.
5. **Anything that says something untrue.** If a screen claims something the app
   did not do, that outranks severity.

Open an issue with what you did, what you expected, and what the screen said.

There are no screenshots in this README because the honest ones would be of the
author's own transcripts, which is exactly what the privacy note above says not
to publish.

## Which Ariadne is this?

The name is crowded. This is not [mirumee/ariadne](https://github.com/mirumee/ariadne),
the Python GraphQL library, nor [zesterer/ariadne](https://github.com/zesterer/ariadne),
the Rust diagnostics crate, nor the ROS exploration planner.

This Ariadne is a cartridge for **Mnemosyne OS**, a local-first memory operating
system: [mnemosyne-os.io](https://mnemosyne-os.io) ·
[mnemosyne-os.com](https://mnemosyne-os.com) ·
[docs.mnemosyne-os.io](https://docs.mnemosyne-os.io). It is named for the thread
that let someone walk back out of the labyrinth, which is roughly what a
transcript is.

## Layout

```
src/
  App.tsx                the shell: which agent is open, and what the panel shows
  hooks/
    useAgentScan.ts      the folder walk, its caches, and the poll timer
    useTwinCandidates.ts probing a derived twin folder, and offering it
  lib/                   pure modules, one test file each
    artifactRows.ts      every file the agents produced, as one browsable list
    writtenFiles.ts      a session's own files, in the order worth reading
    sessionNotes.ts      which notes belong to a session (two different claims)
    handEdits.ts         a recorded edit, against an inference from an mtime
    keep.ts              what one save writes, and which vaults it may target
    writable.ts          what the host will let a cartridge write back
    summarise.ts         what goes into a summary prompt, and what it forbids
    panelHistory.ts      back and forward, in a panel that links everywhere
    panelLabels.ts       what the panel is called, and each step of its history
    siblings.ts          deriving a twin's folder from one you designated
    markdown.tsx         note rendering, in the shell's own note language
    settings.ts          preferences, and the migration between their versions
    sources.ts           the agents this build can read
  views/                 the screens
docs/CONNECTORS.md       how to write a connector
dist/                    the built cartridge, committed on purpose, see below
```

The reader itself is not in here. Parsing a transcript, applying a connector,
walking a folder without crawling the disk, and recognising a file written by a
shell command all live in `@mnemosyne_os/agent-transcripts`, shared with the
transcript tools in Mnemosyne's MCP server so that the window and the command
line can never disagree about what a session is. The shipped connectors live
there too.

## Development

This repo is a **derived artifact**. It holds the source so it can be read, and
`dist/` so it can be installed. Installing a cartridge downloads this repo's
tarball and runs what is in `dist/`, so nothing is ever built on your machine.

```bash
pnpm dev          # port 5212
pnpm test         # 249 tests
pnpm typecheck    # types the tests too, which the build's tsc does not
pnpm lint
pnpm build
```

> [!NOTE]
> `pnpm install` will not resolve from a clone of this repo alone.
> Ariadne imports `@mnemosyne_os/agent-transcripts`, the package that also backs
> the transcript tools in Mnemosyne's MCP server, and that package is not
> published to npm yet. The source here is inspectable, and the build happens in
> the Mnemosyne OS monorepo.

## License

MIT. See [LICENSE](LICENSE).

## The mark

A clew: an Archimedean spiral wound from the centre outward. The thread leaves
it and becomes the trail of sessions you can follow back, with the events along
it marked in order. [`public/icon.svg`](public/icon.svg) is the one the app
uses, hermetic and drawn in `currentColor` so it takes the shell's theme.
[`docs/logo.svg`](docs/logo.svg) is the same mark with the colour written down,
for pages like this one that are rendered light and dark by the same file.
