#!/usr/bin/env node
/* ======================================================================
   ilovemd - anything to Markdown. A local converter with Claude in the editor.

     node server.mjs        ->  http://127.0.0.1:7777   (homepage)
                                http://127.0.0.1:7777/app  (the editor)

   Documents live in ./documents/ as plain .md files. Nothing is hidden in a
   database or in browser storage: what you see in the app is what is on disk.

   File reading and writing go through NODE, not the browser's File System
   Access API. That is deliberate - it means no Chrome-only restriction, no
   permission prompts, no folder to re-connect after a restart. Save just works.

   The prompt bar calls POST /api/ai, which shells out to the Claude Code CLI,
   so there is no API key in this folder or in the browser. It reuses whatever
   auth `claude` already has.

   Loopback only. Nothing here is reachable from the network.
   ====================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
  : path.join(HERE, 'documents');

const PORT = Number(process.env.PORT || 7777);
const HOST = '127.0.0.1';
const BUILD = 'ilovemd-1';

/* Finding the CLI. `claude` on PATH is the normal case, but a GUI-launched
   process does not always inherit a login shell's PATH, and the installer puts
   the binary in different places depending on how it was installed. So: if the
   bare name is not runnable, look in the known locations before giving up. */
const HOME = process.env.HOME || '';
const CLI_CANDIDATES = [
  path.join(HOME, '.claude', 'local', 'claude'),
  path.join(HOME, '.local', 'bin', 'claude'),
  path.join(HOME, '.bun', 'bin', 'claude'),
  path.join(HOME, '.npm-global', 'bin', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  '/usr/bin/claude',
];

/* Optional escape hatch from OAuth. The CLI accepts ANTHROPIC_API_KEY and
   prefers it over its stored sign-in, so a key makes the prompt bar work even
   when the OAuth token has been revoked. Put the key in a file next to this
   server rather than exporting it every time.

   The file is read once at startup and passed only to the child process - it is
   never sent to the browser and never appears in an API response. */
const KEY_FILE = path.join(HERE, '.anthropic-key');
function readKeyFile() {
  try {
    const raw = fs.readFileSync(KEY_FILE, 'utf8').trim();
    // Ignore a placeholder or a commented-out line.
    if (!raw || raw.startsWith('#')) return '';
    return raw.split('\n')[0].trim();
  } catch (e) { return ''; }
}

const AI = {
  command: process.env.ILOVEMD_AI_CMD || 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY || readKeyFile(),
  resolvedFrom: 'PATH',
  model: process.env.ILOVEMD_AI_MODEL || '',
  timeoutMs: Number(process.env.ILOVEMD_AI_TIMEOUT || 300000),
  pinned: process.env.ILOVEMD_AI_STRATEGY || '',
  winner: null,
};

/* How the CLI wants to be called varies by version, and two things vary
   independently: how the prompt is delivered, and which flags are accepted. So
   all four combinations are tried and the one that answers is kept. stdin is a
   real /dev/null for the argument forms, which is what stops the CLI waiting
   and warning "no stdin data received in 3s". */
const STRATEGIES = [
  { name: 'argv', note: 'full flags, prompt as trailing argument', flags: 'full', deliver: 'argv' },
  { name: 'bare-argv', note: 'only -p, prompt as trailing argument', flags: 'none', deliver: 'argv' },
  { name: 'stdin', note: 'full flags, prompt piped on stdin', flags: 'full', deliver: 'stdin' },
  { name: 'bare-stdin', note: 'only -p, prompt piped on stdin', flags: 'none', deliver: 'stdin' },
];

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

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
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

const docPath = (name) => path.join(DOCS, name);

function listDocs() {
  fs.mkdirSync(DOCS, { recursive: true });
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
  fs.mkdirSync(DOCS, { recursive: true });
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
const STATE_FILE = path.join(HERE, '.ilovemd-state.json');
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {}; }
  catch (e) { return {}; }
}
function writeState(patch) {
  const s = { ...readState(), ...patch };
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
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

/* The generator is asked to END with an "## Open questions" section so the
   clarification flow has material - but questions never belong in the saved
   document. This splits them out and cleans the markdown. */
function extractQuestions(md) {
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

/* ----------------------------------------------------- file conversion
   The converters are fidelity-first: a deterministic extraction layer gets the
   raw content out of the file, then one Claude pass (guided by the
   file-to-markdown skill) cleans junk and repairs structure - never rewriting
   or summarizing the author's words. */

const UPLOADS = path.join(HERE, '.uploads');

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

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64e6, ...opts });
  if (r.error) throw r.error;
  return r.stdout || '';
}
const unzipPart = (file, part) => run('unzip', ['-p', file, part]);
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
  const listing = run('unzip', ['-Z1', file]);
  const slides = listing.split('\n')
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

// Returns { content } for extracted text, or { selfRead: true } when the CLI
// should read the file itself (PDF - the CLI's Read tool parses those).
function extractFile(file, ext) {
  if (ext === '.pdf') return { selfRead: true };
  if (['.txt', '.md', '.csv', '.tsv', '.html', '.htm'].includes(ext)) {
    return { content: fs.readFileSync(file, 'utf8') };
  }
  if (['.docx', '.doc', '.rtf', '.rtfd', '.odt'].includes(ext)) {
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

/* -------------------------------------------------------------------- ai */

let aiStatus = { available: false, detail: 'not checked', command: AI.command, model: AI.model || 'CLI default' };

// Try one specific command. Resolves { ok, detail }.
function tryVersion(cmd) {
  return new Promise((done) => {
    let p;
    try {
      p = spawn(cmd, ['--version'], {
        cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'],
        env: AI.apiKey ? { ...process.env, ANTHROPIC_API_KEY: AI.apiKey } : process.env,
      });
    } catch (e) {
      return done({ ok: false, detail: e.message });
    }
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); done({ ok: false, detail: 'timed out' }); }, 20000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); done({ ok: false, detail: e.code === 'ENOENT' ? 'not found' : e.message }); });
    p.on('close', (code) => {
      clearTimeout(timer);
      done(code === 0
        ? { ok: true, detail: out.trim() || 'ready' }
        : { ok: false, detail: (err.trim().split('\n')[0] || `exited ${code}`) });
    });
  });
}

async function checkAI() {
  // The configured name first, then the usual install locations.
  const tries = [{ cmd: AI.command, from: 'PATH' }];
  if (!process.env.ILOVEMD_AI_CMD) {
    for (const p of CLI_CANDIDATES) {
      if (fs.existsSync(p)) tries.push({ cmd: p, from: p });
    }
  }

  const notes = [];
  for (const t of tries) {
    const r = await tryVersion(t.cmd);
    if (r.ok) {
      AI.command = t.cmd;
      AI.resolvedFrom = t.from;
      return {
        available: true, detail: r.detail, command: t.cmd,
        resolvedFrom: t.from, model: AI.model || 'CLI default',
        searched: notes,
      };
    }
    notes.push(`${t.cmd}: ${r.detail}`);
  }

  return {
    available: false,
    detail: notes[0] || 'not found',
    command: AI.command,
    resolvedFrom: null,
    model: AI.model || 'CLI default',
    searched: notes,
    // Where we looked, so "not found" is checkable rather than mysterious.
    looked: tries.map((t) => t.cmd),
    pathSeen: (process.env.PATH || '').split(':'),
  };
}

function attempt(strategy, prompt, timeoutMs) {
  return new Promise((done, fail) => {
    const full = strategy.flags === 'full';
    const args = ['-p'];
    if (full) {
      args.push('--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch');
      args.push('--append-system-prompt', SYSTEM_PROMPT);
      if (AI.model) args.push('--model', AI.model);
    }
    // Without --append-system-prompt the rules have to ride inside the prompt.
    const body = full ? prompt : SYSTEM_PROMPT + '\n\n---\n\n' + prompt;
    const viaStdin = strategy.deliver === 'stdin';
    if (!viaStdin) args.push(body);

    const reject = (msg, extra) => { const e = new Error(msg); Object.assign(e, extra || {}); fail(e); };

    let p;
    try {
      p = spawn(AI.command, args, {
        cwd: HERE,
        stdio: [viaStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        // A key, when present, takes precedence over the CLI's stored sign-in.
        env: AI.apiKey ? { ...process.env, ANTHROPIC_API_KEY: AI.apiKey } : process.env,
      });
    } catch (e) { return reject(`spawn failed: ${e.message}`); }

    if (viaStdin) {
      p.stdin.on('error', () => {});
      p.stdin.end(body);
    }

    let out = '', err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(`timed out after ${Math.round(timeoutMs / 1000)}s`);
    }, timeoutMs);

    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); reject(`cannot run \`${AI.command}\`: ${e.message}`); });
    p.on('close', (code) => {
      clearTimeout(timer);
      const first = (s) => s.trim().split('\n').filter(Boolean)[0] || '';
      let text = out.trim();
      // Both streams matter: this CLI reports some failures on stdout.
      if (code !== 0) {
        return reject(`exit ${code}: ${first(err) || first(out) || 'no output'}`,
          { code, stdout: out.trim(), stderr: err.trim() });
      }
      const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
      if (fenced) text = fenced[1].trim();
      if (!text) return reject(`exit 0 but printed nothing${first(err) ? ': ' + first(err) : ''}`,
        { code, stdout: '', stderr: err.trim() });

      // Exit 0 is not proof of success with this CLI.
      const status = cliStatusMessage(text);
      if (status) return reject(status + '  CLI said: "' + text.slice(0, 120) + '"',
        { code, stdout: text, stderr: err.trim(), status: true });

      done({ text, stderr: err.trim() });
    });
  });
}

const ARGV_SAFE = 120000;

function ordered(prompt) {
  let list = STRATEGIES;
  if (AI.pinned) {
    const only = STRATEGIES.filter((s) => s.name === AI.pinned);
    if (only.length) return only;
  }
  if (AI.winner) list = [AI.winner, ...list.filter((s) => s !== AI.winner)];
  if (prompt.length > ARGV_SAFE) {
    const ok = list.filter((s) => s.deliver === 'stdin');
    if (ok.length) list = ok;
  }
  return list;
}

/* The CLI reports some conditions by printing a one-line status to STDOUT and
   exiting 0 - "Not logged in · Please run /login" is the important one. Taken at
   face value that becomes the document, so a signed-out CLI would silently save
   a file containing its own error message. Verified against Claude Code 2.1.234.

   Only short, structureless output is judged: a real document opens with a
   heading and runs to hundreds of characters, so a genuine article that happens
   to discuss logging in is not mistaken for a status line. */
const CLI_STATUS = [
  [/not logged in|please run\s*\/login|\/login\b/i, 'Claude Code is not signed in.'],
  // Observed verbatim from 2.1.234: "Failed to authenticate. API Error: 401
  // OAuth access token has been revoked." A revoked or expired token is a
  // different condition from never having signed in, and needs saying so.
  [/token has been revoked|token .{0,20}revoked|revoked/i, 'Claude Code\'s saved sign-in has been revoked. It needs signing in again.'],
  [/failed to authenticate|\b401\b|\b403\b|oauth/i, 'Claude Code could not authenticate. Its sign-in has expired or been withdrawn.'],
  [/invalid api key|unauthor|not authenticated|authentication (failed|required)/i, 'Claude Code rejected the credentials it has.'],
  [/usage limit|rate limit|quota|credit balance|billing/i, 'The Claude account has hit a usage or billing limit.'],
  [/do you trust|trust this (folder|directory)|not a trusted/i, 'Claude Code needs this folder trusted first.'],
  [/onboard|welcome to claude code|select a theme|first run/i, 'Claude Code has not finished its first-run setup.'],
  [/no conversation found|session .* not found/i, 'Claude Code could not start a session.'],
];

function cliStatusMessage(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const structured = /^#{1,6}\s/m.test(t) || t.length > 500;
  if (structured) return null;
  for (const [re, why] of CLI_STATUS) if (re.test(t)) return why;
  return null;
}

// Plain-English cause, so the app can tell the user what to do instead of
// showing them a CLI exit code.
function explain(blob) {
  const t = String(blob || '').toLowerCase();
  if (/revoked|expired|\b401\b|\b403\b/.test(t)) {
    return 'Claude Code\'s saved sign-in has been REVOKED or expired. Open Terminal and run `claude` on its own, type `/login` inside it, sign in, quit, then reload this page.';
  }
  if (/log ?in|logged in|unauthor|authenticat|api key|credential|\/login/.test(t)) {
    return 'Claude Code is installed but NOT SIGNED IN. Open Terminal and run `claude` on its own, type `/login` inside it, complete the sign-in, quit, then reload this page.';
  }
  if (/trust|do you trust|not a trusted/.test(t)) {
    return 'Claude Code wants this folder trusted first. Open Terminal, run `cd ~/ilovemd && claude`, accept the trust prompt, then try again.';
  }
  if (/onboard|welcome|first run|theme|select a theme/.test(t)) {
    return 'Claude Code has not finished its first-run setup. Open Terminal, run `claude`, complete the setup, then try again.';
  }
  if (/rate limit|quota|credit|billing|usage limit/.test(t)) {
    return 'The Claude account this CLI uses has hit a usage or billing limit.';
  }
  if (/unknown option|unrecognized|invalid option|unexpected argument/.test(t)) {
    return 'This CLI version rejected some options. The simpler fallback forms should have handled it - if you are seeing this, report the diagnose output.';
  }
  if (/not found|enoent|not on path/.test(t)) {
    return 'Claude Code is not installed, or not on PATH. Install it, or set an Anthropic API key instead.';
  }
  return '';
}

async function runAI(prompt) {
  const tried = [];
  for (const s of ordered(prompt)) {
    const budget = tried.length === 0 ? AI.timeoutMs : Math.min(AI.timeoutMs, 120000);
    try {
      const r = await attempt(s, prompt, budget);
      if (AI.winner !== s) {
        AI.winner = s;
        console.log(`ai  invocation form: ${s.name} (${s.note})`);
      }
      return { text: r.text, strategy: s.name };
    } catch (e) {
      tried.push({ form: s.name, why: e.message, stdout: e.stdout || '', stderr: e.stderr || '' });
    }
  }
  const err = new Error('Claude could not be run');
  err.tried = tried;
  err.explain = explain(tried.map((t) => t.why + ' ' + t.stdout + ' ' + t.stderr).join(' '));
  throw err;
}

/* --------------------------------------------------------------- routing */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;

  try {
    /* ---- homepage ---- */
    if (route === '/' || route === '/index.html' || route === '/home.html') {
      const html = fs.readFileSync(path.join(HERE, 'home.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    /* ---- the unified workspace: /text, /ui, /figma ---- */
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

    if (route === '/api/pick-file' && req.method === 'POST') {
      const body = await readBody(req);
      const script = [
        'tell application "System Events"',
        'activate',
        'set f to choose file with prompt "' + String(body.prompt || 'Choose a file').replace(/[\\"]/g, '\\$&') + '"',
        'end tell',
        'POSIX path of f',
      ].join('\n');
      const r = await new Promise((done) => {
        let p2;
        try { p2 = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] }); }
        catch (e) { return done({ error: e.message }); }
        let out = '', err = '';
        const timer = setTimeout(() => { p2.kill('SIGKILL'); done({ canceled: true }); }, 180000);
        p2.stdout.on('data', (d) => (out += d));
        p2.stderr.on('data', (d) => (err += d));
        p2.on('error', (e) => { clearTimeout(timer); done({ error: e.message }); });
        p2.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0 && out.trim()) return done({ path: out.trim() });
          if (/cancel/i.test(err)) return done({ canceled: true });
          done({ error: err.trim() || ('osascript exited ' + code) });
        });
      });
      if (r.error) return sendJson(res, 500, { error: r.error });
      if (r.canceled) return sendJson(res, 200, { canceled: true });
      return sendJson(res, 200, { path: r.path });
    }

    /* Browser upload: the file is copied into ./.uploads so extraction (and,
       for PDFs, the CLI's own Read) happens on a file inside this folder. */
    if (route === '/api/upload' && req.method === 'POST') {
      const raw = path.basename(String(url.searchParams.get('name') || 'upload'));
      const ext = path.extname(raw).toLowerCase();
      if (!CONVERT_EXT.has(ext)) {
        return sendJson(res, 400, { error: "This file type isn't supported for this workflow." });
      }
      let buf;
      try { buf = await readRawBody(req, 30e6); }
      catch (e) { return sendJson(res, 413, { error: 'File is too large (30 MB max).' }); }
      if (!buf.length) return sendJson(res, 400, { error: 'empty upload' });
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

    if (route === '/api/convert' && req.method === 'POST') {
      const body = await readBody(req);
      const file = path.resolve(String(body.path || ''));
      let st;
      try { st = fs.statSync(file); } catch (e) { return sendJson(res, 400, { error: 'file not found' }); }
      if (!st.isFile()) return sendJson(res, 400, { error: 'not a file' });
      if (st.size > 25e6) return sendJson(res, 400, { error: 'file is too large (25 MB max)' });
      const ext = path.extname(file).toLowerCase();
      if (!CONVERT_EXT.has(ext)) {
        return sendJson(res, 400, { error: "This file type isn't supported for this workflow." });
      }

      let extracted;
      try { extracted = extractFile(file, ext); }
      catch (e) { return sendJson(res, 400, { error: 'Could not read the file: ' + e.message }); }
      let truncated = false;
      if (extracted.content && extracted.content.length > CONVERT_MAX) {
        extracted.content = extracted.content.slice(0, CONVERT_MAX);
        truncated = true;
      }

      if (!aiStatus.available) {
        aiStatus = await checkAI();
        if (!aiStatus.available) {
          return sendJson(res, 503, { error: aiStatus.detail, explain: explain(aiStatus.detail) });
        }
      }

      const started = Date.now();
      process.stdout.write(`ai  convert: ${path.basename(file)} ... `);
      // A path inside this folder is given to the CLI relative to its cwd, so
      // its Read tool needs no extra permissions.
      const rel = path.relative(HERE, file);
      const readable = rel && !rel.startsWith('..') ? rel : file;
      try {
        const r = await runAI(convertPrompt(path.basename(file), extracted, readable));
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars`);
        const split = extractQuestions(r.text); // converters ask nothing; strip any stray section
        let md = split.markdown;
        if (truncated) md += '\n\n> **Note:** the source file was larger than this converter\'s limit; the tail was not converted.\n';
        return sendJson(res, 200, {
          markdown: md, ms,
          suggestedName: nameFromMarkdown(md, path.basename(file, ext)).replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        console.log('failed');
        return sendJson(res, 502, { error: e.message, explain: e.explain || '' });
      }
    }

    if (route === '/api/pick-folder' && req.method === 'POST') {
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

      if (!aiStatus.available) {
        aiStatus = await checkAI();
        if (!aiStatus.available) {
          return sendJson(res, 503, { error: aiStatus.detail, explain: explain(aiStatus.detail) });
        }
      }

      const started = Date.now();
      process.stdout.write(`ai  component: ${src.name} (${src.files.length} files) ... `);
      try {
        const r = await runAI(src.type ? unitPrompt(src) : componentPrompt(src));
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars  via ${r.strategy}`);
        const split = extractQuestions(r.text);
        return sendJson(res, 200, {
          markdown: split.markdown, questions: split.questions, ms,
          suggestedName: nameFromMarkdown(split.markdown, src.name).replace(/ \d+\.md$/, '.md'),
        });
      } catch (e) {
        console.log('failed');
        if (e.tried) for (const t of e.tried) console.log(`      ${t.form}: ${t.why}`);
        return sendJson(res, 502, {
          error: e.message,
          explain: e.explain || '',
          tried: (e.tried || []).map((t) => `${t.form}: ${t.why}`),
        });
      }
    }

    /* ---- figma frame -> md ----
       The CLI may have Figma access through its own MCP configuration. We ask it
       to use the REAL data or to say plainly that it cannot - never to invent. */
    if (route === '/api/figma-doc' && req.method === 'POST') {
      const body = await readBody(req);
      const rawUrl = String(body.url || '').trim();
      if (!/^https:\/\/(www\.)?figma\.com\//.test(rawUrl)) {
        return sendJson(res, 400, { error: 'That does not look like a Figma link.' });
      }

      if (!aiStatus.available) {
        aiStatus = await checkAI();
        if (!aiStatus.available) {
          return sendJson(res, 503, { error: aiStatus.detail, explain: explain(aiStatus.detail) });
        }
      }

      const prompt = [
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
        const r = await runAI(prompt);
        const ms = Date.now() - started;
        if (/^\s*FIGMA_UNAVAILABLE\s*:/i.test(r.text)) {
          console.log('unavailable');
          return sendJson(res, 502, {
            error: "We couldn't connect to Figma.",
            explain: 'Claude Code has no working Figma access right now (' +
              r.text.replace(/^\s*FIGMA_UNAVAILABLE\s*:\s*/i, '').trim().slice(0, 200) +
              '). Add the Figma MCP server to Claude Code and sign in to it, then try again.',
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
          markdown: split.markdown, questions: split.questions, ms,
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
      aiStatus = await checkAI();
      return sendJson(res, 200, {
        build: BUILD,
        documentsDir: DOCS,
        documents: listDocs().length,
        ai: {
          ...aiStatus,
          strategy: AI.winner ? AI.winner.name : (AI.pinned || 'determined on first use'),
          // Whether a key is in play, never the key.
          auth: AI.apiKey ? 'API key' : 'the CLI\'s own sign-in',
          keyFile: KEY_FILE,
        },
      });
    }

    if (route === '/api/ai/diagnose') {
      const probe = 'Reply with exactly the word OK and nothing else.';
      const results = [];
      let blob = '';
      for (const s of STRATEGIES) {
        const t0 = Date.now();
        try {
          const r = await attempt(s, probe, 60000);
          results.push({ form: s.name, note: s.note, ok: true, ms: Date.now() - t0, stdout: r.text.slice(0, 300) });
        } catch (e) {
          results.push({
            form: s.name, note: s.note, ok: false, ms: Date.now() - t0,
            exitCode: e.code === undefined ? null : e.code,
            error: String(e.message).slice(0, 300),
            stdout: (e.stdout || '').slice(0, 600),
            stderr: (e.stderr || '').slice(0, 600),
          });
          blob += ' ' + (e.stdout || '') + ' ' + (e.stderr || '') + ' ' + e.message;
        }
      }
      const working = results.filter((r) => r.ok).map((r) => r.form);
      if (working.length) AI.winner = STRATEGIES.find((s) => s.name === working[0]);
      console.log('diagnose: working forms -> ' + (working.join(', ') || 'none'));
      return sendJson(res, 200, {
        build: BUILD, command: AI.command, version: aiStatus.detail,
        working, explain: working.length ? '' : explain(blob), results,
      });
    }

    /* ---- documents ---- */
    if (route === '/api/docs' && req.method === 'GET') {
      return sendJson(res, 200, { dir: DOCS, docs: listDocs() });
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

      if (!aiStatus.available) {
        aiStatus = await checkAI();
        if (!aiStatus.available) {
          return sendJson(res, 503, { error: aiStatus.detail, explain: explain(aiStatus.detail) });
        }
      }

      const current = typeof body.markdown === 'string' ? body.markdown : '';

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
        ].join('\n');
        const t0 = Date.now();
        process.stdout.write(`ai  ask: ${instruction.slice(0, 48)} ... `);
        try {
          const r = await runAI(askPrompt);
          console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
          return sendJson(res, 200, { answer: r.text, ms: Date.now() - t0 });
        } catch (e) {
          console.log('failed');
          return sendJson(res, 502, { error: e.message, explain: e.explain || '' });
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
          ].join('\n')
        : [
            'Write a new Markdown document for this request:',
            '', '"""', instruction.slice(0, 6000), '"""',
          ].join('\n');

      const started = Date.now();
      process.stdout.write(`ai  ${editing ? 'edit' : 'new'}: ${instruction.slice(0, 48)} ... `);
      try {
        const r = await runAI(prompt);
        const ms = Date.now() - started;
        console.log(`${(ms / 1000).toFixed(1)}s  ${r.text.length} chars  via ${r.strategy}`);
        // A new document gets a filename from its own H1.
        const suggested = editing ? null : nameFromMarkdown(r.text, instruction);
        const split = extractQuestions(r.text);
        return sendJson(res, 200, { markdown: split.markdown, questions: split.questions, ms, strategy: r.strategy, suggestedName: suggested });
      } catch (e) {
        console.log('failed');
        if (e.tried) for (const t of e.tried) console.log(`      ${t.form}: ${t.why}`);
        return sendJson(res, 502, {
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

      if (!aiStatus.available) {
        aiStatus = await checkAI();
        if (!aiStatus.available) return sendJson(res, 503, { error: aiStatus.detail, explain: explain(aiStatus.detail) });
      }

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
        const r = await runAI(prompt);
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
        return sendJson(res, 502, { error: e.message, explain: e.explain || '' });
      }
    }

    if (route.startsWith('/api/')) return sendJson(res, 404, { error: 'no such route' });

    /* ---- static assets from this folder only ---- */
    const rel = decodeURIComponent(route).replace(/^\/+/, '');
    const target = path.resolve(HERE, rel);
    if (!target.startsWith(HERE + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
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
});

/* ------------------------------------------------------------------ boot */

fs.mkdirSync(DOCS, { recursive: true });
aiStatus = await checkAI();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ilovemd');
  console.log('  http://' + HOST + ':' + PORT + '           homepage');
  console.log('  http://' + HOST + ':' + PORT + '/text      workspace');
  console.log('');
  console.log('  build      ' + BUILD);
  console.log('  documents  ' + DOCS + '   (' + listDocs().length + ' files)');
  console.log('  prompt bar ' + (aiStatus.available
    ? `${AI.command} - ${aiStatus.detail}` + (AI.model ? ' - model ' + AI.model : '') + '  (no API key needed)'
    : 'unavailable - the claude command could not be run'));
  if (!aiStatus.available) {
    for (const line of aiStatus.searched || []) console.log('             tried ' + line);
    console.log('             If Claude Code IS installed, run `which claude` and start with:');
    console.log('               ILOVEMD_AI_CMD=/full/path/to/claude node server.mjs');
  }
  console.log('');
  console.log('  Editing and saving work regardless of the prompt bar.');
  console.log('  Stop the server with Control-C.');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try:  PORT=7788 node server.mjs`);
    process.exit(1);
  }
  throw e;
});
