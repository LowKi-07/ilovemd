/* AIService - the one place server.mjs gets AI from. Every vendor-specific
   detail lives behind a provider in ./providers/; the server only ever calls
   the interface below, so switching vendors is an env var, not a code change.

   Provider interface:
     id, label                 'gemini', 'Gemini' ...
     capabilities              { readsLocalFiles, mcpTools, images } - what only some
                               backends can do (the Claude CLI reads PDFs and
                               reaches Figma through MCP; HTTP APIs cannot)
     check()       -> Promise<{ available, detail, model, ... }>
     generate(prompt, { images }) -> Promise<{ text, strategy }>; images are
                               [{ name, path, mime, data(base64) }], only sent
                               when capabilities.images; throws an Error carrying
                               a plain-English `explain` (and `tried` for the CLI)
     explain(text) -> string   plain-English cause for a failure blob
     diagnose()    -> Promise<{ working, results, explain }>
     describe()    -> object   safe to send to the browser - never a key

   Choosing one: ILOVEMD_AI_PROVIDER = claude-cli | anthropic | gemini | grok | openai.
   Unset, local mode uses claude-cli and public mode uses whichever API key is
   present, in the order gemini, grok, openai, anthropic. */

import fs from 'node:fs';
import path from 'node:path';
import { createClaudeCliProvider } from './providers/claude-cli.mjs';
import { createAnthropicProvider } from './providers/anthropic.mjs';
import { createGeminiProvider } from './providers/gemini.mjs';
import { createOpenAICompatibleProvider } from './providers/openai-compatible.mjs';

export const PROVIDERS = ['claude-cli', 'anthropic', 'gemini', 'grok', 'openai'];

// The Anthropic key can also live in a file next to the server, so it need not
// be exported every time. Read once; never sent to the browser.
function readKeyFile(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    // Ignore a placeholder or a commented-out line.
    if (!raw || raw.startsWith('#')) return '';
    return raw.split('\n')[0].trim();
  } catch (e) { return ''; }
}

function pickProvider(mode, env) {
  const asked = String(env.ILOVEMD_AI_PROVIDER || '').trim().toLowerCase();
  if (asked) {
    const id = asked === 'xai' ? 'grok' : asked === 'claude' ? 'anthropic' : asked;
    if (!PROVIDERS.includes(id)) throw new Error(`ILOVEMD_AI_PROVIDER="${asked}" is not one of: ${PROVIDERS.join(', ')}`);
    return id;
  }
  if (mode === 'local') return 'claude-cli';
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return 'gemini';
  if (env.XAI_API_KEY) return 'grok';
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'gemini'; // reports "GEMINI_API_KEY is not set" until one is
}

export function createAIService({ mode, here, dataDir, systemPrompt, env = process.env }) {
  const id = pickProvider(mode, env);
  if (mode === 'public' && id === 'claude-cli') {
    throw new Error('ILOVEMD_AI_PROVIDER=claude-cli is local-mode only - a public server has no Claude CLI. Use gemini, grok, openai or anthropic.');
  }
  const keyFile = path.join(dataDir || here, '.anthropic-key');
  const opts = {
    env, here, systemPrompt, keyFile,
    timeoutMs: Number(env.ILOVEMD_AI_TIMEOUT || 300000),
    apiKey: env.ANTHROPIC_API_KEY || readKeyFile(keyFile),
  };
  switch (id) {
    case 'claude-cli': return createClaudeCliProvider(opts);
    case 'anthropic': return createAnthropicProvider(opts);
    case 'gemini': return createGeminiProvider(opts);
    default: return createOpenAICompatibleProvider(id, opts);
  }
}
