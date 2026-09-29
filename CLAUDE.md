# ilovemd — Claude Code context

## What this product is

**ilovemd** is an AI-powered Markdown toolchain. It converts design-system component HTML to Markdown documentation, converts uploaded files (DOCX, PDF, PPTX) to Markdown, and lets users compare two Markdown files side by side with an AI chat panel.

It runs in one of two modes from the same codebase, controlled by `ILOVEMD_MODE`:

- **`local`** (default) — the original single-developer tool. Runs on `localhost:7777` only, no login wall, no cloud backend: all AI calls shell out to the **Claude CLI** (`claude -p`), reusing whatever OAuth session the user already has from `claude` in their terminal. Started by double-clicking `ilovemd.command` on macOS.
- **`public`** — a password-gated demo instance meant to be reachable from the internet (e.g. GoDaddy Node.js Hosting behind a custom domain). No CLI dependency: AI calls go straight to the Anthropic Messages API over HTTPS with a server-side `ANTHROPIC_API_KEY`. See **Public mode** below for the full picture — env vars, guardrails, what's different.

## Architecture

- **Runtime**: Node.js. Local mode is zero-dependency stdlib (`http`, `fs`, `child_process`, `path`, `crypto`, `zlib`). Public mode additionally uses two small npm packages (`mammoth`, `pdf-parse`) — see **Public mode**.
- **Server**: `server.mjs` — single file, ~2 000 lines. `PORT` and `HOST` are configurable via env vars; `HOST` defaults to `127.0.0.1` (loopback only) and only changes if explicitly set (e.g. by public hosting).
- **AI layer**: `runAI(prompt, req)` in `server.mjs` dispatches by `ILOVEMD_MODE`. In local mode it shells out to `claude -p "<prompt>"` (or via stdin for large prompts), trying multiple invocation strategies automatically — no Anthropic API key needed, since it piggybacks on the Claude Code OAuth session (an `ANTHROPIC_API_KEY` env var or `.anthropic-key` file can override this to redirect the *CLI's own* auth). In public mode it calls `runAIViaAPI()`, a direct HTTPS call to the Anthropic Messages API using `ANTHROPIC_API_KEY` — no CLI involved at all.
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
| `login.html` | Public-mode-only password gate page (`/login`) |
| `package.json` | Declares `mammoth`/`pdf-parse` (public-mode doc conversion only) and the `build`/`start` scripts GoDaddy Node.js Hosting requires |
| `.ilovemd-state.json` | Local runtime state: persists which design-system kit/folder the user last had open. **Gitignored.** |
| `.uploads/` | Temporary directory for file uploads (PDF, DOCX, etc.). **Gitignored.** |
| `documents/` | User's saved Markdown output files, organized in subdirectories per kit. **Gitignored.** |
| `workspace/` | Public-mode-only: confined root for component-kit folders uploaded via `/api/kit-upload`, replacing local mode's native folder picker. **Gitignored.** |

## Routes

| Route | Serves |
|---|---|
| `/` | `home.html` — tool homepage |
| `/text`, `/ui`, `/figma`, `/convert` | `shell.html` — main workspace |
| `/compare` | `compare.html` — file comparison |
| `/app` | `app.html` — legacy editor (redirects to `/text`) |
| `/login` | `login.html` — public-mode-only password gate |

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/state` | GET/PUT | Persist/restore last-used kit and folder path. `importDir` is confined under `workspace/` in public mode |
| `/api/kits` | GET | List available design-system kits from the configured folder |
| `/api/components` | GET | List components for a given kit |
| `/api/component` | GET | Get a single component's source details |
| `/api/component-doc` | POST | **AI call** — generate Markdown doc for a component |
| `/api/figma-doc` | POST | **AI call** — local mode: generate Markdown from a Figma URL via the CLI's own Figma MCP integration. Public mode: ignores any URL and always documents one fixed, server-configured Figma file via Figma's REST API (`FIGMA_TOKEN` + `ILOVEMD_DEMO_FIGMA_KEY`) — never a visitor-supplied design |
| `/api/frame` | POST | Save a Figma URL into the "recent frames" list (`.ilovemd-state.json`). Local mode only — despite the name, this does not extract anything via `osascript` |
| `/api/pick-folder` | POST | Open a native macOS folder picker (via `osascript`). Local mode only — `404` in public mode |
| `/api/kit-upload` | POST | Public-mode-only. Receives one file at a time (from a `webkitdirectory` picker) with `?kit=&relpath=`, reconstructing the folder tree under `workspace/<kit>/` — the public-mode replacement for `/api/pick-folder` |
| `/api/upload` | POST | Accept a file upload, save to `.uploads/`, extract text |
| `/api/convert` | POST | **AI call** — convert an uploaded file to Markdown. Local mode: DOCX/DOC/RTF/ODT via `textutil`, PDF handed to the CLI's own Read tool. Public mode: DOCX via `mammoth`, PDF via `pdf-parse` (both dynamically imported so local mode never needs them installed); DOC/RTF/RTFD/ODT are not supported in public mode. XLSX/PPTX extraction is a hand-rolled pure-JS ZIP+XML reader in both modes (no `unzip` shell-out) |
| `/api/save-out` | POST | Save a generated Markdown file to `documents/` |
| `/api/docs` | GET | List saved documents |
| `/api/doc` | GET/PUT/DELETE | Read, update, or delete a saved document |
| `/api/rename` | POST | Rename a saved document |
| `/api/ai` | POST | **AI call** — general "generate/improve Markdown" endpoint used by shell.html |
| `/api/compare-ai` | POST | **AI call** — compare two Markdown files; AI can return updated versions |
| `/api/setup` | GET | Report current AI strategy status, plus `mode` and (public mode) `figmaDemo` availability, for the frontend to adapt its UI |
| `/api/ai/diagnose` | GET | Test all AI invocation strategies and report which ones work (local mode only — meaningless in public mode) |
| `/api/login` | POST | Public-mode-only. Checks `{password}` against `ILOVEMD_GATE_PASSWORD`, sets a signed session cookie |
| `/api/logout` | POST | Public-mode-only. Clears the session cookie (the token itself remains valid until it expires — see **Public mode**) |

`/api/pick-file` (native macOS file picker) was removed entirely — it was dead code, unused by any page; the working upload pattern (`<input type=file>` + `/api/upload`) already covered its purpose.

## AI integration details (local mode)

`runAI(prompt, req)` dispatches to the direct-API path in public mode (see **Public mode**) or, in local mode, tries multiple CLI invocation strategies in priority order:

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

## Public mode

Set `ILOVEMD_MODE=public` to run the password-gated public deployment instead of the local single-developer tool. Everything below is inert in local mode.

**Required env vars** (the server refuses to start in public mode without the first two):
- `ILOVEMD_GATE_PASSWORD` — the one shared password protecting the whole site
- `ILOVEMD_SESSION_SECRET` — random secret used to HMAC-sign session cookies
- `ANTHROPIC_API_KEY` — used for direct Messages API calls (not the CLI)

**Optional env vars**:
- `HOST=0.0.0.0` — public hosting must set this explicitly; the default stays `127.0.0.1`
- `ILOVEMD_DATA_DIR` — root for `documents/`, `.uploads/`, `workspace/`, `.ilovemd-state.json`, `.anthropic-key` when they shouldn't live next to `server.mjs` (e.g. GoDaddy requires persistent writes under `/public/assets/`)
- `ILOVEMD_RATE_LIMIT_PER_HOUR` (default 20) and `ILOVEMD_MAX_CALLS_PER_DAY` (default 200) — in-memory, per-process courtesy limits on AI calls, checked inside `runAI()` before every call regardless of which route triggered it. These are **not** a substitute for a spending limit set on the Anthropic API key itself in the Anthropic console — a leaked password could still burn calls fast within the caps
- `FIGMA_TOKEN` + `ILOVEMD_DEMO_FIGMA_KEY` — enables the fixed Figma demo (see the `/api/figma-doc` row above)

**What's different from local mode**:
- AI calls go straight to `https://api.anthropic.com/v1/messages` (`runAIViaAPI()`), not the CLI
- Every route is behind the password gate except `/login` and `/api/login`; unauthenticated `/api/*` requests get `401`, unauthenticated pages redirect to `/login`
- Sessions are stateless signed cookies (7-day expiry) with no server-side revocation list — `/api/logout` clears the browser's cookie, but a copied cookie string stays valid until it expires. Acceptable for a single shared-password demo; would need a real session store to do better
- `realDir()` confines every `dir` a client can pass (`/api/kits`, `/api/components`, `/api/component`, `/api/component-doc`) to under `workspace/` — a client can never make the server read an arbitrary path on its own disk, unlike local mode where that's the entire point
- No native macOS pickers: `/api/pick-folder` is disabled, replaced by `/api/kit-upload` + a `webkitdirectory` file input in `shell.html`
- Figma import is a single fixed demo file the server operator configures, not a visitor-supplied URL — this is a deliberate choice so the public demo never pulls in a stranger's Figma design
- DOCX/PDF conversion uses `mammoth`/`pdf-parse` (the project's only two npm dependencies, dynamically imported so local mode's zero-dependency story is untouched); DOC/RTF/RTFD/ODT aren't supported publicly

## Development conventions

- Local mode: zero npm dependencies — if you need a library, inline it or implement it from scratch. Public mode's doc conversion is the one deliberate exception (`mammoth`, `pdf-parse`) — see **Public mode**
- No build step for the frontend — edit HTML/JS/CSS files directly
- Server restarts are needed after editing `server.mjs`; HTML/CSS/JS changes take effect on browser reload
- Local mode is loopback-only by design — `HOST` defaults to `127.0.0.1` and only public-mode hosting should ever set it otherwise
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
