# ilovemd

Anything to Markdown. A local converter and documentation workspace: describe something in plain English, or point it at your UI components' HTML/CSS, and Claude writes structured Markdown you can edit and download.

## Running it

**Double-click `ilovemd.command`** in this folder. It opens `http://127.0.0.1:7777`.

By hand, if you prefer:

```bash
cd ~/ilovemd
node server.mjs
```

Needs [Node.js](https://nodejs.org) (the LTS build). The launcher checks and tells you if it is missing.

Leave the Terminal window open while you use the app. Closing it stops the server.

## Pages

| URL | What it is |
| --- | --- |
| `/` | Homepage |
| `/text` | Text → MD |
| `/ui` | UI Component → MD |
| `/figma` | Figma → MD |

All three share one workspace layout: a Markdown editor and live preview (Edit / Split / Preview toggle, plus a Source tab on the UI page) and an AI assistant panel on the right, each as its own card. Nothing is written to the server - finished Markdown is downloaded through the browser. The assistant edits the document - its changes land in the editor with **Keep / Discard / Regenerate** - and can also answer questions about it. Below ~1200px wide the chat becomes a slide-over.

## Text → MD (`/text`)

Documents live in `~/ilovemd/documents/`, as ordinary `.md` files. Nothing is hidden in a database or in browser storage - what you see in the app is exactly what is on disk, and you can open the same files in any editor.

To keep them somewhere else:

```bash
ILOVEMD_DOCS=~/Documents/notes node server.mjs
```

With no document open, an instruction writes a new file (the filename comes from the document's own `# heading`). With one open, it revises the document, keeping everything you did not ask to change. Nothing is written to disk without you: results land in the editor with **Keep**, **Discard** and **Regenerate**. `Cmd+K` focuses the assistant, `Enter` sends, `Cmd+S` saves.

## UI Component → MD (`/ui`)

1. **Choose Component Folder** opens a real macOS folder picker (the server runs locally, so no browser file-permission dance). Point it at a folder holding your components.
2. Pick a component from the toolbar's dropdown. A component is either a subfolder (`Button/button.html` + `button.css`) or loose files sharing a basename (`button.html` + `button.css`).
3. Pick one to inspect its source (the **Source** view, with HTML/CSS tabs), then **Generate Documentation**. Claude analyzes the actual source - anatomy, variants, states, tokens - and never invents what the files can't support.
4. Review in Preview, refine through the assistant or in Edit, then **Download**. The file is saved by your browser; nothing is written server-side.

## Figma → MD (`/figma`)

Paste a link to a Figma frame or component and press **Generate Documentation**. Retrieval goes through the Figma desktop app's own local MCP server, so **keep Figma open** - no access token or admin approval is needed, because the app is already signed in. If it cannot be reached, ilovemd says so plainly rather than inventing data.

## Where saves go

Everything saves under `~/ilovemd/documents/`:

| Page | Saved as |
| --- | --- |
| Text → MD | `documents/<Title>.md` |
| UI Component → MD | `documents/<Design System>/<Component>.md` |
| Figma → MD | `documents/<Title>.md` |

The chosen component folder, design system and recent frames are remembered across restarts in `.ilovemd-state.json`.

## No API key

Generation shells out to the **Claude Code CLI**, so there is no API key in this folder, in the browser, or in `localStorage`. It reuses whatever auth `claude` already has on this Mac.

Which invocation form the CLI wants varies by version, and two things vary independently: how the prompt is delivered (trailing argument or piped on stdin) and which flags are accepted (the full set or nothing but `-p`). All four combinations are tried on the first request and the one that answers is kept.

**Writing, editing and saving never depend on Claude.** If generation is off, everything else still works.

### If generation is not working

**Double-click `fix-ai.command`.** It finds the CLI wherever it is installed, sends a real test prompt, and tells you in plain language what is wrong. If the CLI needs signing in it opens a session for you, waits while you sign in, re-tests, and offers to start the app.

That test matters because `claude --version` succeeds even when signed out. Only sending an actual prompt proves anything.

### Using an API key instead of the CLI sign-in

If the CLI's sign-in is revoked and your organisation will not let you sign in again, a key bypasses OAuth entirely. Put it in a file next to `server.mjs`:

```bash
cd ~/ilovemd
echo 'sk-ant-your-key-here' > .anthropic-key
```

Restart the server. The key is read once at startup, passed only to the CLI as an environment variable, and never sent to the browser or included in any API response. Delete the file to go back to the CLI's own sign-in.

Environment overrides: `PORT`, `ILOVEMD_DOCS`, `ILOVEMD_AI_CMD`, `ILOVEMD_AI_MODEL` (e.g. `opus`), `ILOVEMD_AI_TIMEOUT`, `ILOVEMD_AI_STRATEGY` (pins one form: `argv`, `bare-argv`, `stdin`, `bare-stdin`).

## Safety notes

* The server binds to **127.0.0.1 only**. Nothing here is reachable from the network.
* Document names are confined to safe filenames. A name containing a path separator, a leading dot, or an extension other than `.md` is refused rather than quietly rewritten.
* Saves write to a temp file and rename, so an interrupted write cannot destroy a good document.
* Component files are read locally and only sent to Claude when you press **Generate Documentation**.
* The AI call runs with the CLI's tools disabled. It writes documents; it does not touch your files.

## Files

```
ilovemd/
  ilovemd.command       # double-click: starts the server, opens the homepage
  fix-ai.command    # double-click: diagnoses and fixes the Claude CLI hookup
  server.mjs        # static files + document API + component scan + the AI routes
  home.html         # the homepage
  shell.html        # the workspace: /text, /ui and /figma share this one page
  README.md
  documents/        # your .md files (Text → MD)
  .ilovemd-state.json   # remembered folders + recent frames (created on first use)
```

No dependencies, no build step, no `node_modules`. `server.mjs` uses only the Node standard library.
