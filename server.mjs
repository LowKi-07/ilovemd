#!/usr/bin/env node
/* ======================================================================
   ilovemd - anything to Markdown. A local converter with AI in the editor.

     node server.mjs        ->  http://127.0.0.1:7777   (homepage)
                                http://127.0.0.1:7777/app  (the editor)

   Documents live in ./documents/ as plain .md files. Nothing is hidden in a
   database or in browser storage: what you see in the app is what is on disk.

   File reading and writing go through NODE, not the browser's File System
   Access API. That is deliberate - it means no Chrome-only restriction, no
   permission prompts, no folder to re-connect after a restart. Save just works.

   The prompt bar calls POST /api/ai, which goes through the AIService in ./ai/.
   By default (local mode) that shells out to the Claude Code CLI, so there is
   no API key in this folder or in the browser - it reuses whatever auth
   `claude` already has. ILOVEMD_AI_PROVIDER switches it to Gemini, Grok,
   OpenAI or the Anthropic API instead.

   Local mode is loopback only. Public mode (ILOVEMD_MODE=public) is the
   password-gated internet deployment - see DEPLOY.md.
   ====================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAIService } from './ai/index.mjs';
import { createIdentity, addCookie } from './platform/identity.mjs';
import { createLimiter, createConcurrencyGate } from './platform/limits.mjs';
import { createUserData } from './platform/userdata.mjs';
import './mdcheck.js';   // sets globalThis.ilovemdCheck

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* Two deployment modes, one codebase.
   - 'local' (default): exactly today's behavior - CLI-based AI, loopback only,
     native macOS pickers, no login wall. This is the single-developer tool.
   - 'public': a password-gated demo instance meant to be reachable from the
     internet - direct Anthropic API calls (no local CLI needed), a shared
     session cookie, per-IP rate limiting, and uploads instead of native
     folder/file pickers. Set ILOVEMD_MODE=public to switch. */
const MODE = process.env.ILOVEMD_MODE === 'public' ? 'public' : 'local';

// A root for all writable state when hosting somewhere other than next to this
// file (e.g. GoDaddy Node.js Hosting requires persistent writes under
// /public/assets/). Local mode leaves this unset and keeps today's paths.
const DATA_DIR = process.env.ILOVEMD_DATA_DIR ? path.resolve(process.env.ILOVEMD_DATA_DIR) : null;

/* Documentation rules loaded from prompts/ at startup.
   These travel with the repo and are injected into every doc-generation prompt,
   so any LLM (Claude, OpenAI, Grok) follows the same methodology. */
function loadDocRules() {
  try {
    const dir = path.join(HERE, 'prompts');
    return {
      rules:     fs.readFileSync(path.join(dir, 'doc-rules.md'), 'utf8').trim(),
      component: fs.readFileSync(path.join(dir, 'templates', 'component.md'), 'utf8').trim(),
      page:      fs.readFileSync(path.join(dir, 'templates', 'page.md'), 'utf8').trim(),
      layout:    fs.readFileSync(path.join(dir, 'templates', 'layout.md'), 'utf8').trim(),
    };
  } catch { return null; }
}
const DOC_RULES = loadDocRules();

const DOCS = process.env.ILOVEMD_DOCS
  ? path.resolve(process.env.ILOVEMD_DOCS)
  : DATA_DIR ? path.join(DATA_DIR, 'documents') : path.join(HERE, 'documents');

const PORT = Number(process.env.PORT || 7777);
// Local mode stays loopback-only by default. Public hosting (e.g. GoDaddy) sets
// HOST=0.0.0.0 explicitly - the default here never changes on its own.
const HOST = process.env.HOST || '127.0.0.1';
const BUILD = 'ilovemd-1';

// A numeric setting. A typo must not quietly become NaN - that would switch a
// limit off entirely, since nothing compares as >= NaN.
function numEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`${name}="${raw}" is not a number.`);
    process.exit(1);
  }
  return n;
}

/* ---- public-mode-only configuration ----
   None of this is read or used when MODE is 'local'. */
// Optional. Unset, the public site is open to everyone; set, every visitor
// needs this one shared password first.
const GATE_PASSWORD = process.env.ILOVEMD_GATE_PASSWORD || '';
const SESSION_SECRET = process.env.ILOVEMD_SESSION_SECRET || '';
const SESSION_COOKIE = 'ilovemd_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RATE_LIMIT_PER_HOUR = numEnv('ILOVEMD_RATE_LIMIT_PER_HOUR', 20);
// Per network address: higher than per visitor, since an office or school
// shares one, but it stops a single client that keeps clearing its cookie.
const IP_RATE_LIMIT_PER_HOUR = numEnv('ILOVEMD_IP_RATE_LIMIT_PER_HOUR', RATE_LIMIT_PER_HOUR * 3);
const MAX_CALLS_PER_DAY = numEnv('ILOVEMD_MAX_CALLS_PER_DAY', 200);
// AI calls in flight at once in this process; past it visitors are told to retry.
const MAX_CONCURRENT_AI = numEnv('ILOVEMD_MAX_CONCURRENT_AI', 8);
const USER_DATA_DAYS = numEnv('ILOVEMD_USER_DATA_DAYS', 30);
const UPLOADS_PER_HOUR = numEnv('ILOVEMD_UPLOADS_PER_HOUR', 60);
const KIT_FILES_PER_HOUR = numEnv('ILOVEMD_KIT_FILES_PER_HOUR', 3000);
// How many reverse proxies sit in front of this server (Render, cPanel's
// Apache: 1). The client's real address is that many entries from the right
// of X-Forwarded-For - entries further left are whatever the client sent.
const TRUSTED_PROXIES = numEnv('ILOVEMD_TRUSTED_PROXIES', 1);

// One fixed Figma file the owner controls - never a visitor-supplied URL. Keeps
// the public demo from being used to pull a stranger's Figma design.
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';
const DEMO_FIGMA_KEY = process.env.ILOVEMD_DEMO_FIGMA_KEY || '';

if (MODE === 'public' && SESSION_SECRET.length < 16) {
  console.error('ILOVEMD_MODE=public requires ILOVEMD_SESSION_SECRET (16+ characters; try `openssl rand -hex 32`).');
  process.exit(1);
}

/* ---- where a request's files live ----
   Local mode: one developer, the paths next to this file, as always.
   Public mode: each visitor gets their own folder (platform/userdata.mjs), and
   every request runs inside requestScope so the helpers below - space(),
   listDocs(), readState() ... - see that visitor's folder without every
   function needing it passed in. */
const requestScope = new AsyncLocalStorage();
const LOCAL_SPACE = {
  docsDir: DOCS,
  workspaceDir: null,
  uploadsDir: path.join(HERE, '.uploads'),
  stateFile: path.join(HERE, '.ilovemd-state.json'),
};
const space = () => (requestScope.getStore() || {}).space || LOCAL_SPACE;
const visitor = () => (requestScope.getStore() || {}).visitor || null;

const identity = MODE === 'public' ? createIdentity({ secret: SESSION_SECRET }) : null;
const userData = MODE === 'public' ? createUserData({ root: DATA_DIR || HERE, ttlDays: USER_DATA_DAYS }) : null;
const limiter = createLimiter();
const aiGate = createConcurrencyGate(MAX_CONCURRENT_AI);

const SYSTEM_PROMPT = [
  'You write clear, well-structured Markdown documents.',
  '',
  'Rules:',
  '* Return ONLY the Markdown document. No preamble, no explanation, no code fence around the whole thing.',
  '* Start with a single level-one heading that names the document.',
  '* Use headings, short paragraphs, lists and tables where they genuinely help. Do not pad.',
  '* Plain declarative sentences. No marketing tone and no filler.',
  '* No em dashes; use a hyphen or a middle dot. No italics.',
  '* If the request is ambiguous, pick the most useful reasonable interpretation and write it. Do not ask questions back.',
  '* Never invent facts, figures, quotes or sources. Leave an honest placeholder where real data is needed.',
].join('\n');

/* --------------------------------------------------------------- helpers */

// The only files the static handler will serve. Add new front-end assets here.
const PUBLIC_FILES = new Set([
  'nav.css', 'nav.js', 'md.js', 'mdcheck.js',
  'home.html', 'shell.html', 'compare.html', 'login.html',
  'Menu.svg', 'Profile.svg', 'ilovemd logo.svg', 'favicon.svg',
  'hand-ai.webp', 'hand-human.webp',
  'tesla-vsr-card.svg',   // the Figma → MD "See how it works" demo frame
  'ilovemd-film.mp4', 'ilovemd-film.jpg',   // homepage product film + its poster
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

function sendJson(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(s),
    'Cache-Control': 'no-store',
  });
  res.end(s);
}

function readBody(req) {
  return new Promise((done, fail) => {
    let b = '';
    req.on('data', (d) => {
      b += d;
      if (b.length > 8e6) { fail(new Error('request body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { done(b ? JSON.parse(b) : {}); } catch (e) { fail(new Error('invalid JSON body')); }
    });
  });
}

/* ---------------------------------------------------- public-mode: auth */

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function makeSessionToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex');
  return exp + '.' + sig;
}

function verifySessionToken(tok) {
  if (!tok) return false;
  const i = String(tok).indexOf('.');
  if (i === -1) return false;
  const exp = Number(tok.slice(0, i));
  const sig = tok.slice(i + 1);
  if (!exp || Date.now() > exp) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (TRUSTED_PROXIES > 0 && hops.length) return hops[Math.max(0, hops.length - TRUSTED_PROXIES)];
  return req.socket.remoteAddress || 'unknown';
}

/* ------------------------------------------------- public-mode: zip reader
   DOCX/PPTX/XLSX are all ZIP archives of XML parts. Reading them used to shell
   out to the system `unzip` binary, which is macOS-specific-ish and not
   guaranteed on managed Linux hosting. This is a minimal pure-JS reader
   (central directory + local file header, stored or deflate) - no dependency,
   works everywhere Node does. */
function readZipEntries(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('not a valid zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    entries[name] = { method, compSize, localOffset };
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntry(buf, entries, name) {
  const e = entries[name];
  if (!e) throw new Error('zip entry not found: ' + name);
  const nameLen = buf.readUInt16LE(e.localOffset + 26);
  const extraLen = buf.readUInt16LE(e.localOffset + 28);
  const dataStart = e.localOffset + 30 + nameLen + extraLen;
  const data = buf.slice(dataStart, dataStart + e.compSize);
  if (e.method === 0) return data;
  if (e.method === 8) return zlib.inflateRawSync(data);
  throw new Error('unsupported zip compression method ' + e.method);
}

function zipReadText(file, part) {
  const buf = fs.readFileSync(file);
  return readZipEntry(buf, readZipEntries(buf), part).toString('utf8');
}

function zipList(file) {
  return Object.keys(readZipEntries(fs.readFileSync(file)));
}

/* A document name is a bare filename, never a path. Anything with a separator,
   a leading dot, or a non-.md extension is refused rather than sanitised - a
   silently rewritten filename is worse than a clear rejection. */
function safeName(raw) {
  const name = String(raw || '').trim();
  if (!name || name.length > 120) return null;
  if (name.includes('/') || name.includes('\\') || name.startsWith('.')) return null;
  if (name.includes('\0')) return null;
  // A name with no extension gets .md appended, which is what someone typing
  // "Release plan" means. A name carrying a DIFFERENT extension is refused
  // rather than turned into "notes.txt.md", which nobody intends.
  const ext = path.extname(name).toLowerCase();
  if (ext && ext !== '.md') return null;
  const withExt = ext === '.md' ? name : name + '.md';
  if (!/^[A-Za-z0-9 _()&+-]+\.md$/.test(withExt)) return null;
  return withExt;
}

const docPath = (name) => path.join(space().docsDir, name);

function listDocs() {
  const DOCS = space().docsDir;
  if (!fs.existsSync(DOCS)) return [];
  return fs.readdirSync(DOCS, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md') && !d.name.startsWith('.'))
    .map((d) => {
      const st = fs.statSync(path.join(DOCS, d.name));
      let title = d.name.replace(/\.md$/i, '');
      let words = 0;
      try {
        const text = fs.readFileSync(path.join(DOCS, d.name), 'utf8');
        const h1 = text.match(/^#\s+(.+)$/m);
        if (h1) title = h1[1].trim();
        words = text.trim() ? text.trim().split(/\s+/).length : 0;
      } catch (e) { /* unreadable file still deserves a row */ }
      return { name: d.name, title, mtime: st.mtimeMs, size: st.size, words };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function writeDoc(name, text) {
  fs.mkdirSync(space().docsDir, { recursive: true });
  const file = docPath(name);
  // Temp file then rename, so an interrupted write cannot destroy a good document.
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return fs.statSync(file).mtimeMs;
}

// Turn a document's own H1 into a filename, so a generated file is named after
// what it actually contains rather than after the request that produced it.
function nameFromMarkdown(md, fallback) {
  const h1 = String(md || '').match(/^#\s+(.+)$/m);
  let base = (h1 ? h1[1] : fallback || 'Untitled')
    .replace(/[^A-Za-z0-9 &()+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!base) base = 'Untitled';
  let candidate = base + '.md';
  let n = 2;
  while (fs.existsSync(docPath(candidate))) candidate = `${base} ${n++}.md`;
  return candidate;
}

/* ----------------------------------------------------------- ui -> md */

/* Remembered folders (component import folder, markdown output folder) live
   in a tiny JSON file next to the server, so "save everything there going
   forward" survives a restart. */
function readState() {
  try { return JSON.parse(fs.readFileSync(space().stateFile, 'utf8')) || {}; }
  catch (e) { return {}; }
}
function writeState(patch) {
  const s = { ...readState(), ...patch };
  fs.mkdirSync(path.dirname(space().stateFile), { recursive: true });
  fs.writeFileSync(space().stateFile, JSON.stringify(s, null, 2));
  return s;
}

/* A real macOS folder picker. The server runs as the logged-in user, so
   osascript can put a Finder chooser on screen - no File System Access API,
   no Chrome-only restriction. Cancel is a normal answer, not an error. */
function pickFolder(promptText) {
  return new Promise((done) => {
    const script = [
      'tell application "System Events"',
      'activate',
      'set f to choose folder with prompt "' + String(promptText || 'Choose a folder').replace(/[\\"]/g, '\\$&') + '"',
      'end tell',
      'POSIX path of f',
    ].join('\n');
    let p;
    try { p = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return done({ error: e.message }); }
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); done({ canceled: true }); }, 180000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); done({ error: e.message }); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) return done({ path: out.trim().replace(/\/$/, '') });
      if (/cancel/i.test(err)) return done({ canceled: true });
      done({ error: err.trim() || ('osascript exited ' + code) });
    });
  });
}

// A directory the user pointed us at, verified before use. An empty value must
// stay empty - path.resolve('') is the CWD, which nobody chose.
function realDir(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const dir = path.resolve(s);
  // Public mode never trusts a client-supplied path outside the upload
  // workspace - local mode's whole point is browsing the developer's own disk.
  if (MODE === 'public') {
    const ws = space().workspaceDir;
    if (!ws) return null;
    if (dir !== ws && !dir.startsWith(ws + path.sep)) return null;
  }
  try { if (fs.statSync(dir).isDirectory()) return dir; } catch (e) { /* fall through */ }
  return null;
}

const SRC_EXT = new Set(['.html', '.htm', '.css']);

/* One component = one subfolder holding HTML/CSS, or loose files sharing a
   basename ("button.html" + "button.css" -> Button). */
function scanComponents(dir) {
  const groups = new Map();
  const add = (key, rel) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rel);
  };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      let inner;
      try { inner = fs.readdirSync(path.join(dir, e.name), { withFileTypes: true }); }
      catch (err) { continue; }
      for (const f of inner) {
        if (f.isFile() && SRC_EXT.has(path.extname(f.name).toLowerCase()) && !f.name.startsWith('.')) {
          add(e.name, path.join(e.name, f.name));
        }
      }
    } else if (e.isFile() && SRC_EXT.has(path.extname(e.name).toLowerCase())) {
      add(path.basename(e.name, path.extname(e.name)), e.name);
    }
  }
  return [...groups.entries()]
    .map(([name, files]) => ({
      name,
      // HTML first, so the first source tab shows the markup.
      files: files.sort((a, b) =>
        (/\.css$/i.test(a) ? 1 : 0) - (/\.css$/i.test(b) ? 1 : 0) || a.localeCompare(b)),
      html: files.filter((f) => /\.html?$/i.test(f)).length,
      css: files.filter((f) => /\.css$/i.test(f)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ----- design-system kits -----
   Understands the Alloy-style layout without being married to it:

     <root>/global-kit/components/<Comp>/...
     <root>/product-kits/<kit>/components/<Comp>/...

   Global Kit holds the shared components documented once for every design
   system; a product kit lists ONLY the components it alone ships (matching
   the Alloy docs portal). A folder with neither convention is one kit. */
const KIT_LABELS = {
  arc: 'ARC', 'arc-consumer': 'ARC Consumer', drp: 'DRP', drs: 'DRS',
  drsc: 'DRSC', greenfield: 'Greenfield', t1: 'T1',
};
function prettyKit(id) {
  if (KIT_LABELS[id]) return KIT_LABELS[id];
  return id.length <= 3
    ? id.toUpperCase()
    : id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
}

// Someone who picked ".../global-kit/components" meant the repo around it.
function detectKitRoot(dir) {
  if (path.basename(dir) === 'components') {
    const p = path.dirname(dir);
    if (path.basename(p) === 'global-kit') return path.dirname(p);
    if (path.basename(path.dirname(p)) === 'product-kits') return path.dirname(path.dirname(p));
  }
  return dir;
}

function discoverKits(rawRoot) {
  const root = detectKitRoot(rawRoot);
  const kits = [];
  const gk = realDir(path.join(root, 'global-kit', 'components'));
  const pk = realDir(path.join(root, 'product-kits'));
  if (gk) kits.push({ id: 'global', label: 'Global Kit', dirs: [gk] });
  if (pk) {
    for (const e of fs.readdirSync(pk, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const own = realDir(path.join(pk, e.name, 'components'));
      // A kit that ships nothing of its own still belongs in the dropdown -
      // an honest empty list beats pretending it owns the global set.
      kits.push({ id: e.name, label: prettyKit(e.name), dirs: own ? [own] : [] });
    }
  }
  if (!kits.length) kits.push({ id: 'all', label: path.basename(root), dirs: [root] });
  return { root, kits };
}

function kitComponents(rawRoot, kitId) {
  const { root, kits } = discoverKits(rawRoot);
  const kit = kits.find((k) => k.id === kitId) || kits[0];
  const seen = new Map();
  for (const d of kit.dirs) { // own-components dir is listed first, so it wins
    for (const c of scanComponents(d)) {
      if (!seen.has(c.name)) seen.set(c.name, { ...c, dir: d });
    }
  }
  return { root, kit, components: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

// Where one component's files actually live, kit-aware.
function resolveComponentDir(rawRoot, kitId, name) {
  const { components } = kitComponents(rawRoot, kitId);
  const hit = components.find((c) => c.name === name);
  return hit ? hit.dir : null;
}

/* ----- arbitrary-folder classification -----
   When a folder is NOT an Alloy-style kit repo, segregate whatever it holds
   into pages / templates / sections / components, and ignore the noise
   (vendor files, build output, fonts, images, style libs). Deterministic
   signals only: folder conventions, document shape, React export shape. */

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'vendor', 'coverage',
  'fonts', 'font', 'images', 'img', 'media', 'videos', '__tests__', '__snapshots__',
]);
const LIB_STYLE_DIRS = new Set(['libs', 'lib', 'base', 'mixins', 'functions', 'vars', 'utils', 'helpers', 'tokens']);
const VENDOR_FILE = /\.min\.|font-?awesome|jquery|bootstrap[.-]|normalize\.css|reset\.css|skel/i;

function walkFiles(root, cap = 4000) {
  const out = [];
  (function rec(dir, rel) {
    if (out.length >= cap) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase())) rec(path.join(dir, e.name), r);
      } else if (e.isFile()) {
        out.push(r);
        if (out.length >= cap) return;
      }
    }
  })(root, '');
  return out;
}

const titleCase = (s) => s.replace(/^_+/, '').replace(/[-_]+/g, ' ').trim()
  .replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, '');

function readHead(root, rel, n = 6000) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8').slice(0, n); } catch (e) { return ''; }
}

/* Returns ordered groups: [{ id, label, items: [{ uid, name, type, files }] }] */
function classifyRepo(root) {
  const files = walkFiles(root);
  const used = new Set();
  const units = [];
  const seenUid = new Set();
  function addUnit(type, name, fileList) {
    let uid = type + ':' + name, n = 2;
    while (seenUid.has(uid)) uid = type + ':' + name + ' ' + n++;
    seenUid.add(uid);
    units.push({ uid, type, name, files: fileList });
    fileList.forEach((f) => used.add(f));
  }
  const segsOf = (rel) => rel.toLowerCase().split('/').slice(0, -1);
  const isVendor = (rel) => VENDOR_FILE.test(path.basename(rel));
  const style = (rel) => /\.(css|scss|sass|less)$/i.test(rel);
  const html = (rel) => /\.html?$/i.test(rel);
  const react = (rel) => /\.(jsx|tsx)$/i.test(rel);

  /* HTML first: full documents are pages (linked local CSS rides along),
     fragments are component markup. */
  const fragments = [];
  for (const rel of files) {
    if (!html(rel) || isVendor(rel)) continue;
    const head = readHead(root, rel);
    if (/<!doctype\s+html|<html[\s>]/i.test(head)) {
      const base = path.basename(rel, path.extname(rel));
      const dir = path.dirname(rel);
      let name = base.toLowerCase() === 'index'
        ? (dir === '.' ? 'Home' : titleCase(path.basename(dir)))
        : titleCase(base);
      const linked = [];
      const re = /<link[^>]+href=["']([^"'#?]+\.css)["']/gi;
      let m;
      const full = readHead(root, rel, 20000);
      while ((m = re.exec(full)) && linked.length < 2) {
        const target = path.normalize(path.join(path.dirname(rel), m[1]));
        if (!target.startsWith('..') && files.includes(target.split(path.sep).join('/')) && !isVendor(target)) {
          linked.push(target.split(path.sep).join('/'));
        }
      }
      addUnit('page', name, [rel].concat(linked));
    } else {
      fragments.push(rel);
    }
  }

  /* Style files by folder convention. */
  for (const rel of files) {
    if (!style(rel) || used.has(rel) || isVendor(rel)) continue;
    const segs = segsOf(rel);
    if (segs.some((s) => LIB_STYLE_DIRS.has(s))) { used.add(rel); continue; }
    const base = titleCase(path.basename(rel, path.extname(rel)));
    if (segs.includes('components') || segs.includes('component') || segs.includes('partials') || segs.includes('ui')) {
      addUnit('component', base, [rel]);
    } else if (segs.includes('layout') || segs.includes('layouts') || segs.includes('sections')) {
      addUnit('section', base, [rel]);
    } else if (segs.includes('templates') || segs.includes('template')) {
      addUnit('template', base, [rel]);
    }
    // Anything else (root aggregates like main.scss) is build plumbing - skipped.
  }

  /* React: one unit per component-looking file, classified by folder. */
  for (const rel of files) {
    if (!react(rel) || used.has(rel) || isVendor(rel)) continue;
    const head = readHead(root, rel);
    if (!/export\s+(default\s+)?(function|const|class)\s+[A-Z]|export\s+default\s+[A-Z]/m.test(head)) continue;
    const segs = segsOf(rel);
    const name = titleCase(path.basename(rel, path.extname(rel)));
    const type = (segs.includes('pages') || segs.includes('views') || segs.includes('routes') || segs.includes('app')) ? 'page'
      : (segs.includes('layouts') || segs.includes('templates')) ? 'template'
      : 'component';
    // Same-name style file next to it rides along.
    const sib = files.find((f) => style(f) && !used.has(f) &&
      path.dirname(f) === path.dirname(rel) &&
      path.basename(f, path.extname(f)).toLowerCase() === path.basename(rel, path.extname(rel)).toLowerCase());
    addUnit(type, name, sib ? [rel, sib] : [rel]);
  }

  /* HTML fragments pair with a same-basename or same-folder style file. */
  for (const rel of fragments) {
    if (used.has(rel)) continue;
    const base = path.basename(rel, path.extname(rel));
    const dir = path.dirname(rel);
    const mates = files.filter((f) => style(f) && !used.has(f) && !isVendor(f) &&
      (path.basename(f, path.extname(f)).toLowerCase() === base.toLowerCase() ||
       (path.dirname(f) === dir && dir !== '.')));
    const name = base.toLowerCase() === 'index' || base.toLowerCase() === 'preview'
      ? titleCase(path.basename(dir)) : titleCase(base);
    addUnit('component', name, [rel].concat(mates.slice(0, 3)));
  }

  const ORDER = [
    ['page', 'Pages'], ['template', 'Templates'], ['section', 'Sections'], ['component', 'Components'],
  ];
  return ORDER
    .map(([type, label]) => ({
      id: type, label,
      items: units.filter((u) => u.type === type)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ uid: u.uid, name: u.name, type: u.type, files: u.files })),
    }))
    .filter((g) => g.items.length);
}

function unitSource(root, uid) {
  const groups = classifyRepo(root);
  for (const g of groups) {
    const hit = g.items.find((u) => u.uid === uid);
    if (hit) {
      return {
        name: hit.name,
        type: hit.type,
        files: hit.files.map((rel) => {
          let content = '';
          try { content = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { /* keep row */ }
          const truncated = content.length > MAX_SRC_LIMIT;
          return {
            name: rel,
            type: /\.(css|scss|sass|less)$/i.test(rel) ? 'css' : /\.(jsx|tsx)$/i.test(rel) ? 'react' : 'html',
            truncated,
            content: truncated ? content.slice(0, MAX_SRC_LIMIT) : content,
          };
        }),
      };
    }
  }
  return null;
}

const MAX_SRC_LIMIT = 150000;
const MAX_SRC = 150000; // per file, characters sent to Claude / the browser

function componentSource(dir, name) {
  const comp = scanComponents(dir).find((c) => c.name === name);
  if (!comp) return null;
  const files = comp.files.map((rel) => {
    const full = path.join(dir, rel);
    let content = '';
    try { content = fs.readFileSync(full, 'utf8'); } catch (e) { content = ''; }
    const truncated = content.length > MAX_SRC;
    return {
      name: rel,
      type: /\.css$/i.test(rel) ? 'css' : 'html',
      truncated,
      content: truncated ? content.slice(0, MAX_SRC) : content,
    };
  });
  return { name: comp.name, files };
}

function componentPrompt(src) {
  const parts = src.files.map((f) =>
    '=== ' + f.type.toUpperCase() + ' (' + f.name + ') ===\n\n' + f.content);
  const rulesBlock = DOC_RULES
    ? [DOC_RULES.rules, '', '---', '', DOC_RULES.component, '', '---', '']
    : [];
  return [
    ...rulesBlock,
    'Analyze the UI component source below and write component documentation in Markdown.',
    'The documentation is for people who must USE the component well: lead with design',
    'principles, usage guidance and business purpose. Keep technical detail to the minimum',
    'that supports those - this is not an implementation reference.',
    '',
    'Requirements:',
    '* Title the document with the component name, e.g. "# ' + src.name.charAt(0).toUpperCase() + src.name.slice(1) + '".',
    '* Include ALL of these sections, in this order, and no others: Purpose, Variants,',
    '  States, Anatomy, Dependencies, Behaviour, Actions, Accessibility, Do / Don\'t.',
    '* Every section heading is mandatory. When the source gives nothing for a section,',
    '  keep the heading and leave its body completely EMPTY - no placeholder text,',
    '  no "Needs review", no commentary.',
    '* Purpose: one or two sentences - what it is and when to use it.',
    '* Variants: "- <Variant> - when to use it." one bullet per variant.',
    '* States: "- <State> - what it communicates or when it appears." No CSS values.',
    '* Anatomy: "- <Element> - what it is for." Plain part names, not selectors.',
    '* Dependencies: "### Components" (other components used, by name) and "### Tokens"',
    '  ("- Colour: <token>", "- Spacing: <token>" - token NAMES only, never values).',
    '* Behaviour: interaction rules - how it responds, what is allowed or blocked.',
    '* Actions: "- <Action> does <what>." Empty body for purely presentational components.',
    '* Accessibility: what is exposed programmatically and keyboard behaviour.',
    '* Do / Don\'t: short imperative rules.',
    '* AVOID: overview essays, props/API tables, code examples, markup snippets, CSS dumps,',
    '  pixel or colour values, token-value tables, Sizes as its own section (fold into',
    '  Variants when sizes carry meaning), Examples, Notes.',
    '* Do not invent variants, states, behaviour, business rules or accessibility features',
    '  the source cannot reasonably support - leave that section body empty instead.',
    '* Preserve component and token names exactly as written in the source.',
    '* AFTER the document, append a final section "## Open questions": one numbered',
    '  question for each section you left empty or thin, with 1-3 short plausible answers',
    '  as indented "-" bullets beneath it where suggestions help. This section is',
    '  automatically split out of the saved document - it never reaches the file.',
    '',
    'Component: ' + src.name,
    '',
    parts.join('\n\n'),
  ].join('\n');
}

/* Pages and templates get their own section shapes; sections (header, footer,
   hero...) read best with the component shape, so they reuse componentPrompt. */
function unitPrompt(src) {
  if (src.type !== 'page' && src.type !== 'template') return componentPrompt(src);
  const parts = src.files.map((f) =>
    '=== ' + f.type.toUpperCase() + ' (' + f.name + ') ===\n\n' + f.content);
  const shape = src.type === 'page'
    ? ['* Use only sections the source can actually support, chosen from: Purpose,',
       '  Page anatomy (the sections in order, top to bottom), Components used (a table),',
       '  Layout, Responsive behavior, Content model, Page states, SEO / Meta,',
       '  Accessibility, Do, Don\'t.',
       '* The page owns the single h1 - describe the landmark and heading structure.']
    : ['* Use only sections the source can actually support, chosen from: Intended use,',
       '  Regions (a table of slots/areas and what fills them), Allowed content,',
       '  Layout rules, Responsive behavior, Variants, Do, Don\'t.'];
  const tpl = DOC_RULES ? (src.type === 'page' ? DOC_RULES.page : DOC_RULES.layout) : null;
  const rulesBlock = DOC_RULES ? [DOC_RULES.rules, '', '---', '', tpl, '', '---', ''] : [];
  return [
    ...rulesBlock,
    'Analyze the ' + src.type + ' source below and write ' + src.type + ' documentation in Markdown.',
    '',
    'Requirements:',
    '* Title the document "# ' + src.name + '".',
  ].concat(shape).concat([
    '* Do not invent anything the source cannot reasonably support. Omit the section,',
    '  or mark the point as "Needs review", when the source does not say.',
    '* Preserve class names, selectors and other technical names exactly.',
    '* Use tables for structured facts, and code blocks for markup taken from the source.',
    '* If you end the document with an "## Open questions" section, number each question,',
    '  and where you can, offer 1-3 short plausible answers as indented "-" bullets',
    '  beneath it, so the user can pick one instead of typing.',
    '',
    src.type.charAt(0).toUpperCase() + src.type.slice(1) + ': ' + src.name,
    '',
    parts.join('\n\n'),
  ]).join('\n');
}

/* ---- local-mode Figma: the desktop app's own MCP server -----
   The Figma desktop app runs a Dev Mode MCP server on 127.0.0.1:3845, already
   signed in as whoever is using the app. Talking to it over plain HTTP sidesteps
   the whole CLI/MCP path: a spawned `claude -p` reconnects to the *cloud* Figma
   connector every time, which an organization can block pending tool approval,
   and which a non-admin then cannot unblock. A local HTTP call needs no approval
   and no personal access token.

   Transport is MCP streamable-HTTP: initialize, then notifications/initialized,
   then tools/call - with the session id from the initialize response echoed back
   in a header. Replies come back SSE-framed even for unary calls. */
const FIGMA_MCP_URL = process.env.ILOVEMD_FIGMA_MCP_URL || 'http://127.0.0.1:3845/mcp';

function figmaMcpSession() {
  let sid = null;

  async function rpc(method, params, { notify = false, ms = 30000 } = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (sid) headers['mcp-session-id'] = sid;
    const payload = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
    if (!notify) payload.id = Math.floor(Math.random() * 1e6);

    const r = await fetch(FIGMA_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ms),
    });
    const got = r.headers.get('mcp-session-id');
    if (got) sid = got;
    if (!r.ok) throw new Error(`Figma MCP ${r.status}`);
    if (notify) return null;

    const text = await r.text();
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        const msg = JSON.parse(line.slice(5).trim());
        if (msg.error) throw new Error(msg.error.message || 'Figma MCP error');
        return msg;
      } catch (e) {
        if (e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
    return JSON.parse(text);
  }

  return {
    async open() {
      await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ilovemd', version: '1' },
      }, { ms: 8000 });
      await rpc('notifications/initialized', {}, { notify: true });
    },
    async call(name, args, ms) {
      const res = await rpc('tools/call', { name, arguments: args }, { ms });
      return (res?.result?.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();
    },
  };
}

// https://figma.com/design/<key>/<name>?node-id=1-713 -> { key, node: '1:713' }
function parseFigmaUrl(url) {
  const key = (url.match(/\/(?:design|file)\/([0-9A-Za-z]{22,128})/) || [])[1] || '';
  const raw = (url.match(/[?&]node-id=([^&]+)/) || [])[1] || '';
  const node = decodeURIComponent(raw).replace('-', ':');
  return { key, node };
}

/* get_design_context returns full generated code - on a real component tree it
   is enormous and routinely never finishes. Structure plus resolved variables is
   both fast (~0.3s each) and closer to what documentation actually needs. */
async function fetchFigmaViaLocalMcp(url) {
  const { key, node } = parseFigmaUrl(url);
  if (!key) throw new Error('Could not find a file key in that Figma link.');
  if (!node) throw new Error('That link has no node-id - open the frame in Figma and copy the link to it.');

  const s = figmaMcpSession();
  await s.open();
  const args = { fileKey: key, nodeId: node, clientLanguages: 'html,css', clientFrameworks: 'unknown' };

  const structure = await s.call('get_metadata', args, 30000);
  // Tokens are a nice-to-have; a file with no bound variables still documents fine.
  let tokens = '';
  try {
    tokens = await s.call('get_variable_defs', args, 20000);
  } catch { /* no variables bound, or tool unavailable */ }

  if (!structure) throw new Error('Figma returned nothing for that node.');
  return { structure, tokens, key, node };
}

function figmaLocalPrompt({ structure, tokens }, url) {
  const rulesBlock = DOC_RULES ? [DOC_RULES.rules, '', '---', ''] : [];
  return [
    ...rulesBlock,
    'Write component documentation in Markdown from this REAL Figma data.',
    'The structure below is the actual node tree retrieved from the user\'s Figma file;',
    'the variables are the design tokens actually bound to it.',
    '',
    'Map it into sections chosen from: Overview, Anatomy (from the node tree),',
    'Design Tokens (from the variables), Variants, States, Layout, Usage,',
    'Accessibility - but ONLY where the data below actually supports them.',
    'Never invent properties, variants, tokens or behavior the data does not show.',
    'Preserve exact layer, component and variable names.',
    'Layer names wrapped in ["..."]["..."] brackets are data-binding paths, not',
    'literal copy - describe them as bound fields rather than quoting them as text.',
    'Never emit a heading with no content under it: write the section, or leave it out.',
    'Open with a short Overview that says what this component is and where it is used,',
    'inferred from its own name and structure.',
    '',
    'Source: ' + url,
    '',
    '## Node structure',
    '',
    structure,
    '',
    ...(tokens ? ['## Bound variables (design tokens)', '', tokens, ''] : []),
    'If you end with an "## Open questions" section, number each question and,',
    'where you can, offer 1-3 short plausible answers as indented "-" bullets.',
  ].join('\n');
}

/* ---- public-mode Figma demo -----
   No MCP, no CLI - a direct call to Figma's REST API for the one file the
   owner configured, summarized down to what's useful for documentation
   (styles, named components, top-level structure) rather than the full node
   tree, which can be enormous. */
/* Figma REST API. The token goes only in this request's header - never a
   URL, a log line or disk. A visitor's token is used for their one request
   and then dropped. */
async function figmaGet(pathAndQuery, token) {
  let r;
  try {
    r = await fetch('https://api.figma.com/v1/' + pathAndQuery, {
      headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    const err = new Error('Could not reach Figma.');
    err.explain = e.name === 'TimeoutError' ? 'Figma took too long to answer - try a smaller frame.' : 'Try again in a moment.';
    throw err;
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    // Figma's own rate-limit headers say which allowance ran out - log them
    // (never the token) so a failure can be diagnosed from the host's logs.
    const fx = [...r.headers].filter(([k]) => /^x-figma|^retry-after$/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ');
    console.error(`Figma API ${r.status}: ${body.slice(0, 200)}${fx ? '  [' + fx + ']' : ''}`);
    const err = new Error(
      r.status === 403 ? 'Figma did not accept this token for this file.'
        : r.status === 404 ? 'Figma could not find that file or frame.'
          : r.status === 429 ? 'Figma is rate-limiting this token.'
            : `Figma responded ${r.status}.`);
    err.explain =
      r.status === 403 ? 'Check that the token was copied whole, has not expired, has "File content: read" access, and that your Figma account can open this file.'
        : r.status === 404 ? 'Check the link - copy it from Figma with Share → Copy link, or right-click a frame → Copy link to selection.'
          : r.status === 429 ? figmaWait(r.headers.get('retry-after'))
            : 'Try again in a moment.';
    err.figma = true;
    throw err;
  }
  return r.json();
}

// Figma's API allowance depends on the token owner's plan and seat; on some
// it is a handful of calls before a wait of days, so say the real wait.
function figmaWait(retryAfter) {
  const secs = Number(retryAfter);
  if (!secs) return 'Wait a little and try again.';
  if (secs < 120) return `Try again in ${Math.ceil(secs)} seconds.`;
  if (secs < 7200) return `Try again in about ${Math.ceil(secs / 60)} minutes.`;
  const when = new Date(Date.now() + secs * 1000).toUTCString().replace(/:\d\d GMT$/, ' UTC');
  return `Figma's API allowance for this token's plan or seat is used up until about ${when}. ` +
    'A token from an account with a Full or Dev seat on a paid Figma plan gets far more calls.';
}

const fetchFigmaFile = (key, token) => figmaGet(`files/${encodeURIComponent(key)}`, token);

/* A visitor's link: one frame when it has ?node-id=, otherwise the file's
   pages and top-level frames. Returns { name, summary }. */
async function fetchFigmaForVisitor(url, token) {
  const { key, node } = parseFigmaUrl(url);
  if (node) {
    const data = await figmaGet(`files/${encodeURIComponent(key)}/nodes?ids=${encodeURIComponent(node)}&depth=6`, token);
    const entry = data.nodes && data.nodes[node];
    if (!entry || !entry.document) {
      const err = new Error('Figma could not find that frame in the file.');
      err.explain = 'Copy the link again with right-click → Copy link to selection.';
      throw err;
    }
    return { name: entry.document.name || data.name || 'Figma frame', summary: summarizeFigmaNode(data.name, entry) };
  }
  const data = await figmaGet(`files/${encodeURIComponent(key)}?depth=2`, token);
  return { name: data.name || 'Figma file', summary: summarizeFigmaFile(data) };
}

// One frame/component in enough depth to document: its layer tree with
// layout, the component properties and variants, and text content.
function summarizeFigmaNode(fileName, entry) {
  const doc = entry.document;
  const lines = [`Figma file: ${fileName || 'Untitled'}`, `Selected: ${doc.name} (${doc.type})`];
  const comps = entry.components ? Object.values(entry.components) : [];
  const own = comps.find((c) => c.name === doc.name) || null;
  if (own && own.description) lines.push('Description: ' + own.description);
  const defs = doc.componentPropertyDefinitions || {};
  const props = Object.entries(defs).map(([k, d]) => {
    const name = k.replace(/#[^#]*$/, '');
    const opts = d.variantOptions ? ` - options: ${d.variantOptions.join(', ')}` : '';
    return `- ${name}: ${d.type}${d.defaultValue !== undefined ? ` (default ${JSON.stringify(d.defaultValue)})` : ''}${opts}`;
  });
  if (props.length) lines.push('\nComponent properties:\n' + props.join('\n'));
  if (doc.type === 'COMPONENT_SET' && doc.children) {
    lines.push('\nVariants:\n' + doc.children.slice(0, 80).map((c) => '- ' + c.name).join('\n'));
  }
  const styles = entry.styles ? Object.values(entry.styles).map((st) => `- ${st.name} (${st.styleType})`) : [];
  if (styles.length) lines.push('\nStyles used:\n' + styles.slice(0, 60).join('\n'));
  if (comps.length) {
    lines.push('\nComponents referenced:\n' + comps.slice(0, 60)
      .map((c) => `- ${c.name}${c.description ? ': ' + c.description.slice(0, 160) : ''}`).join('\n'));
  }
  const tree = [];
  (function walk(n, depth) {
    if (!n || tree.length >= 400) return;
    const bits = [];
    if (n.layoutMode && n.layoutMode !== 'NONE') bits.push(`auto-layout ${n.layoutMode.toLowerCase()}`);
    if (n.itemSpacing) bits.push(`gap ${n.itemSpacing}`);
    const pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft];
    if (pad.some(Boolean)) bits.push(`padding ${pad.map((v) => v || 0).join('/')}`);
    if (n.cornerRadius) bits.push(`radius ${n.cornerRadius}`);
    if (n.absoluteBoundingBox && depth < 2) bits.push(`${Math.round(n.absoluteBoundingBox.width)}x${Math.round(n.absoluteBoundingBox.height)}`);
    if (n.type === 'TEXT' && n.characters) bits.push(`"${n.characters.slice(0, 80).replace(/\s+/g, ' ')}"`);
    if (n.type === 'INSTANCE' && n.componentProperties) {
      const cp = Object.entries(n.componentProperties).slice(0, 6).map(([k, v]) => `${k.replace(/#[^#]*$/, '')}=${v.value}`);
      if (cp.length) bits.push(cp.join(', '));
    }
    tree.push(`${'  '.repeat(depth)}- ${n.name} (${n.type})${bits.length ? ' - ' + bits.join('; ') : ''}`);
    if (n.children && depth < 6) for (const c of n.children) walk(c, depth + 1);
  })(doc, 0);
  lines.push('\nLayer tree:\n' + tree.join('\n') + (tree.length >= 400 ? '\n  ... (truncated)' : ''));
  return lines.join('\n');
}

function summarizeFigmaFile(data) {
  const lines = ['Figma file: ' + (data.name || 'Untitled')];
  const styles = data.styles ? Object.values(data.styles).map((s) => `- ${s.name} (${s.styleType})`) : [];
  if (styles.length) lines.push('\nStyles:\n' + styles.slice(0, 60).join('\n'));
  const comps = data.components ? Object.values(data.components).map((c) => `- ${c.name}${c.description ? ': ' + c.description : ''}`) : [];
  if (comps.length) lines.push('\nComponents:\n' + comps.slice(0, 60).join('\n'));
  const structure = [];
  // Starts at -1 so the DOCUMENT root itself is skipped and pages sit at 0.
  (function walk(node, depth) {
    if (!node || depth > 2) return;
    if (depth >= 0) structure.push('  '.repeat(depth) + '- ' + (node.name || node.type) + ' (' + node.type + ')');
    if (node.children) for (const c of node.children) walk(c, depth + 1);
  })(data.document, -1);
  if (structure.length) lines.push('\nStructure (top levels):\n' + structure.slice(0, 120).join('\n'));
  return lines.join('\n');
}

function figmaDemoPrompt(summary, fileName) {
  const rulesBlock = DOC_RULES ? [DOC_RULES.rules, '', '---', ''] : [];
  return [
    ...rulesBlock,
    'Write component/design documentation in Markdown from this REAL Figma data.',
    'Map the data into sections chosen from: Overview, Anatomy, Variants, Properties,',
    'States, Sizes, Layout and spacing, Design Tokens (from styles), Components used,',
    'Content, Structure - but ONLY where the data',
    'below actually supports them. Never invent properties, variants or tokens the',
    'data does not show. Preserve exact names.',
    '',
    'Figma file: ' + fileName,
    '',
    summary,
  ].join('\n');
}

/* The generator is asked to END with an "## Open questions" section so the
   clarification flow has material - but questions never belong in the saved
   document. This splits them out and cleans the markdown. */
function splitQuestions(md) {
  const lines = String(md || '').split('\n');
  let start = -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+open questions\s*$/i.test(lines[i].trim())) {
      start = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,2}\s/.test(lines[j])) { end = j; break; }
      }
      break;
    }
  }
  if (start === -1) return { markdown: md, questions: [] };
  const questions = [];
  let cur = null;
  for (let i = start + 1; i < end; i++) {
    const q = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
    const o = lines[i].match(/^\s*[-*]\s+(.+)$/);
    if (q) { cur = { text: q[1].trim(), options: [] }; questions.push(cur); }
    else if (o && cur && cur.options.length < 4) cur.options.push(o[1].trim());
  }
  const markdown = lines.slice(0, start).concat(lines.slice(end)).join('\n')
    .replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
  return { markdown, questions };
}

/* Every generated document leaves through here: open questions split out,
   then the CommonMark check (mdcheck.js) - an unclosed code fence is closed,
   and the remaining findings travel with the response as `check`. */
function extractQuestions(md) {
  const out = splitQuestions(md);
  if (!markdownIt) return { ...out, check: null };
  const repaired = globalThis.ilovemdCheck.fix(out.markdown);
  const check = globalThis.ilovemdCheck.check(markdownIt, repaired.text);
  if (repaired.fixed.length) console.log('    mdcheck fixed: ' + repaired.fixed.join(' '));
  return { ...out, markdown: repaired.text, check: { ...check, fixed: repaired.fixed } };
}

/* ----------------------------------------------------- file conversion
   The converters are fidelity-first: a deterministic extraction layer gets the
   raw content out of the file, then one Claude pass (guided by the
   file-to-markdown skill) cleans junk and repairs structure - never rewriting
   or summarizing the author's words. */

function readRawBody(req, cap) {
  return new Promise((done, fail) => {
    const chunks = [];
    let n = 0;
    req.on('data', (d) => {
      n += d.length;
      if (n > cap) { fail(new Error('file too large')); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

const CONVERT_EXT = new Set([
  '.docx', '.doc', '.rtf', '.rtfd', '.odt', '.html', '.htm', '.txt', '.md',
  '.csv', '.tsv', '.xlsx', '.pptx', '.pdf',
]);
// Photos the Text → MD assistant can be handed as attachments.
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const IMAGE_MAX = 10e6;
const ATTACH_MAX = 5;            // files per message
const ATTACH_TEXT_MAX = 60000;   // characters taken from each document

/* Attachments sent with a Text → MD prompt: paths returned by /api/upload,
   accepted only from this visitor's own uploads folder. Documents become
   text context (the converters' extractors); photos are handed to the AI
   as images, if the provider can see them. Returns { context, images }
   or throws an Error with .status/.explain for the response. */
async function readAttachments(list) {
  const fail = (msg, explain) => Object.assign(new Error(msg), { status: 400, explain: explain || '' });
  if (!Array.isArray(list) || !list.length) return { context: '', images: [] };
  if (list.length > ATTACH_MAX) throw fail(`Attach at most ${ATTACH_MAX} files per message.`);
  const up = space().uploadsDir;
  const parts = [], images = [];
  for (const raw of list) {
    const file = path.resolve(String(raw || ''));
    if (!file.startsWith(up + path.sep) || !fs.existsSync(file)) throw fail('An attached file is no longer available.', 'Attach it again.');
    const ext = path.extname(file).toLowerCase();
    const name = path.basename(file).replace(/^\d+-/, '');
    if (IMAGE_TYPES[ext]) {
      if (!ai.capabilities.images) {
        throw fail(`${ai.label} cannot read images with the current settings.`, 'Remove the photo, or switch ILOVEMD_AI_PROVIDER / ILOVEMD_AI_MODEL to a vision-capable model.');
      }
      if (fs.statSync(file).size > IMAGE_MAX) throw fail(`${name} is too large (10 MB max for photos).`);
      images.push({ name, path: file, mime: IMAGE_TYPES[ext], data: fs.readFileSync(file).toString('base64') });
    } else if (CONVERT_EXT.has(ext)) {
      let ex;
      try { ex = await extractFile(file, ext); } catch (e) { throw fail(`Could not read ${name}.`, e.message); }
      const text = ex.selfRead
        ? `(Read this file yourself at: ${path.relative(HERE, file) || file})`
        : String(ex.content || '').slice(0, ATTACH_TEXT_MAX);
      parts.push(`=== ATTACHED FILE: ${name} ===\n${text}`);
    } else {
      throw fail(`${name} is not a supported attachment.`);
    }
  }
  const context = parts.length
    ? ['', 'ATTACHED FILES (use them as source material for the request):', '', parts.join('\n\n')].join('\n')
    : '';
  const note = images.length
    ? `\n\nATTACHED IMAGES: ${images.map((i) => i.name).join(', ')} - use what they show as source material.`
    : '';
  return { context: context + note, images };
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64e6, ...opts });
  if (r.error) throw r.error;
  return r.stdout || '';
}
const unzipPart = (file, part) => zipReadText(file, part);
function unXml(t) {
  return String(t || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function xlsxText(file) {
  let names = [];
  try {
    const wb = unzipPart(file, 'xl/workbook.xml');
    names = [...wb.matchAll(/<sheet[^>]*\sname="([^"]*)"/g)].map((m) => unXml(m[1]));
  } catch (e) { /* fall through to numbered sheets */ }
  let shared = [];
  try {
    const sx = unzipPart(file, 'xl/sharedStrings.xml');
    shared = [...sx.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      unXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  } catch (e) { /* no shared strings */ }
  const colIndex = (ref) => {
    let n = 0;
    for (const ch of ref) {
      if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
      else break;
    }
    return n - 1;
  };
  const out = [];
  for (let i = 1; i <= Math.max(1, names.length || 1) + 30; i++) {
    let xml;
    try { xml = unzipPart(file, 'xl/worksheets/sheet' + i + '.xml'); }
    catch (e) { break; }
    if (!xml) break;
    const lines = [];
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] || '', inner = c[2] || '';
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || '';
        const type = (attrs.match(/t="(\w+)"/) || [])[1] || '';
        let v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
        if (type === 's') v = shared[Number(v)] || '';
        else if (type === 'inlineStr') v = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('');
        else v = unXml(v);
        const idx = ref ? colIndex(ref) : cells.length;
        while (cells.length < idx) cells.push('');
        cells.push(String(v).replace(/\t/g, ' '));
      }
      if (cells.some((c) => c !== '')) lines.push(cells.join('\t'));
    }
    if (lines.length) {
      out.push('=== Sheet: ' + (names[i - 1] || 'Sheet' + i) + ' (tab-separated) ===\n' + lines.join('\n'));
    }
    if (names.length && i >= names.length) break;
  }
  if (!out.length) throw new Error('no readable sheets found in the workbook');
  return out.join('\n\n');
}

function pptxText(file) {
  const slides = zipList(file)
    .filter((l) => /^ppt\/slides\/slide\d+\.xml$/.test(l))
    .sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)));
  if (!slides.length) throw new Error('no slides found in the deck');
  const grab = (xml) => [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
    .map((par) => unXml([...par[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => t[1]).join('')))
    .filter((t) => t.trim()).join('\n');
  return slides.map((rel, i) => {
    const n = i + 1;
    let block = '=== Slide ' + n + ' ===\n' + grab(unzipPart(file, rel));
    try {
      const notes = grab(unzipPart(file, 'ppt/notesSlides/notesSlide' + n + '.xml'))
        .split('\n').filter((l) => l.trim() && l.trim() !== String(n)).join('\n');
      if (notes) block += '\n--- speaker notes ---\n' + notes;
    } catch (e) { /* no notes */ }
    return block;
  }).join('\n\n');
}

// Returns { content } for extracted text, or { selfRead: true } when the AI
// backend can read the file itself (the Claude CLI's Read tool parses PDFs
// directly). Other providers, and public mode, get PDF and DOCX through npm
// packages instead - loaded with a dynamic import so local mode
// (zero npm dependencies) never has to have them installed.
async function extractFile(file, ext) {
  if (ext === '.pdf') {
    if (!ai.capabilities.readsLocalFiles) {
      const { default: pdfParse } = await import('pdf-parse');
      const data = await pdfParse(fs.readFileSync(file));
      if (!data.text.trim()) throw new Error('pdf-parse could not read this file');
      return { content: data.text };
    }
    return { selfRead: true };
  }
  if (['.txt', '.md', '.csv', '.tsv', '.html', '.htm'].includes(ext)) {
    return { content: fs.readFileSync(file, 'utf8') };
  }
  if (ext === '.docx') {
    if (MODE === 'public') {
      const { default: mammoth } = await import('mammoth');
      const result = await mammoth.convertToHtml({ buffer: fs.readFileSync(file) });
      if (!result.value.trim()) throw new Error('mammoth could not read this file');
      return { content: result.value };
    }
    const html = run('textutil', ['-convert', 'html', '-stdout', file]);
    if (!html.trim()) throw new Error('textutil could not read this file');
    return { content: html };
  }
  if (['.doc', '.rtf', '.rtfd', '.odt'].includes(ext)) {
    if (MODE === 'public') {
      throw new Error('This file type is not supported in the public demo. Please use PDF, DOCX, PPTX, XLSX, TXT, CSV or MD.');
    }
    const html = run('textutil', ['-convert', 'html', '-stdout', file]);
    if (!html.trim()) throw new Error('textutil could not read this file');
    return { content: html };
  }
  if (ext === '.xlsx') return { content: xlsxText(file) };
  if (ext === '.pptx') return { content: pptxText(file) };
  throw new Error('unsupported file type ' + ext);
}

const CONVERT_MAX = 250000;

function convertPrompt(filename, extracted, filePath) {
  return [
    'Convert this file into clean Markdown.',
    '',
    'If you have a skill named "file-to-markdown", invoke it FIRST and follow it.',
    'Otherwise follow these rules exactly:',
    '* FIDELITY: preserve every piece of real content verbatim - never summarize,',
    '  paraphrase, reorder or drop content. Add nothing: no preamble, no commentary,',
    '  no questions, no documentation sections.',
    '* STRUCTURE: real headings (including bold standalone lines acting as headings)',
    '  -> #/##/### with a sane hierarchy; fake bullets ("\u2022", "1)") -> proper Markdown',
    '  lists; tables -> Markdown tables; links -> [text](url).',
    '* STRIP JUNK: page headers/footers, page numbers, generated tables of contents,',
    '  empty spacer paragraphs, slide-number footers, template boilerplate, encoding',
    '  artifacts. When unsure whether something is junk, KEEP it.',
    '* Unrepresentable objects (charts, images) -> an inline note like *[chart: title]*.',
    '* Start with a single # title: the document\'s own title, else the filename.',
    '* Tab-separated sheet blocks are spreadsheet data: one "## Sheet name" section per',
    '  sheet, each block of rows as a Markdown table (first row as header when it',
    '  plainly is one). Slide blocks: one "## <slide title or Slide N>" per slide;',
    '  substantive speaker notes -> a "> Notes:" blockquote.',
    '',
    'Filename: ' + filename,
    '',
    extracted.selfRead
      ? 'Read the file yourself at this exact path, then convert it: ' + filePath
      : '=== EXTRACTED CONTENT ===\n\n' + extracted.content,
  ].join('\n');
}

/* ------------------------------------------------------------ mdcheck
   markdown-it (CommonMark + GFM tables) powers the output check. Loaded
   dynamically, like mammoth and pdf-parse: without it installed, documents
   simply go out unchecked. */
let markdownIt = null;
try {
  const { default: MarkdownIt } = await import('markdown-it');
  markdownIt = new MarkdownIt({ html: true });
} catch (e) { /* not installed - check skipped */ }

/* -------------------------------------------------------------------- ai */

/* Every vendor-specific detail lives in ./ai/ behind one interface - see
   ai/index.mjs. ILOVEMD_AI_PROVIDER picks the backend. */
let ai;
try {
  ai = createAIService({ mode: MODE, here: HERE, dataDir: DATA_DIR, systemPrompt: SYSTEM_PROMPT });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let aiStatus = { available: false, detail: 'not checked' };

// Resolves true when AI is usable; otherwise answers 503 itself.
async function ensureAI(res) {
  if (aiStatus.available) return true;
  aiStatus = await ai.check();
  if (aiStatus.available) return true;
  sendJson(res, 503, { error: aiStatus.detail, explain: ai.explain(aiStatus.detail) });
  return false;
}

function limitError(message, explain, retryAfterSec) {
  const err = new Error(message);
  err.explain = explain;
  err.limited = true;
  err.retryAfterSec = retryAfterSec;
  return err;
}

// Public mode's limits apply before any provider is called, whichever route
// asked: per visitor, per network address, a site-wide daily cap, and a cap
// on calls in flight at once.
async function runAI(prompt, req, opts) {
  if (MODE !== 'public') return ai.generate(prompt, opts);

  const checks = [
    ['ai:v:' + visitor().id, RATE_LIMIT_PER_HOUR, 36e5,
      'You have reached the hourly limit for AI requests.', `Each visitor can make ${RATE_LIMIT_PER_HOUR} AI requests an hour.`],
    ['ai:ip:' + clientIp(req), IP_RATE_LIMIT_PER_HOUR, 36e5,
      'Too many AI requests from this network.', 'Several people on your network are using ilovemd at once.'],
    ['ai:day', MAX_CALLS_PER_DAY, 864e5,
      'ilovemd has reached its AI limit for today.', 'It resets at midnight UTC - please try again tomorrow.'],
  ];
  for (const [key, limit, windowMs, message, explain] of checks) {
    const r = await limiter.take(key, limit, windowMs);
    if (!r.ok) {
      const mins = Math.ceil(r.retryAfterSec / 60);
      throw limitError(message, explain + (windowMs < 864e5 ? ` Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` : ''), r.retryAfterSec);
    }
  }

  const release = aiGate.tryEnter();
  if (!release) throw limitError('ilovemd is busy right now.', 'Too many documents are being written at once - try again in a few seconds.', 5);
  try { return await ai.generate(prompt, opts); }
  finally { release(); }
}

/* ------------------------------------------------------------ templates
   Ready-made Markdown files in ./templates/ (ILOVEMD_TEMPLATES_DIR to point
   elsewhere), the same for every visitor and read-only. Optional front
   matter feeds the templates page:

     ---
     title: Product requirements
     description: One line on what it is for.
     category: Product
     icon: 📋
     tags: planning, specs
     order: 1
     ---

   Without it, the first # heading and first paragraph stand in. The front
   matter is stripped from what visitors copy or download. */
const TEMPLATES_DIR = process.env.ILOVEMD_TEMPLATES_DIR
  ? path.resolve(process.env.ILOVEMD_TEMPLATES_DIR) : path.join(HERE, 'templates');
const TEMPLATE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

function parseTemplate(slug, raw) {
  let body = raw.replace(/^\uFEFF/, '');
  const meta = {};
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
    body = body.slice(fm[0].length);
  }
  const plain = (t) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  const h1 = body.match(/^#\s+(.+)$/m);
  const para = body.split(/\r?\n\s*\r?\n/).map((b) => b.trim())
    .find((b) => b && !/^(#|[-*+]\s|\d+[.)]\s|\||>|```|<!--)/.test(b));
  return {
    slug,
    title: meta.title || (h1 ? plain(h1[1]) : slug.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())),
    description: meta.description || (para ? plain(para).slice(0, 240) : ''),
    category: meta.category || 'General',
    icon: meta.icon || '',
    tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    order: Number(meta.order) || 999,
    sections: (body.match(/^##\s+/gm) || []).length,
    words: (body.trim().match(/\S+/g) || []).length,
    markdown: body.replace(/^\s*\n/, ''),
  };
}

/* Design MDs: brand / design-system context files in templates/Design
   systems/, any file name ("Apple DESIGN.md"). They list under the "Design
   MD" pill. Their slug is derived from the file name ("design--apple") and
   resolved by scanning the folder - a client never supplies a path. */
const DESIGN_DIR = path.join(TEMPLATES_DIR, 'Design systems');
const DESIGN_PREFIX = 'design--';
function designSlug(name) {
  return DESIGN_PREFIX + name.replace(/\.md$/i, '').replace(/[\s._-]*design$/i, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function designFiles() {
  try { return fs.readdirSync(DESIGN_DIR).filter((n) => n.toLowerCase().endsWith('.md')); }
  catch (e) { return []; }
}
function readDesign(slug) {
  const file = designFiles().find((n) => designSlug(n) === slug);
  if (!file) return null;
  let raw;
  try { raw = fs.readFileSync(path.join(DESIGN_DIR, file), 'utf8'); } catch (e) { return null; }
  const t = parseTemplate(slug, raw);
  // "**Brand character:** ..." / "**Surface type:** ..." describe a DESIGN.md better than its first paragraph
  const field = (k) => { const m = t.markdown.match(new RegExp('^\\*\\*' + k + ':\\*\\*\\s*(.+)$', 'mi')); return m ? m[1].replace(/[*_`]/g, '').trim() : ''; };
  const character = field('Brand character');
  if (character && !/^description\s*:/im.test(raw)) t.description = character.slice(0, 240);
  const surface = field('Surface type');
  if (surface && !t.tags.length) t.tags = [surface];
  t.category = 'Design MD';
  t.group = 'design';
  return t;
}

function readTemplate(slug) {
  if (!TEMPLATE_SLUG.test(slug)) return null;
  if (slug.startsWith(DESIGN_PREFIX)) return readDesign(slug);
  try {
    const t = parseTemplate(slug, fs.readFileSync(path.join(TEMPLATES_DIR, slug + '.md'), 'utf8'));
    t.group = 'md';
    return t;
  } catch (e) { return null; }
}

function listTemplates() {
  let names = [];
  try { names = fs.readdirSync(TEMPLATES_DIR); } catch (e) { return []; }
  const md = names.filter((n) => n.toLowerCase().endsWith('.md')).map((n) => readTemplate(n.slice(0, -3)));
  const design = designFiles().map((n) => readDesign(designSlug(n)));
  return md.concat(design)
    .filter(Boolean)
    .sort((a, b) => (a.group === b.group ? 0 : a.group === 'md' ? -1 : 1) || a.order - b.order || a.title.localeCompare(b.title))
    .map(({ markdown, order, ...card }) => card);
}

/* --------------------------------------------------------------- routing */

/* Public mode: work out who is asking, then handle the request inside their
   scope so every file helper sees only their folder. */
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (MODE !== 'public') return handle(req, res);
  const secure = req.headers['x-forwarded-proto'] === 'https';
  const who = identity.identify(req, res, parseCookies(req), { secure });
  // Only requests that write anything mark a visitor as active, so a page
  // view (or a crawler) never keeps a folder alive on its own.
  if (req.method !== 'GET' && req.method !== 'HEAD') userData.touch(who.id);
  return requestScope.run({ visitor: who, space: userData.spaceFor(who.id) }, () => handle(req, res));
});

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;

  try {
    // For the host's health checks: no gate, no scope, no disk.
    if (route === '/healthz') return sendJson(res, 200, { ok: true, build: BUILD });

    /* ---- optional public-mode password gate ----
       Only when ILOVEMD_GATE_PASSWORD is set. Local mode never has one. */
    const isLoginRoute = route === '/login' || route === '/login.html' || route === '/api/login';
    if (MODE === 'public' && !GATE_PASSWORD && isLoginRoute) {
      if (route === '/api/login') return sendJson(res, 404, { error: 'this site has no password' });
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    if (MODE === 'public' && GATE_PASSWORD && !isLoginRoute) {
      const authed = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
      if (!authed) {
        if (route.startsWith('/api/')) return sendJson(res, 401, { error: 'sign in required' });
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
    }

    if (route === '/login' || route === '/login.html') {
      const html = fs.readFileSync(path.join(HERE, 'login.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (route === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const given = Buffer.from(String(body.password || ''));
      const expected = Buffer.from(GATE_PASSWORD);
      const ok = GATE_PASSWORD.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
      if (!ok) return sendJson(res, 401, { error: 'wrong password' });
      const token = makeSessionToken();
      // Behind the host's HTTPS proxy, keep the cookie off plain-HTTP requests.
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      addCookie(res, `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`);
      return sendJson(res, 200, { ok: true });
    }

    if (route === '/api/logout' && req.method === 'POST') {
      addCookie(res, `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
      return sendJson(res, 200, { ok: true });
    }

    /* ---- homepage ---- */
    if (route === '/' || route === '/index.html' || route === '/home.html') {
      const html = fs.readFileSync(path.join(HERE, 'home.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    /* ---- the unified workspace: /text, /ui, /figma ---- */
    if (route === '/templates') {
      const html = fs.readFileSync(path.join(HERE, 'templates.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (route === '/api/templates' && req.method === 'GET') {
      return sendJson(res, 200, { templates: listTemplates() });
    }

    if (route === '/api/template' && req.method === 'GET') {
      const t = readTemplate(String(url.searchParams.get('slug') || ''));
      if (!t) return sendJson(res, 404, { error: 'no such template' });
      return sendJson(res, 200, { slug: t.slug, title: t.title, markdown: t.markdown });
    }

    if (route === '/compare') {
      const html = fs.readFileSync(path.join(HERE, 'compare.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (route === '/text' || route === '/ui' || route === '/figma' || route === '/convert' || route === '/shell.html') {
      const html = fs.readFileSync(path.join(HERE, 'shell.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    // The old single-page editor moved into the unified shell.
    if (route === '/app' || route === '/app.html') {
      res.writeHead(302, { Location: '/text' });
      return res.end();
    }

    if (route === '/api/state' && req.method === 'GET') {
      const s = readState();
      // Report only folders that still exist; a moved folder should not wedge the UI.
      return sendJson(res, 200, {
        importDir: realDir(s.importDir) || null,
        kit: s.kit || null,
        frames: Array.isArray(s.frames) ? s.frames : [],
      });
    }

    if (route === '/api/state' && req.method === 'PUT') {
      const body = await readBody(req);
      const patch = {};
      if (typeof body.kit === 'string' && body.kit.length < 80) patch.kit = body.kit;
      // Public mode has no native folder picker - the upload flow sets the
      // workspace folder it just populated as the active import dir instead.
      // realDir() already confines this to the workspace root in public mode.
      if (typeof body.importDir === 'string') {
        const dir = realDir(body.importDir);
        if (dir) patch.importDir = dir;
      }
      if (Object.keys(patch).length) writeState(patch);
      return sendJson(res, 200, { ok: true });
    }

    /* ---- design-system kits under the chosen folder ---- */
    if (route === '/api/kits' && req.method === 'GET') {
      const dir = realDir(url.searchParams.get('dir') || readState().importDir);
      if (!dir) return sendJson(res, 400, { error: 'no component folder chosen' });
      const { root, kits } = discoverKits(dir);
      // Normalize the remembered folder to the detected root, so ".../global-kit/
      // components" picked once keeps working after kits appear around it.
      if (root !== readState().importDir) writeState({ importDir: root });
      return sendJson(res, 200, {
        root,
        kits: kits.map((k) => ({ id: k.id, label: k.label })),
        kit: readState().kit || null,
      });
    }

    /* ---- recent figma frames ---- */
    if (route === '/api/frame' && req.method === 'POST') {
      const body = await readBody(req);
      const rawUrl = String(body.url || '').trim();
      if (!/^https:\/\/(www\.)?figma\.com\//.test(rawUrl)) {
        return sendJson(res, 400, { error: 'That does not look like a Figma link.' });
      }
      const s = readState();
      const frames = (Array.isArray(s.frames) ? s.frames : []).filter((f) => f.url !== rawUrl);
      frames.unshift({ url: rawUrl, name: String(body.name || 'Figma frame').slice(0, 80), ts: Date.now() });
      writeState({ frames: frames.slice(0, 20) });
      return sendJson(res, 200, { frames: frames.slice(0, 20) });
    }


    /* Browser upload: the file is copied into ./.uploads so extraction (and,
       for PDFs, the CLI's own Read) happens on a file inside this folder. */
    if (route === '/api/upload' && req.method === 'POST') {
      const raw = path.basename(String(url.searchParams.get('name') || 'upload'));
      const ext = path.extname(raw).toLowerCase();
      if (!CONVERT_EXT.has(ext) && !IMAGE_TYPES[ext]) {
        return sendJson(res, 400, { error: "This file type isn't supported for this workflow." });
      }
      let buf;
      try { buf = await readRawBody(req, IMAGE_TYPES[ext] ? IMAGE_MAX : 30e6); }
      catch (e) { return sendJson(res, 413, { error: 'File is too large (30 MB max).' }); }
      if (!buf.length) return sendJson(res, 400, { error: 'empty upload' });
      if (MODE === 'public') {
        const r = await limiter.take('upload:' + visitor().id, UPLOADS_PER_HOUR, 36e5);
        if (!r.ok) return sendJson(res, 429, { error: 'Too many uploads - please wait a little and try again.' });
      }
      const UPLOADS = space().uploadsDir;
      fs.mkdirSync(UPLOADS, { recursive: true });
      // Best-effort sweep of stale uploads.
      try {
        for (const f of fs.readdirSync(UPLOADS)) {
          const fp = path.join(UPLOADS, f);
          if (Date.now() - fs.statSync(fp).mtimeMs > 864e5) fs.unlinkSync(fp);
        }
      } catch (e) { /* cosmetic */ }
      const safe = raw.replace(/[^\w .()+&-]/g, '_');
      const file = path.join(UPLOADS, Date.now() + '-' + safe);
      fs.writeFileSync(file, buf);
      return sendJson(res, 200, { path: file, size: buf.length });
    }

    /* Public mode's replacement for the native folder picker: the browser's
       <input webkitdirectory> gives one File per picked file, each carrying
       its own relative path - the client uploads them one at a time here and
       we reconstruct the folder tree under the confined workspace root. No
       zip/multipart parsing needed. */
    if (route === '/api/kit-upload' && req.method === 'POST' && MODE === 'public') {
      const kit = String(url.searchParams.get('kit') || 'kit').replace(/[^A-Za-z0-9 _-]/g, '_').slice(0, 60) || 'kit';
      const relParts = String(url.searchParams.get('relpath') || '')
        .split('/').filter((p) => p && p !== '.' && p !== '..');
      if (!relParts.length) return sendJson(res, 400, { error: 'bad relative path' });
      const ext = path.extname(relParts[relParts.length - 1]).toLowerCase();
      if (!SRC_EXT.has(ext)) return sendJson(res, 400, { error: 'only .html/.htm/.css files are accepted' });
      const lim = await limiter.take('kitfile:' + visitor().id, KIT_FILES_PER_HOUR, 36e5);
      if (!lim.ok) return sendJson(res, 429, { error: `Kit uploads are limited to ${KIT_FILES_PER_HOUR} files an hour.` });
      let buf;
      try { buf = await readRawBody(req, 5e6); }
      catch (e) { return sendJson(res, 413, { error: 'file too large (5 MB max)' }); }
      const kitDir = path.join(space().workspaceDir, kit);
      const dest = path.join(kitDir, ...relParts);
      if (dest !== kitDir && !dest.startsWith(kitDir + path.sep)) {
        return sendJson(res, 400, { error: 'bad path' });
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return sendJson(res, 200, { ok: true, dir: kitDir });
    }

    if (route === '/api/convert' && req.method === 'POST') {
      const body = await readBody(req);
      const file = path.resolve(String(body.path || ''));
      // Public mode converts only what this visitor uploaded - never any other
      // path on the server's disk.
      if (MODE === 'public') {
        const up = space().uploadsDir;
        if (!file.startsWith(up + path.sep)) return sendJson(res, 400, { error: 'file not found' });
      }
      let st;
      try { st = fs.statSync(file); } catch (e) { return sendJson(res, 400, { error: 'file not found' }); }
      if (!st.isFile()) return sendJson(res, 400, { error: 'not a file' });
      if (st.size > 25e6) return sendJson(res, 400, { error: 'file is too large (25 MB max)' });
      const ext = path.extname(file).toLowerCase();
      if (!CONVERT_EXT.has(ext)) {
        return sendJson(res, 400, { error: "This file type isn't supported for this workflow." });
      }

      let extracted;
      try { extracted = await extractFile(file, ext); }
      catch (e) { return sendJson(res, 400, { error: 'Could not read the file: ' + e.message }); }
      let truncated = false;
      if (extracted.content && extracted.content.length > CONVERT_MAX) {
        extracted.content = extracted.content.slice(0, CONVERT_MAX);
        truncated = true;
      }

      if (!(await ensureAI(res))) return;

      const started = Date.now();
      process.stdout.write(`ai  convert: ${path.basename(file)} ... `);
      // A path inside this folder is given to the CLI relative to its cwd, so
      // its Read tool needs no extra permissions.
      const rel = path.relative(HERE, file);
      const readable = rel && !rel.startsWith('..') ? rel : file;
      try {
        const r = await runAI(convertPrompt(path.basename(file), extracted, readable), req);
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars`);
        const split = extractQuestions(r.text); // converters ask nothing; strip any stray section
        let md = split.markdown;
        if (truncated) md += '\n\n> **Note:** the source file was larger than this converter\'s limit; the tail was not converted.\n';
        return sendJson(res, 200, {
          markdown: md, ms, check: split.check,
          suggestedName: nameFromMarkdown(md, path.basename(file, ext)).replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        console.log('failed');
        return sendJson(res, e.limited ? 429 : 502, { error: e.message, explain: e.explain || '' });
      }
    }

    if (route === '/api/pick-folder' && req.method === 'POST') {
      if (MODE === 'public') return sendJson(res, 404, { error: 'not available in this deployment' });
      const body = await readBody(req);
      const r = await pickFolder(body.prompt);
      if (r.error) return sendJson(res, 500, { error: r.error });
      if (r.canceled) return sendJson(res, 200, { canceled: true });
      const key = body.for === 'output' ? 'outputDir' : 'importDir';
      writeState({ [key]: r.path });
      return sendJson(res, 200, { path: r.path });
    }

    if (route === '/api/components' && req.method === 'GET') {
      const dir = realDir(url.searchParams.get('dir') || readState().importDir);
      if (!dir) return sendJson(res, 400, { error: 'no component folder chosen' });
      const disc = discoverKits(dir);
      // A kit-style repo (Alloy layout) keeps the design-system dropdown flow.
      const kitStyle = disc.kits.some((k) => k.id === 'global') || disc.kits.length > 1;
      if (kitStyle) {
        const kitId = url.searchParams.get('kit') || '';
        const { root, kit, components } = kitComponents(dir, kitId);
        return sendJson(res, 200, {
          mode: 'kits', dir: root, kit: kit.id,
          components: components.map((c) => ({ name: c.name, html: c.html, css: c.css })),
        });
      }
      // Anything else: segregate into pages / templates / sections / components.
      return sendJson(res, 200, { mode: 'groups', dir: disc.root, groups: classifyRepo(disc.root) });
    }

    if (route === '/api/component' && req.method === 'GET') {
      const dir = realDir(url.searchParams.get('dir') || readState().importDir);
      if (!dir) return sendJson(res, 400, { error: 'no component folder chosen' });
      const name = String(url.searchParams.get('name') || '');
      const kitId = url.searchParams.get('kit');
      const where = kitId != null ? resolveComponentDir(dir, kitId, name) : dir;
      const src = where ? componentSource(where, name) : null;
      if (!src) return sendJson(res, 404, { error: 'no such component' });
      return sendJson(res, 200, src);
    }

    if (route === '/api/component-doc' && req.method === 'POST') {
      const body = await readBody(req);
      const dir = realDir(body.dir || readState().importDir);
      if (!dir) return sendJson(res, 400, { error: 'no component folder chosen' });
      let src = null;
      if (body.uid) {
        src = unitSource(detectKitRoot(dir), String(body.uid));
      } else {
        const where = body.kit != null ? resolveComponentDir(dir, String(body.kit), String(body.name || '')) : dir;
        src = where ? componentSource(where, String(body.name || '')) : null;
      }
      if (!src) return sendJson(res, 404, { error: 'no such component' });
      if (!src.files.some((f) => f.content.trim())) {
        return sendJson(res, 400, { error: 'Please provide at least one HTML or CSS file with content.' });
      }

      if (!(await ensureAI(res))) return;

      const started = Date.now();
      process.stdout.write(`ai  component: ${src.name} (${src.files.length} files) ... `);
      try {
        const r = await runAI(src.type ? unitPrompt(src) : componentPrompt(src), req);
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars  via ${r.strategy}`);
        const split = extractQuestions(r.text);
        return sendJson(res, 200, {
          markdown: split.markdown, questions: split.questions, check: split.check, ms,
          suggestedName: nameFromMarkdown(split.markdown, src.name).replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        console.log('failed');
        if (e.tried) for (const t of e.tried) console.log(`      ${t.form}: ${t.why}`);
        return sendJson(res, e.limited ? 429 : 502, {
          error: e.message,
          explain: e.explain || '',
          tried: (e.tried || []).map((t) => `${t.form}: ${t.why}`),
        });
      }
    }

    /* ---- figma frame -> md ----
       Local mode: the CLI may have Figma access through its own MCP
       configuration. We ask it to use the REAL data or say plainly it cannot.
       Public mode: no CLI and no MCP - Figma's REST API instead. A visitor
       documents their own file with their own personal access token, used
       for that one request and never stored, so nobody can reach a design
       their own Figma account cannot. Without a token, the optional fixed
       demo file (FIGMA_TOKEN + ILOVEMD_DEMO_FIGMA_KEY) is the owner's. */
    if (route === '/api/figma-doc' && req.method === 'POST' && MODE === 'public') {
      const body = await readBody(req);
      const rawUrl = String(body.url || '').trim();
      const token = String(body.token || '').trim();
      const useDemo = !rawUrl && !token;
      if (useDemo && (!FIGMA_TOKEN || !DEMO_FIGMA_KEY)) {
        return sendJson(res, 400, { error: 'Paste a Figma link and your Figma access token.' });
      }
      if (!useDemo) {
        if (!/^https:\/\/(www\.)?figma\.com\//.test(rawUrl) || !parseFigmaUrl(rawUrl).key) {
          return sendJson(res, 400, { error: 'That does not look like a Figma file link.',
            explain: 'In Figma, use Share → Copy link, or right-click a frame → Copy link to selection.' });
        }
        if (!/^\S{20,200}$/.test(token)) {
          return sendJson(res, 400, { error: 'Paste your Figma personal access token.',
            explain: 'Figma → Settings → Security → Personal access tokens → Generate new token.' });
        }
      }
      if (!(await ensureAI(res))) return;
      const started = Date.now();
      process.stdout.write(useDemo ? 'ai  figma demo ... ' : 'ai  figma(rest) ... ');
      try {
        let name, summary;
        if (useDemo) {
          const data = await fetchFigmaFile(DEMO_FIGMA_KEY, FIGMA_TOKEN);
          name = data.name || 'Demo file';
          summary = summarizeFigmaFile(data);
        } else {
          ({ name, summary } = await fetchFigmaForVisitor(rawUrl, token));
        }
        const r = await runAI(figmaDemoPrompt(summary, name), req);
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars`);
        const h1 = r.text.match(/^#\s+(.+)$/m);
        if (h1 && rawUrl) {
          const s = readState();
          const frames = (Array.isArray(s.frames) ? s.frames : []).map((f) =>
            f.url === rawUrl ? { ...f, name: h1[1].trim().slice(0, 80) } : f);
          writeState({ frames });
        }
        const split = extractQuestions(r.text);
        return sendJson(res, 200, {
          markdown: split.markdown, questions: split.questions, check: split.check, ms,
          suggestedName: nameFromMarkdown(split.markdown, name).replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        console.log('failed');
        return sendJson(res, e.limited ? 429 : e.figma ? 400 : 502, { error: e.message, explain: e.explain || '' });
      }
    }

    if (route === '/api/figma-doc' && req.method === 'POST') {
      const body = await readBody(req);
      const rawUrl = String(body.url || '').trim();
      if (!/^https:\/\/(www\.)?figma\.com\//.test(rawUrl)) {
        return sendJson(res, 400, { error: 'That does not look like a Figma link.' });
      }

      if (!(await ensureAI(res))) return;

      /* Preferred path: the Figma desktop app's local MCP server. It needs no
         org tool approval and no access token, and it hands us the real node
         tree in well under a second - so we retrieve the data ourselves and
         leave the model with just the writing to do. */
      try {
        const started = Date.now();
        process.stdout.write(`ai  figma(local): ${rawUrl.slice(0, 50)} ... `);
        const data = await fetchFigmaViaLocalMcp(rawUrl);
        const r = await runAI(figmaLocalPrompt(data, rawUrl), req);
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars`);

        const h1 = r.text.match(/^#\s+(.+)$/m);
        if (h1) {
          const s = readState();
          const frames = (Array.isArray(s.frames) ? s.frames : []).map((f) =>
            f.url === rawUrl ? { ...f, name: h1[1].trim().slice(0, 80) } : f);
          writeState({ frames });
        }
        const split = extractQuestions(r.text);
        return sendJson(res, 200, {
          markdown: split.markdown, questions: split.questions, check: split.check, ms,
          suggestedName: nameFromMarkdown(split.markdown, 'Figma component').replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        if (e.limited) {
          console.log('rate limited');
          return sendJson(res, 429, { error: e.message, explain: e.explain || '' });
        }
        // Desktop app closed, Dev Mode server off, or a bad link: fall through
        // to the CLI's own Figma MCP, which may still be configured.
        const why = /fetch failed|ECONNREFUSED|timed out|aborted|Figma MCP/i.test(e.message)
          ? 'local Figma MCP unreachable'
          : e.message;
        // Only the Claude CLI has MCP tools to fall back on.
        if (!ai.capabilities.mcpTools) {
          console.log(why);
          return sendJson(res, 502, {
            error: "We couldn't reach Figma.",
            explain: 'Open the Figma desktop app, open the file, and turn on ' +
              'Preferences → Enable local MCP server. ilovemd talks to that server ' +
              'directly on 127.0.0.1:3845 (' + why + ').',
          });
        }
        console.log(`${why} - trying CLI MCP`);
      }

      const prompt = [
        'MCP servers connect in the background when this session starts, so Figma tools may',
        'not be registered yet. Before concluding Figma is unavailable, wait about 5 seconds',
        '(for example by reasoning through the task) and check again - do not give up instantly.',
        '',
        'If you have Figma access through MCP tools (for example the official Figma MCP server),',
        'retrieve the design at this URL and write component documentation in Markdown from the',
        'REAL retrieved data.',
        '',
        'If you have a skill named "design-system-docs", invoke it and follow its',
        'draft-then-ask methodology; this is a non-interactive run, so unanswerable',
        'sections are marked "Needs review" and questions go in a final "Open questions"',
        'section - number each question, and where you can, offer 1-3 short plausible',
        'answers as indented "-" bullets beneath it.',
        '',
        'URL: ' + rawUrl,
        '',
        'Map the Figma data into sections: component description -> Overview, layers ->',
        'Anatomy, variants -> Variants, component properties -> Properties, variables and',
        'styles -> Design Tokens. Also use States, Sizes, Behavior, Usage, Accessibility,',
        'Do, Don\'t, Examples, Notes - but ONLY where the retrieved data supports them.',
        'Never invent properties, variants, tokens or behavior that the data does not show.',
        'Preserve exact names of components, properties, variants and variables.',
        '',
        'If you have NO way to retrieve Figma data (no Figma tools available, not',
        'authenticated, or this URL cannot be fetched), reply with exactly one line:',
        'FIGMA_UNAVAILABLE: <short reason>',
      ].join('\n');

      const started = Date.now();
      process.stdout.write(`ai  figma: ${rawUrl.slice(0, 60)} ... `);
      try {
        // A freshly-spawned CLI process reconnects to its MCP servers from
        // scratch every time, and that handshake sometimes hasn't finished
        // by the time the model would otherwise give up and report the tool
        // unavailable - retrying a couple of times (fresh process each time)
        // measurably improves success odds rather than failing on what's
        // often just a slow-to-connect MCP server, not a real unavailability.
        let r = await runAI(prompt, req);
        for (let retry = 0; retry < 3 && /^\s*FIGMA_UNAVAILABLE\s*:/i.test(r.text); retry++) {
          process.stdout.write('retrying (mcp still connecting?) ... ');
          await new Promise((done) => setTimeout(done, 2000));
          r = await runAI(prompt, req);
        }
        const ms = Date.now() - started;
        if (/^\s*FIGMA_UNAVAILABLE\s*:/i.test(r.text)) {
          console.log('unavailable');
          return sendJson(res, 502, {
            error: "We couldn't reach Figma.",
            explain: 'Open the Figma desktop app, open the file, and turn on ' +
              'Preferences → Enable local MCP server. ilovemd talks to that server ' +
              'directly on 127.0.0.1:3845, which needs no access token and no ' +
              'admin approval. The fallback through Claude Code\'s own Figma ' +
              'connection also failed (' +
              r.text.replace(/^\s*FIGMA_UNAVAILABLE\s*:\s*/i, '').trim().slice(0, 160) +
              ') - that path can be blocked by an organization tool policy.',
          });
        }
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars`);
        // Remember the frame under the name the document gave it.
        const h1 = r.text.match(/^#\s+(.+)$/m);
        if (h1) {
          const s = readState();
          const frames = (Array.isArray(s.frames) ? s.frames : []).map((f) =>
            f.url === rawUrl ? { ...f, name: h1[1].trim().slice(0, 80) } : f);
          writeState({ frames });
        }
        const split = extractQuestions(r.text);
        return sendJson(res, 200, {
          markdown: split.markdown, questions: split.questions, check: split.check, ms,
          suggestedName: nameFromMarkdown(split.markdown, 'Figma component').replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        console.log('failed');
        return sendJson(res, 502, { error: e.message, explain: e.explain || '' });
      }
    }

    /* Generated docs always land in ./documents. Component docs go one level
       deeper, in a folder named after the design system they belong to. */
    if (route === '/api/save-out' && req.method === 'POST') {
      const body = await readBody(req);
      const name = safeName(body.name);
      if (!name) return sendJson(res, 400, { error: 'bad document name' });
      if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
        return sendJson(res, 400, { error: 'nothing to save' });
      }
      const DOCS = space().docsDir;
      let dir = DOCS;
      const sub = String(body.subdir || '').trim();
      if (sub) {
        if (!/^[A-Za-z0-9][A-Za-z0-9 _()&+-]{0,59}$/.test(sub)) {
          return sendJson(res, 400, { error: 'bad folder name' });
        }
        dir = path.join(DOCS, sub);
      }
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, name);
      const tmp = file + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, body.markdown);
      fs.renameSync(tmp, file);
      console.log(`saved  ${file}  ${body.markdown.length} bytes`);
      return sendJson(res, 200, { name, dir, path: file });
    }

    /* ---- what is working, in plain English ---- */
    if (route === '/api/setup') {
      aiStatus = await ai.check();
      return sendJson(res, 200, {
        build: BUILD,
        mode: MODE,
        figmaDemo: MODE === 'public' ? !!(FIGMA_TOKEN && DEMO_FIGMA_KEY) : null,
        // Whether visitors must type a password before using the site.
        gate: MODE === 'public' && !!GATE_PASSWORD,
        // Server paths are the local developer's business, not a visitor's.
        documentsDir: MODE === 'public' ? null : space().docsDir,
        documents: listDocs().length,
        ai: { ...aiStatus, ...ai.describe() },
      });
    }

    if (route === '/api/ai/diagnose') {
      // Real API calls cost money; the public demo does not expose this.
      if (MODE === 'public') return sendJson(res, 404, { error: 'not available in this deployment' });
      const d = await ai.diagnose();
      console.log('diagnose: working forms -> ' + (d.working.join(', ') || 'none'));
      return sendJson(res, 200, { build: BUILD, provider: ai.id, version: aiStatus.detail, ...d });
    }

    /* ---- documents ---- */
    if (route === '/api/docs' && req.method === 'GET') {
      return sendJson(res, 200, { dir: MODE === 'public' ? null : space().docsDir, docs: listDocs() });
    }

    if (route === '/api/doc' && req.method === 'GET') {
      const name = safeName(url.searchParams.get('name'));
      if (!name) return sendJson(res, 400, { error: 'bad document name' });
      try {
        const st = fs.statSync(docPath(name));
        return sendJson(res, 200, {
          name, markdown: fs.readFileSync(docPath(name), 'utf8'), mtime: st.mtimeMs,
        });
      } catch (e) { return sendJson(res, 404, { error: 'no such document' }); }
    }

    if (route === '/api/doc' && req.method === 'PUT') {
      const body = await readBody(req);
      const name = safeName(body.name);
      if (!name) return sendJson(res, 400, { error: 'bad document name' });
      if (typeof body.markdown !== 'string') return sendJson(res, 400, { error: 'markdown must be a string' });

      // Refuse to overwrite a file that changed underneath, unless told to win.
      let onDisk = 0;
      try { onDisk = fs.statSync(docPath(name)).mtimeMs; } catch (e) { /* new file */ }
      if (body.force !== true && body.baseMtime != null && onDisk && Math.abs(onDisk - body.baseMtime) > 1) {
        return sendJson(res, 409, {
          error: 'changed on disk since you loaded it',
          mtime: onDisk, markdown: fs.readFileSync(docPath(name), 'utf8'),
        });
      }
      const mtime = writeDoc(name, body.markdown);
      console.log(`saved  ${name}  ${body.markdown.length} bytes`);
      return sendJson(res, 200, { name, mtime });
    }

    if (route === '/api/doc' && req.method === 'DELETE') {
      const body = await readBody(req);
      const name = safeName(body.name);
      if (!name) return sendJson(res, 400, { error: 'bad document name' });
      try { fs.unlinkSync(docPath(name)); } catch (e) { /* already gone */ }
      console.log(`deleted  ${name}`);
      return sendJson(res, 200, { ok: true });
    }

    if (route === '/api/rename' && req.method === 'POST') {
      const body = await readBody(req);
      const from = safeName(body.from), to = safeName(body.to);
      if (!from || !to) return sendJson(res, 400, { error: 'bad document name' });
      if (!fs.existsSync(docPath(from))) return sendJson(res, 404, { error: 'no such document' });
      if (fs.existsSync(docPath(to))) return sendJson(res, 409, { error: 'a document with that name already exists' });
      fs.renameSync(docPath(from), docPath(to));
      return sendJson(res, 200, { name: to });
    }

    /* ---- the prompt bar ---- */
    if (route === '/api/ai' && req.method === 'POST') {
      const body = await readBody(req);
      const instruction = String(body.instruction || '').trim();
      if (!instruction) return sendJson(res, 400, { error: 'say what you want' });

      if (!(await ensureAI(res))) return;

      const current = typeof body.markdown === 'string' ? body.markdown : '';

      let attached;
      try { attached = await readAttachments(body.attachments); }
      catch (e) { return sendJson(res, e.status || 400, { error: e.message, explain: e.explain || '' }); }
      const aiOpts = { images: attached.images };

      /* mode "ask": a question ABOUT the document. The answer goes to the chat,
         not into the editor, so the document-shaped system rules are overridden
         for this one reply. */
      if (body.mode === 'ask') {
        const askPrompt = [
          'For THIS reply only, ignore any rule about returning a full Markdown document',
          'with a level-one heading. Answer the question below briefly, in plain text',
          '(a few sentences or a short list). Do not rewrite the document.',
          '',
          'QUESTION:', '"""', instruction.slice(0, 6000), '"""', '',
          'THE DOCUMENT BEING DISCUSSED:', '"""', current.slice(0, 200000), '"""',
        ].join('\n') + attached.context;
        const t0 = Date.now();
        process.stdout.write(`ai  ask: ${instruction.slice(0, 48)} ... `);
        try {
          const r = await runAI(askPrompt, req, aiOpts);
          console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
          return sendJson(res, 200, { answer: r.text, ms: Date.now() - t0 });
        } catch (e) {
          console.log('failed');
          return sendJson(res, e.limited ? 429 : 502, { error: e.message, explain: e.explain || '' });
        }
      }

      const editing = body.mode === 'edit' && current.trim();

      const prompt = editing
        ? [
            'Revise the Markdown document below according to the instruction.',
            '',
            'INSTRUCTION:', '"""', instruction.slice(0, 6000), '"""', '',
            'CURRENT DOCUMENT:', '"""', current.slice(0, 200000), '"""', '',
            'Return the COMPLETE revised document. Preserve everything the instruction does not',
            'ask you to change, including wording you were not asked to touch.',
          ].join('\n') + attached.context
        : [
            'Write a new Markdown document for this request:',
            '', '"""', instruction.slice(0, 6000), '"""',
          ].join('\n') + attached.context;

      const started = Date.now();
      process.stdout.write(`ai  ${editing ? 'edit' : 'new'}: ${instruction.slice(0, 48)}${body.attachments && body.attachments.length ? ` +${body.attachments.length} file(s)` : ''} ... `);
      try {
        const r = await runAI(prompt, req, aiOpts);
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars  via ${r.strategy}`);
        // A new document gets a filename from its own H1.
        const suggested = editing ? null : nameFromMarkdown(r.text, instruction);
        const split = extractQuestions(r.text);
        return sendJson(res, 200, { markdown: split.markdown, questions: split.questions, check: split.check, ms, strategy: r.strategy, suggestedName: suggested });
      } catch (e) {
        console.log('failed');
        if (e.tried) for (const t of e.tried) console.log(`      ${t.form}: ${t.why}`);
        return sendJson(res, e.limited ? 429 : 502, {
          error: e.message,
          explain: e.explain || '',
          tried: (e.tried || []).map((t) => `${t.form}: ${t.why}`),
        });
      }
    }

    /* ---- compare AI chat ---- */
    if (route === '/api/compare-ai' && req.method === 'POST') {
      const body = await readBody(req);
      const instruction = String(body.instruction || '').trim();
      const a = String(body.a || '').slice(0, 150000);
      const b = String(body.b || '').slice(0, 150000);
      const nameA = String(body.nameA || 'File A').slice(0, 80);
      const nameB = String(body.nameB || 'File B').slice(0, 80);
      if (!instruction) return sendJson(res, 400, { error: 'say what you want' });

      if (!(await ensureAI(res))) return;

      const prompt = [
        'You are reviewing two Markdown documents and helping the user improve them.',
        'Below are the two files. Answer the user\'s question or request.',
        '',
        'Rules:',
        '* If the user asks which is better, explain why clearly and concisely.',
        '* If the user asks you to improve or rewrite one file, return the full improved',
        '  Markdown wrapped in a fenced code block tagged with either UPDATED_A or UPDATED_B',
        '  like this:',
        '  ```UPDATED_A',
        '  ...full improved content...',
        '  ```',
        '* Only wrap updated content in the fence — keep your explanation outside it.',
        '* "AI-readable" means: clear headings, concise purpose statements, explicit variant',
        '  names and states. Avoid ambiguous pronouns and implicit context.',
        '',
        '--- ' + nameA + ' ---',
        a || '(empty)',
        '',
        '--- ' + nameB + ' ---',
        b || '(empty)',
        '',
        'USER REQUEST: ' + instruction,
      ].join('\n');

      process.stdout.write(`ai  compare: ${instruction.slice(0, 48)} ... `);
      const t0 = Date.now();
      try {
        const r = await runAI(prompt, req);
        console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
        // Extract any UPDATED_A or UPDATED_B blocks
        const rxA = /```UPDATED_A\r?\n([\s\S]*?)```/;
        const rxB = /```UPDATED_B\r?\n([\s\S]*?)```/;
        const mA = r.text.match(rxA);
        const mB = r.text.match(rxB);
        const clean = r.text.replace(rxA, '').replace(rxB, '').replace(/\n{3,}/g, '\n\n').trim();
        return sendJson(res, 200, {
          answer: clean,
          updatedA: mA ? mA[1].trimEnd() : null,
          updatedB: mB ? mB[1].trimEnd() : null,
          ms: Date.now() - t0,
        });
      } catch (e) {
        console.log('failed');
        return sendJson(res, e.limited ? 429 : 502, { error: e.message, explain: e.explain || '' });
      }
    }

    if (route.startsWith('/api/')) return sendJson(res, 404, { error: 'no such route' });

    // The editor's live CommonMark check runs the same parser as the server.
    if (route === '/vendor/markdown-it.min.js') {
      try {
        const buf = fs.readFileSync(path.join(HERE, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js'));
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });
        return res.end(buf);
      } catch (e) { return sendJson(res, 404, { error: 'markdown-it is not installed' }); }
    }

    // Some clients ask for /favicon.ico regardless of <link rel="icon">.
    if (route === '/favicon.ico') {
      const buf = fs.readFileSync(path.join(HERE, 'favicon.svg'));
      res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });
      return res.end(buf);
    }

    /* ---- static assets: an allowlist, never "any file in this folder" ----
       This folder also holds server code, .git, a possible .env or
       .anthropic-key, and (public mode) users/ - none of which a browser may
       read. Pages are served by their own routes above. */
    const rel = decodeURIComponent(route).replace(/^\/+/, '');
    if (!PUBLIC_FILES.has(rel)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    const target = path.join(HERE, rel);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    // Video is streamed and honours Range requests - browsers seek with them,
    // and Safari will not play an mp4 from a server that ignores them.
    if (path.extname(target).toLowerCase() === '.mp4') {
      const size = fs.statSync(target).size;
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      const head = { 'Content-Type': MIME['.mp4'], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(200, { ...head, 'Content-Length': size });
        return fs.createReadStream(target).pipe(res);
      }
      let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(target, { start, end }).pipe(res);
    }
    const buf = fs.readFileSync(target);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length, 'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    console.error(e);
    if (route.startsWith('/api/')) return sendJson(res, 500, { error: e.message });
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 ' + e.message);
  }
}

/* ------------------------------------------------------------------ boot */

if (MODE === 'public') {
  fs.mkdirSync(userData.usersDir, { recursive: true });
  // Drop visitor folders idle past ILOVEMD_USER_DATA_DAYS, now and every 6 hours.
  const sweep = () => {
    const n = userData.sweep();
    if (n) console.log(`swept ${n} idle visitor folder${n === 1 ? '' : 's'}`);
  };
  sweep();
  setInterval(sweep, 6 * 3600e3).unref();
} else {
  fs.mkdirSync(DOCS, { recursive: true });
}
aiStatus = await ai.check();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ilovemd' + (MODE === 'public' ? '  (public mode)' : ''));
  console.log('  http://' + HOST + ':' + PORT + '           homepage');
  console.log('  http://' + HOST + ':' + PORT + '/text      workspace');
  console.log('');
  console.log('  build      ' + BUILD);
  if (MODE === 'local') console.log('  documents  ' + DOCS + '   (' + listDocs().length + ' files)');
  const d = ai.describe();
  console.log('  ai         ' + d.label + ' via ' + ai.id + ' - ' + d.model + (aiStatus.available ? '' : '  (unavailable: ' + aiStatus.detail + ')'));
  if (MODE === 'public') {
    console.log('  access     ' + (GATE_PASSWORD ? 'password-gated' : 'open to everyone'));
    console.log('  user data  ' + userData.usersDir + '   (idle folders kept ' + USER_DATA_DAYS + ' days)');
    console.log('  limits     ' + RATE_LIMIT_PER_HOUR + '/hour per visitor, ' + IP_RATE_LIMIT_PER_HOUR + '/hour per address, ' +
      MAX_CALLS_PER_DAY + '/day site-wide, ' + MAX_CONCURRENT_AI + ' at once');
    console.log('  figma demo ' + (FIGMA_TOKEN && DEMO_FIGMA_KEY ? 'configured' : 'not configured'));
  } else if (ai.id === 'claude-cli' && !aiStatus.available) {
    for (const line of aiStatus.searched || []) console.log('             tried ' + line);
    console.log('             If Claude Code IS installed, run `which claude` and start with:');
    console.log('               ILOVEMD_AI_CMD=/full/path/to/claude node server.mjs');
    console.log('             Or use an API instead: ILOVEMD_AI_PROVIDER=gemini GEMINI_API_KEY=... node server.mjs');
  }
  console.log('');
  console.log('  Editing and saving work regardless of the prompt bar.');
  console.log('  Stop the server with Control-C.');
  console.log('');
});

// Hosts stop the old process on every deploy with SIGTERM: finish the requests
// in flight (an AI call can take a while), then exit.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => {
    console.log(`${sig}: finishing open requests, then exiting`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 25000).unref();
  });
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try:  PORT=7788 node server.mjs`);
    process.exit(1);
  }
  throw e;
});
