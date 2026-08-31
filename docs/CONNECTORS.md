# Writing a connector

A connector teaches Ariadne to read one agent. It is a **JSON file**, never
code, and that is the whole design.

## Why data and not code

People will share connectors. A connector written in JavaScript, inside an app
that reads your entire working history, is arbitrary code execution wearing a
config file's clothes. In data, the worst a hostile connector can do is
mislabel a field.

Two rules follow from that, and neither is negotiable:

**A connector never says WHERE to read.** It says how to interpret what is
inside a folder. You designate the folder. A connector that could choose its
own path would point at `~/.ssh` and the interface would happily display it.
`folderHint` only decides where the picker *opens*; a human still confirms.

**No regular expressions.** Text extraction uses literal markers. A pathological
pattern in a file a stranger shipped would hang the reader on someone else's
machine.

Because it is data, the app can state exactly what a connector will read
*before* you point it anywhere. The consent list on the first screen is
computed from the file, not written by its author.

## The three files

Ship these together, so "repair this connector" is a closed task for a human or
an agent rather than a guess:

```
connectors/
  myagent.json            the declaration
  myagent.fixture.jsonl   a redacted sample of the real format
  myagent.expected.json   what the declaration must produce  → the red test
```

Without a fixture, whoever repairs it is working blind. And you already have
one: it is on your disk.

⚠️ **Redact the fixture.** It comes from a real session.

## Paths

A dot descends into an object. A trailing `[]` says the value is an array to
walk. Nothing else is supported, on purpose.

```
"timestamp"            → o.timestamp
"message.model"        → o.message.model
"message.content[]"    → each entry of o.message.content
```

A field your agent does not have, you **omit**. An empty column is honest; an
invented mapping is not. The interpreter treats an absent path as absent.

## A session connector

```jsonc
{
  "id": "myagent",
  "displayName": "My Agent",
  "version": "1.0.0",
  "format": "jsonl",          // one JSON object per line
  "kind": "session",

  "mark": { "label": "MA", "tint": "#4285f4", "svg": "" },

  "folderHint": ".myagent/sessions",   // HOME-RELATIVE, never absolute
  "filePattern": ".jsonl",

  // Only if the transcripts are buried below the session directory.
  // A FIXED sub-path, never a crawl: one listing per session.
  // `idFrom: "dir"` when no line carries a session id: the directory name is it.
  "tree": { "subPath": ".logs", "idFrom": "dir" },

  "fields": {
    "timestamp": "created_at",     // required: nothing sorts without it
    "sessionId": "session_id",     // or use tree.idFrom
    "model": "message.model",
    "projectPath": "cwd",
    "branch": "gitBranch",
    "isSidechain": "isSidechain"
  },

  // The conversation's own name, on whatever line kind carries it.
  // The walk runs BACKWARDS, so the first hit is the most recent, so a renamed
  // conversation shows its new name.
  "title": { "where": { "type": "custom-title" }, "take": "customTitle" },

  // The last tool called. `where` matches the ARRAY ENTRIES, not the line.
  "action": { "path": "message.content[]", "where": { "type": "tool_use" }, "take": "name" },

  // Files the agent wrote.
  "artifact": {
    "path": "message.content[]",
    "where": { "type": "tool_use" },
    "tools": ["Edit", "Write"],
    "take": "input.file_path"
  },

  // What the PERSON typed. Getting this wrong is the expensive mistake:
  // tool output is ~99% of the bytes, and mistaking it for speech poisons
  // every summary.
  "humanTurn": {
    "where": { "type": "user" },
    "notWhen": { "path": "message.content[]", "has": "tool_result" },
    "text": "message.content",
    "between": { "start": "<REQ>", "end": "</REQ>" }   // optional, literal
  }
}
```

### The traps, in the order they bite

1. **`action.where` tests array ENTRIES, not the line.** If the entries carry no
   `type`, use `"where": {}` and rely on `path`.
2. **The walk runs backwards.** Mapping `title` to the first user message gives
   you the *last* one. If the agent has no title, declare none. The interface
   falls back to an excerpt of the first message, rendered dimmed so it is never
   mistaken for a real name.
3. **The last line is often truncated.** The file is appended to while it is
   read. The interpreter drops a half-written line; that is not format drift.
4. **`between` with a missing closing marker returns the RAW text**, never a
   fragment that would look deliberate.

## A document connector

```jsonc
{
  "id": "myagent-notes",
  "displayName": "My Agent documents",
  "format": "markdown",
  "kind": "document",
  "filePattern": ".md",

  // Where the documents sit relative to a session directory.
  // "" means the session directory itself.
  "tree": { "subPath": "memory" },

  "fields": {},

  // Either frontmatter…
  "frontmatter": { "name": "name", "description": "description", "type": "metadata.type" },

  // …or a neighbouring file, when the metadata lives beside the document.
  // Costs one extra read per document.
  "sidecar": { "suffix": ".metadata.json", "fields": { "description": "summary" } }
}
```

Frontmatter is parsed shallowly: `key: value`, one level of nesting addressed as
`parent.child`. It is not YAML and does not try to be.

## Registering it

One line in `src/lib/sources.ts`:

```ts
{ id: 'myagent', sessions: myagent as Connector, notes: myagentNotes as Connector }
```

An agent with **no working connector gets no entry**. A card that cannot open is
a promise the app cannot keep.

## Before opening a pull request

```bash
pnpm test    # shipped.test.ts validates every connector in SOURCES
pnpm lint
```

`shipped.test.ts` checks what a broken connector would otherwise only show as
"the app is a bit odd": that it declares a timestamp, that its session id comes
from somewhere real, that it can tell a human turn from tool output, and that
its `folderHint` is not an absolute path.
