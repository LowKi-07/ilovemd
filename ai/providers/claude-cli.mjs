/* Claude Code CLI (`claude -p`) - the original local-mode backend. Reuses
   whatever OAuth sign-in `claude` already has in the user's terminal, so no API
   key is needed. Local mode only: a public server has no CLI to shell out to.

   This is the only provider that can read files from disk itself (PDFs, via the
   CLI's Read tool) and reach MCP tools (the CLI's Figma connection). */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Set once by createClaudeCliProvider(); the code below predates the provider
// split and reads them as module state.
let HERE = '';
let SYSTEM_PROMPT = '';
let AI = null;

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

function attempt(strategy, prompt, timeoutMs) {
  return new Promise((done, fail) => {
    const full = strategy.flags === 'full';
    // Without --append-system-prompt the rules have to ride inside the prompt.
    const body = full ? prompt : SYSTEM_PROMPT + '\n\n---\n\n' + prompt;
    const viaStdin = strategy.deliver === 'stdin';

    const args = ['-p'];
    // For argv delivery, the prompt goes immediately after -p, before any
    // flags: --disallowedTools is variadic and swallows a trailing bare
    // token as one of its own values if nothing else follows it. Putting the
    // flags after the prompt sidesteps that regardless of which flags end up
    // adjacent to it (verified against Claude Code 2.1.153).
    if (!viaStdin) args.push(body);
    if (full) {
      args.push('--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch');
      // --disallowedTools alone hides MCP tools (e.g. Figma) from the model
      // entirely, not just the built-ins it names - re-including all MCP
      // servers explicitly is what actually restores their visibility
      // (verified against Claude Code 2.1.153).
      args.push('--allowedTools', 'mcp__*');
      args.push('--append-system-prompt', SYSTEM_PROMPT);
      if (AI.model) args.push('--model', AI.model);
    }

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


async function checkCli() {
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

async function runCli(prompt) {
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

async function diagnoseCli() {
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
  return { working, explain: working.length ? '' : explain(blob), results, command: AI.command };
}

export function createClaudeCliProvider({ env, here, systemPrompt, timeoutMs, apiKey, keyFile }) {
  HERE = here;
  SYSTEM_PROMPT = systemPrompt;
  AI = {
    command: env.ILOVEMD_AI_CMD || 'claude',
    // Optional escape hatch from OAuth: the CLI accepts ANTHROPIC_API_KEY and
    // prefers it over its stored sign-in. Passed only to the child process.
    apiKey,
    resolvedFrom: 'PATH',
    model: env.ILOVEMD_AI_MODEL || '',
    timeoutMs,
    pinned: env.ILOVEMD_AI_STRATEGY || '',
    winner: null,
  };
  return {
    id: 'claude-cli',
    label: 'Claude',
    capabilities: { readsLocalFiles: true, mcpTools: true, images: true },
    check: checkCli,
    // The CLI has no image upload; its Read tool opens image files instead.
    generate: (prompt, opts) => {
      const pics = (opts && opts.images) || [];
      if (!pics.length) return runCli(prompt);
      return runCli(prompt + '\n\nRead each attached image with your Read tool before answering:\n' +
        pics.map((i) => '- ' + (path.relative(HERE, i.path) || i.path)).join('\n'));
    },
    explain,
    diagnose: diagnoseCli,
    describe: () => ({
      provider: 'claude-cli', label: 'Claude', model: AI.model || 'CLI default', command: AI.command,
      strategy: AI.winner ? AI.winner.name : (AI.pinned || 'determined on first use'),
      // Whether a key is in play, never the key.
      auth: AI.apiKey ? 'API key' : 'the CLI\'s own sign-in',
      keyFile,
    }),
    get command() { return AI.command; },
    get model() { return AI.model; },
  };
}
