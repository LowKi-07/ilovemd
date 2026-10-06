# ilovemd — Claude Code context

## What this product is

**ilovemd** is an AI-powered Markdown toolchain. It converts design-system component HTML to Markdown documentation, converts uploaded files (DOCX, PDF, PPTX) to Markdown, and lets users compare two Markdown files side by side with an AI chat panel.

It runs in one of two modes from the same codebase, controlled by `ILOVEMD_MODE`:

- **`local`** (default) — the original single-developer tool. Runs on `localhost:7777` only, no login wall, no cloud backend: all AI calls shell out to the **Claude CLI** (`claude -p`), reusing whatever OAuth session the user already has from `claude` in their terminal. Started by double-clicking `ilovemd.command` on macOS.
- **`public`** — the internet-facing instance, open to everyone by default (optional shared password), with per-visitor private storage (Render or GoDaddy cPanel hosting behind a custom domain — see `DEPLOY.md`). No CLI dependency: AI calls go straight to a vendor HTTPS API (Gemini by default) with a server-side key. See **Public mode** below for the full picture — env vars, guardrails, what's different.

## Architecture

- **Runtime**: Node.js. Local mode is zero-dependency stdlib (`http`, `fs`, `child_process`, `path`, `crypto`, `zlib`). Public mode additionally uses two small npm packages (`mammoth`, `pdf-parse`) — see **Public mode**.
- **Server**: `server.mjs` — single file, ~2 000 lines. `PORT` and `HOST` are configurable via env vars; `HOST` defaults to `127.0.0.1` (loopback only) and only changes if explicitly set (e.g. by public hosting).
- **AI layer**: all vendor-specific code lives in `ai/` behind one provider interface (`check`, `generate`, `explain`, `diagnose`, `describe`, `capabilities`) — documented at the top of `ai/index.mjs`. `server.mjs` only calls `createAIService()` once and then `ai.*`; `runAI(prompt, req)` applies public-mode rate limits and calls `ai.generate()`. `ILOVEMD_AI_PROVIDER` picks the backend: `claude-cli` (local-mode default — shells out to `claude -p`, piggybacking on the Claude Code OAuth session), `gemini`, `grok`, `openai`, `anthropic`. Unset in public mode, the first API key present wins (Gemini, Grok, OpenAI, Anthropic). `capabilities.readsLocalFiles` / `mcpTools` are true only for `claude-cli`: other providers get PDFs via `pdf-parse` and skip the CLI-MCP Figma fallback. **Add a vendor by adding a provider file, never by branching on vendor in `server.mjs`.**
- **Frontend**: plain HTML/CSS/JS files served statically by `server.mjs`. No build step, no bundler.

## Key files

| File | Purpose |
|---|---|
| `server.mjs` | Entire backend — HTTP server, all API routes, file I/O. Gets AI only through `ai/` |
| `ai/index.mjs` | `createAIService()` — provider interface docs and provider selection |
| `ai/providers/*.mjs` | One file per backend: `claude-cli`, `anthropic`, `gemini`, `openai-compatible` (Grok + OpenAI). `ai/shared.mjs` has the HTTP/error helpers |
| `app.cjs` | CommonJS startup shim for require()-based hosts (cPanel / Passenger) — just `import('./server.mjs')` |
| `DEPLOY.md`, `render.yaml`, `.env.example` | Public deployment guide (Render + GoDaddy DNS, or GoDaddy cPanel), Render blueprint, and every env var |
| `shell.html` | Main workspace UI — HTML→MD converter for design-system components (the `/text`, `/ui`, `/figma` route) |
| `home.html` | Homepage — hero, filter pills and the grid of tool cards |
| `hand-ai.webp`, `hand-human.webp` | Homepage bridge-section renders, cropped and compressed from the Meshy PNG sources. Placement in `.tc-hand--*` assumes these exact crops (index fingertips meet at stage point 600,200) - re-derive the percentages if they change |
| `favicon.svg` | Browser-tab icon: the logo's red heart on its own. Linked from every page's `<head>` and also served for `/favicon.ico` |
| `nav.css`, `nav.js` | The site nav bar, shared by `home.html`, `shell.html`, `compare.html` and `templates.html`. One menu dropdown (Profile, About…, Log Out when gated via `window.ilovemdNav.showLogout(fn)`); at ≤940px the header links move into it, the tool lists copied from the desktop dropdowns. Injected into `<div id="site-nav"></div>` by `nav.js`; self-contained (its own `--nv-*` tokens) because the pages' own design tokens differ. Edit here, not per page |
| `templates.html` | Templates page (`/templates`): search, category pills, cards and a preview dialog (rendered/raw, Copy, Download, Use template → `/text?template=<slug>`) |
| `templates/` | The template `.md` files the templates page lists - one file per template, file name = slug. Optional front matter (`title`, `description`, `category`, `icon`, `tags`, `order`) feeds the cards and is stripped from what visitors copy. `ILOVEMD_TEMPLATES_DIR` overrides the folder |
| `mdcheck.js` | The CommonMark output check (`globalThis.ilovemdCheck.check(markdownIt, src)` / `.fix(src)`), shared by the server and the editor. Parses with markdown-it and flags what breaks a document: unclosed fence, uneven table rows, empty (errors); no/multiple `#` titles, skipped heading levels, raw HTML, chat preamble (warnings). `fix` closes an unclosed fence. Every string is valid CommonMark, so this is a structure check, not a validity test |
| `md.js` | The shared Markdown renderer (`window.ilovemdMarkdown`), used by `shell.html` and `templates.html`. Escapes first, so its output is innerHTML-safe |
| `compare.html` | Side-by-side Markdown diff page with AI chat panel |
| `app.html` | **Legacy** single-page editor, superseded by `shell.html`. Can be deleted. |
| `ilovemd.command` | macOS double-click launcher — starts the server in a Terminal window |
| `fix-ai.command` | Helper script the user runs if the AI stops working (re-runs `claude /login`) |
| `.claude/launch.json` | Claude Code dev-server config — tells Claude Code how to start the server for the Browser panel |
| `.claude/settings.json` | Project-level Claude Code permissions (grants the Figma MCP tools). Committed |
| `login.html` | Public-mode password gate page (`/login`) — only used when `ILOVEMD_GATE_PASSWORD` is set |
| `platform/` | Public-mode infrastructure: `identity.mjs` (anonymous visitor id cookie), `userdata.mjs` (per-visitor folders + idle sweep), `limits.mjs` (rate limiter + concurrency cap) |
| `package.json` | Declares `mammoth`/`pdf-parse` (public-mode doc conversion only) and `markdown-it` (the output check) and the `build`/`start` scripts GoDaddy Node.js Hosting requires |
| `.ilovemd-state.json` | Local runtime state: persists which design-system kit/folder the user last had open. **Gitignored.** |
| `.uploads/` | Temporary directory for file uploads (PDF, DOCX, etc.). **Gitignored.** |
| `documents/` | User's saved Markdown output files, organized in subdirectories per kit. **Gitignored.** |
| `users/` | Public-mode-only: one folder per visitor (`users/<id>/documents`, `workspace`, `uploads`, `state.json`) under `ILOVEMD_DATA_DIR`. **Gitignored.** |

## Routes

| Route | Serves |
|---|---|
| `/` | `home.html` — tool homepage |
| `/text`, `/ui`, `/figma`, `/convert` | `shell.html` — main workspace |
| `/compare` | `compare.html` — file comparison |
| `/templates` | `templates.html` — template gallery (`?q=`, `?category=`, `?t=<slug>` opens a preview) |
| `/app` | `app.html` — legacy editor (redirects to `/text`) |
| `/login` | `login.html` — public-mode password gate (redirects to `/` when no password is set) |
| `/healthz` | `{ok}` for host health checks — never gated |

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/templates` | GET | List the templates in `templates/` (card fields only, no body) |
| `/api/template` | GET | `?slug=` → `{slug, title, markdown}` with front matter stripped. Text mode loads it when opened as `/text?template=<slug>` |
| `/api/state` | GET/PUT | Persist/restore last-used kit and folder path. `importDir` is confined to the visitor's own `workspace/` in public mode |
| `/api/kits` | GET | List available design-system kits from the configured folder |
| `/api/components` | GET | List components for a given kit |
| `/api/component` | GET | Get a single component's source details |
| `/api/component-doc` | POST | **AI call** — generate Markdown doc for a component |
| `/api/figma-doc` | POST | **AI call** — local mode: retrieves the frame from the **Figma desktop app's own MCP server** on `127.0.0.1:3845` (see **Figma retrieval** below), then has the model write the doc. Falls back to the CLI's Figma MCP if that server is unreachable. Public mode: Figma's REST API with the **visitor's own** personal access token, sent as `{url, token}` and used for that one request — never stored or logged (the page keeps it in tab memory only). A `?node-id=` link fetches that frame (`/nodes`, depth 6: properties, variants, layout, text); a bare file link fetches pages and top frames. With no url/token, falls back to the optional fixed demo file (`FIGMA_TOKEN` + `ILOVEMD_DEMO_FIGMA_KEY`). Never use the server's own token for a visitor-supplied link — it would expose every file the owner's account can see |
| `/api/frame` | POST | Save a Figma URL into the "recent frames" list (`.ilovemd-state.json`). Local mode only — despite the name, this does not extract anything via `osascript` |
| `/api/pick-folder` | POST | Open a native macOS folder picker (via `osascript`). Local mode only — `404` in public mode |
| `/api/kit-upload` | POST | Public-mode-only. Receives one file at a time (from a `webkitdirectory` picker) with `?kit=&relpath=`, reconstructing the folder tree under the visitor's `workspace/<kit>/` — the public-mode replacement for `/api/pick-folder` |
| `/api/upload` | POST | Accept a file upload (documents, and PNG/JPG/WebP/GIF photos up to 10 MB), save to the visitor's uploads folder |
| `/api/convert` | POST | **AI call** — convert an uploaded file to Markdown. Local mode: DOCX/DOC/RTF/ODT via `textutil`, PDF handed to the CLI's own Read tool. Public mode: DOCX via `mammoth`, PDF via `pdf-parse` (both dynamically imported so local mode never needs them installed); DOC/RTF/RTFD/ODT are not supported in public mode. XLSX/PPTX extraction is a hand-rolled pure-JS ZIP+XML reader in both modes (no `unzip` shell-out) |
| `/api/save-out` | POST | Save a generated Markdown file to `documents/`. **No longer called by the frontend** — the UI downloads through the browser instead. Route kept, and `/api/docs` still reads whatever is already in `documents/` |
| `/api/docs` | GET | List saved documents |
| `/api/doc` | GET/PUT/DELETE | Read, update, or delete a saved document |
| `/api/rename` | POST | Rename a saved document |
| `/api/ai` | POST | **AI call** — general "generate/improve Markdown" endpoint used by shell.html. Optional `attachments` (≤5 paths from `/api/upload`, confined to the visitor's uploads): documents are extracted to text context, photos go to the provider as images when `ai.capabilities.images` (Text → MD's **+ Add** pill) |
| `/api/compare-ai` | POST | **AI call** — compare two Markdown files; AI can return updated versions |
| `/api/setup` | GET | Report AI provider status, plus `mode`, `gate` and (public mode) `figmaDemo` availability, for the frontend to adapt its UI |
| `/api/ai/diagnose` | GET | Probe the active provider (for `claude-cli`, every invocation strategy) and report what works. `404` in public mode, since probes cost money |
| `/api/login` | POST | Public mode with a gate password only. Checks `{password}` against `ILOVEMD_GATE_PASSWORD`, sets a signed session cookie |
| `/api/logout` | POST | Public-mode-only. Clears the session cookie (the token itself remains valid until it expires — see **Public mode**) |

`/api/pick-file` (native macOS file picker) was removed entirely — it was dead code, unused by any page; the working upload pattern (`<input type=file>` + `/api/upload`) already covered its purpose.

## AI integration details (local mode)

With `ILOVEMD_AI_PROVIDER` unset (or `claude-cli`), `ai/providers/claude-cli.mjs` tries multiple CLI invocation strategies in priority order:

1. **Pinned winner** — whichever strategy succeeded last time is tried first
2. **Stdin delivery** — `echo "prompt" | claude -p -` (works for long prompts)
3. **Arg delivery** — `claude -p "prompt"` (direct)
4. **Full non-interactive flag** — adds `--full` flag variant

If the Claude CLI is not on `PATH` (e.g. GUI launch), `server.mjs` searches several known install locations (`~/.claude/local/claude`, `~/.local/bin/claude`, etc.) and uses `ILOVEMD_AI_CMD` env var as a fallback override.

**If AI returns 502 or errors**: the Claude CLI session has expired. User must open Terminal, run `claude`, type `/login`, authenticate, then reload. `fix-ai.command` automates this.

## Figma retrieval (local mode)

`/api/figma-doc` talks to the **Figma desktop app's Dev Mode MCP server** over plain
HTTP on `127.0.0.1:3845` (override with `ILOVEMD_FIGMA_MCP_URL`). `fetchFigmaViaLocalMcp()`
in `server.mjs` speaks MCP streamable-HTTP directly: `initialize` →
`notifications/initialized` → `tools/call`, with the session id echoed back in an
`mcp-session-id` header and replies parsed out of SSE framing.

Why not the CLI's Figma MCP: a spawned `claude -p` reconnects to the *cloud* Figma
connector on every call, and an organization can block those tools pending admin
approval — which a non-admin cannot then unblock. The local server needs no approval
and no personal access token, because the desktop app is already signed in.

It calls `get_metadata` (structure) and `get_variable_defs` (bound tokens), **not**
`get_design_context` — that one returns full generated code and did not finish on a
real component tree.

**Requires the Figma desktop app to be running** with its local MCP server enabled.
When it is not, the route falls back to the CLI path and the error message says to
open Figma.

## Design-system component workflow (`shell.html`)

1. User picks a design-system kit folder (a local clone of the component library)
2. `server.mjs` scans the folder for component files (`/api/components`)
3. User selects a component from the sidebar
4. Shell.html renders the component in an iframe and captures its HTML
5. AI generates Markdown documentation from the HTML + metadata
6. User can edit the Markdown and save it to `documents/`

The "← Change component" back button in the component detail card calls `paintSidebar(); paintTop(); paintEditor()` — not a function called `paint()`.

**"See how it works" demo kit**: the landing card (and sidebar import box) offers a demo for visitors without a component folder. `startDemo()` sets `S.demo` and loads the `DEMO` object in `shell.html`: three sample components (Button, Accordion, Text field) with pre-written docs in the `/api/component-doc` section shape, plus clarifying questions. Each question names the heading its answer patches (`sec`) and the line(s) each option adds (`add`). `generate()` and `applyAnswers()` branch to `demoGenerate()` / `demoApply()` — no server call, no AI, nothing persisted to `/api/state`. Choosing a real folder calls `leaveDemo()`. The free-form assistant chips still call the real AI on the demo doc.

## Compare page (`compare.html`)

- Two auto-expanding textareas (no internal scroll — `autoResize(ta)` sets `ta.style.height` dynamically)
- Client-side LCS diff (no external library) — produces unified and side-by-side views
- AI chat panel is `position: fixed` (overlay, doesn't affect flex layout)
- Main area shifts via `.main.chat-open { margin-right: 320px }` when chat opens
- `/api/compare-ai` accepts `{instruction, a, b, nameA, nameB}`; AI wraps updated files in ` ```UPDATED_A ` / ` ```UPDATED_B ` fenced blocks; server extracts them with regex

## Public mode

Set `ILOVEMD_MODE=public` to run the internet-facing deployment instead of the local single-developer tool. It is **open to everyone by default**; a shared password is optional. Everything below is inert in local mode. Deployment steps and the scaling path: `DEPLOY.md`.

**Required env vars**:
- `ILOVEMD_SESSION_SECRET` (16+ chars; the server refuses to start without it) — HMAC-signs the anonymous visitor cookie, and login cookies when the gate is on
- One AI key: `GEMINI_API_KEY` (default), `XAI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` — optionally with `ILOVEMD_AI_PROVIDER` to choose explicitly and `ILOVEMD_AI_MODEL` to override the provider's default model

**Optional env vars** (all listed with defaults in `.env.example`; numeric ones go through `numEnv()`, which refuses to start on a non-number rather than letting `NaN` switch a limit off):
- `ILOVEMD_GATE_PASSWORD` — set it to put the whole site behind one shared password
- `HOST=0.0.0.0` — public hosting must set this explicitly; the default stays `127.0.0.1`
- `ILOVEMD_DATA_DIR` — root for `users/` (and, in local mode, `documents/`, `.anthropic-key`). Point it at a persistent disk (Render: `/var/data`)
- `ILOVEMD_USER_DATA_DAYS` (30) — visitor folders with no write activity this long are swept every 6 hours
- AI limits, checked in `runAI()` before every call whichever route asked: `ILOVEMD_RATE_LIMIT_PER_HOUR` (20, per visitor), `ILOVEMD_IP_RATE_LIMIT_PER_HOUR` (3x that, per address), `ILOVEMD_MAX_CALLS_PER_DAY` (200, site-wide, UTC day), `ILOVEMD_MAX_CONCURRENT_AI` (8 in flight; extra calls get an immediate "busy", never a queue). Upload limits: `ILOVEMD_UPLOADS_PER_HOUR` (60), `ILOVEMD_KIT_FILES_PER_HOUR` (3000). All in-memory per process — **not** a substitute for a budget cap on the AI key
- `ILOVEMD_TRUSTED_PROXIES` (1) — how many proxies append to `X-Forwarded-For`; `clientIp()` reads that many hops from the right, because left-hand entries are client-supplied
- `ILOVEMD_FIGMA_MCP_URL` — override the local Figma MCP endpoint (default `http://127.0.0.1:3845/mcp`)
- `FIGMA_TOKEN` + `ILOVEMD_DEMO_FIGMA_KEY` — optional fixed Figma demo file, offered as "Or try the demo file" next to the visitor-token form

**Per-visitor isolation** (the part to keep intact when changing routes):
- `platform/identity.mjs` gives every visitor a random id in a signed `ilovemd_vid` cookie (1 year). Real accounts later = `identify()` returning a user id; nothing downstream changes
- `platform/userdata.mjs` maps an id to `<data>/users/<id>/{documents,workspace,uploads,state.json}`
- The HTTP handler runs each public request inside `requestScope` (`AsyncLocalStorage`). File helpers call `space()` for the current visitor's paths and `visitor()` for their id — **never use a module-level path for per-user data**; local mode's `space()` returns the original paths next to `server.mjs`
- `/api/convert` accepts only paths inside the visitor's own `uploads/`; `realDir()` confines every client `dir` to the visitor's own `workspace/`
- `/api/setup` reports `gate` (whether a password is required — the pages show Sign out only then) and hides server paths

**What's different from local mode**:
- AI calls go straight to the chosen vendor's HTTPS API, never the CLI (`claude-cli` is refused at startup in public mode)
- With a gate password: every route except `/login`, `/api/login` and `/healthz` needs the session cookie (`401` for `/api/*`, redirect for pages). Sessions are stateless signed cookies (7-day expiry) with no revocation list — rotating `ILOVEMD_SESSION_SECRET` ends them all (and also resets every visitor id). Without a gate, `/login` redirects to `/`
- `/healthz` — unauthenticated, no disk; for the host's health check
- SIGTERM/SIGINT close the server gracefully (in-flight AI calls get up to 25 s)
- No native macOS pickers: `/api/pick-folder` is disabled, replaced by `/api/kit-upload` + a `webkitdirectory` file input in `shell.html`
- Figma import uses the visitor's own Figma token (see the `/api/figma-doc` row), so nobody can document a file their own account can't open; the operator's token is only ever used for the fixed demo file
- DOCX/PDF conversion uses `mammoth`/`pdf-parse` (the project's only two npm dependencies, dynamically imported so local mode's zero-dependency story is untouched); DOC/RTF/RTFD/ODT aren't supported publicly

**Scaling seams**: `platform/limits.mjs` (async `take()` — swap the memory map for Redis when running 2+ processes), `platform/userdata.mjs` (swap disk for object storage), `ai/` (provider). Routes don't change for any of these.

## Development conventions

- Local mode: zero npm dependencies — if you need a library, inline it or implement it from scratch. The deliberate exceptions are public mode's doc conversion (`mammoth`, `pdf-parse`) and the output check (`markdown-it`), all loaded with dynamic `import()` so the server still runs without them (the check is then skipped and the editor says so)
- Every generated document passes through `extractQuestions()`, which runs the `mdcheck.js` fix + check and returns `check: {ok, issues, fixed}` alongside `markdown`. Keep new generation routes going through it. The editor loads the same parser from `/vendor/markdown-it.min.js` (served from `node_modules`) for its live check in the validation bar
- The homepage trust badges (`#trust`) must each describe something the deployment actually does. Do not add third-party certification names or marks (SOC 2, ISO …) unless that certification has been awarded
- No build step for the frontend — edit HTML/JS/CSS files directly
- Static files are served from an **allowlist** (`PUBLIC_FILES` in `server.mjs`), never "any file in the folder" — that folder holds server code, `.git`, possible key files and `users/`. A new front-end asset must be added there or it 404s
- AI keys are read only in `ai/providers/*` and sent only in server-to-vendor request headers (never a URL). The browser talks to `/api/*`; it never sees a key, a vendor URL or a raw vendor error (those go to the server log)
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
