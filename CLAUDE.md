# ilovemd — Claude Code context

## What this product is

**ilovemd** is a local AI-powered Markdown toolchain that runs entirely on `localhost:7777`. It converts design-system component HTML to Markdown documentation, converts uploaded files (DOCX, PDF, PPTX) to Markdown, and lets users compare two Markdown files side by side with an AI chat panel. There is no cloud backend — all AI calls go through the **Claude CLI** (`claude -p`), reusing whatever OAuth session the user already has from `claude` in their terminal.

The product is a single-developer tool, not a SaaS product. It is started by double-clicking `ilovemd.command` on macOS, which opens a Terminal, starts the Node server, and opens the browser.

## Architecture

- **Runtime**: Node.js, zero npm dependencies — pure stdlib `http`, `fs`, `child_process`, `path`, `crypto`.
- **Server**: `server.mjs` — single file, ~1 700 lines. Starts on `127.0.0.1:7777` (loopback only, never exposed externally). `PORT` and `HOST` are configurable via env vars.
- **AI layer**: `runAI(prompt)` in `server.mjs` shells out to `claude -p "<prompt>"` (or via stdin for large prompts). It tries multiple invocation strategies automatically (short/full prompt, pipe vs arg). No Anthropic API key is needed because it piggybacks on the Claude Code OAuth session. An `ANTHROPIC_API_KEY` env var or a `.anthropic-key` file in the project root can override this for direct API access.
- **Frontend**: plain HTML/CSS/JS files served statically by `server.mjs`. No build step, no bundler.

## Key files

| File | Purpose |
|---|---|
| `server.mjs` | Entire backend — HTTP server, all API routes, AI shell-out, file I/O |
| `shell.html` | Main workspace UI — HTML→MD converter for design-system components (the `/text`, `/ui`, `/figma` route) |
| `home.html` | Homepage — grid of tool cards linking to each feature |
| `compare.html` | Side-by-side Markdown diff page with AI chat panel |
| `app.html` | **Legacy** single-page editor, superseded by `shell.html`. Can be deleted. |
| `ilovemd.command` | macOS double-click launcher — starts the server in a Terminal window |
| `fix-ai.command` | Helper script the user runs if the AI stops working (re-runs `claude /login`) |
| `.claude/launch.json` | Claude Code dev-server config — tells Claude Code how to start the server for the Browser panel |
| `.ilovemd-state.json` | Local runtime state: persists which design-system kit/folder the user last had open. **Gitignored.** |
| `.uploads/` | Temporary directory for file uploads (PDF, DOCX, etc.). **Gitignored.** |
| `documents/` | User's saved Markdown output files, organized in subdirectories per kit. **Gitignored.** |

## Routes

| Route | Serves |
|---|---|
| `/` | `home.html` — tool homepage |
| `/text`, `/ui`, `/figma`, `/convert` | `shell.html` — main workspace |
| `/compare` | `compare.html` — file comparison |
| `/app` | `app.html` — legacy editor (redirects to `/text`) |

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/state` | GET/PUT | Persist/restore last-used kit and folder path |
| `/api/kits` | GET | List available design-system kits from the configured folder |
| `/api/components` | GET | List components for a given kit |
| `/api/component` | GET | Get a single component's source details |
| `/api/component-doc` | POST | **AI call** — generate Markdown doc for a component |
| `/api/figma-doc` | POST | **AI call** — generate Markdown from a Figma screenshot |
| `/api/frame` | POST | Extract component HTML from an iframe via `osascript` |
| `/api/pick-file` | POST | Open a native macOS file picker (via `osascript`) |
| `/api/pick-folder` | POST | Open a native macOS folder picker (via `osascript`) |
| `/api/upload` | POST | Accept a file upload, save to `.uploads/`, extract text |
| `/api/convert` | POST | **AI call** — convert an uploaded file (DOCX/PDF/PPTX) to Markdown |
| `/api/save-out` | POST | Save a generated Markdown file to `documents/` |
| `/api/docs` | GET | List saved documents |
| `/api/doc` | GET/PUT/DELETE | Read, update, or delete a saved document |
| `/api/rename` | POST | Rename a saved document |
| `/api/ai` | POST | **AI call** — general "generate/improve Markdown" endpoint used by shell.html |
| `/api/compare-ai` | POST | **AI call** — compare two Markdown files; AI can return updated versions |
| `/api/setup` | GET | Report current AI strategy status (for debugging) |
| `/api/ai/diagnose` | GET | Test all AI invocation strategies and report which ones work |

## AI integration details

`runAI(prompt)` in `server.mjs` tries multiple strategies in priority order:

1. **Pinned winner** — whichever strategy succeeded last time is tried first
2. **Stdin delivery** — `echo "prompt" | claude -p -` (works for long prompts)
3. **Arg delivery** — `claude -p "prompt"` (direct)
4. **Full non-interactive flag** — adds `--full` flag variant

If the Claude CLI is not on `PATH` (e.g. GUI launch), `server.mjs` searches several known install locations (`~/.claude/local/claude`, `~/.local/bin/claude`, etc.) and uses `ILOVEMD_AI_CMD` env var as a fallback override.

**If AI returns 502 or errors**: the Claude CLI session has expired. User must open Terminal, run `claude`, type `/login`, authenticate, then reload. `fix-ai.command` automates this.

## Design-system component workflow (`shell.html`)

1. User picks a design-system kit folder (a local clone of the component library)
2. `server.mjs` scans the folder for component files (`/api/components`)
3. User selects a component from the sidebar
4. Shell.html renders the component in an iframe and captures its HTML
5. AI generates Markdown documentation from the HTML + metadata
6. User can edit the Markdown and save it to `documents/`

The "← Change component" back button in the component detail card calls `paintSidebar(); paintTop(); paintEditor()` — not a function called `paint()`.

## Compare page (`compare.html`)

- Two auto-expanding textareas (no internal scroll — `autoResize(ta)` sets `ta.style.height` dynamically)
- Client-side LCS diff (no external library) — produces unified and side-by-side views
- AI chat panel is `position: fixed` (overlay, doesn't affect flex layout)
- Main area shifts via `.main.chat-open { margin-right: 320px }` when chat opens
- `/api/compare-ai` accepts `{instruction, a, b, nameA, nameB}`; AI wraps updated files in ` ```UPDATED_A ` / ` ```UPDATED_B ` fenced blocks; server extracts them with regex

## Development conventions

- No npm dependencies — if you need a library, inline it or implement it from scratch
- No build step — edit HTML/JS/CSS files directly
- Server restarts are needed after editing `server.mjs`; HTML/CSS/JS changes take effect on browser reload
- The server is loopback-only by design — do not change `HOST = '127.0.0.1'` without the user's explicit intent
- `.claude/launch.json` is committed — it lets Claude Code start the dev server with the Browser panel

## Git workflow

This repo's remote is a **personal GitHub account** — never push from the official/work Claude session.

- Official Claude session: edit files, commit locally (`git add -A && git commit -m "..."`)
- Personal Claude session (or Terminal): review changes and `git push`

## Starting the server manually

```
node server.mjs
# or on a different port:
PORT=7788 node server.mjs
```

Or double-click `ilovemd.command` from Finder.
