/* Any vendor that speaks the OpenAI Chat Completions format. Used for:
     grok    xAI      XAI_API_KEY      https://api.x.ai/v1
     openai  OpenAI   OPENAI_API_KEY   https://api.openai.com/v1
   ILOVEMD_AI_BASE_URL overrides the endpoint, for other compatible hosts. */

import { aiError, postJson, probeOnce, stripFence } from '../shared.mjs';

const VENDORS = {
  grok: { label: 'Grok', keyEnv: 'XAI_API_KEY', base: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  openai: { label: 'OpenAI', keyEnv: 'OPENAI_API_KEY', base: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
};

export function createOpenAICompatibleProvider(id, { env, systemPrompt, timeoutMs }) {
  const v = VENDORS[id];
  const apiKey = env[v.keyEnv] || '';
  const base = (env.ILOVEMD_AI_BASE_URL || v.base).replace(/\/+$/, '');
  const model = env.ILOVEMD_AI_MODEL || v.model;
  const maxTokens = Number(env.ILOVEMD_AI_MAX_TOKENS || 16000);

  // Vision: OpenAI's current chat models all take images; on xAI only the
  // vision and grok-4 models do.
  const images = id === 'openai' || /vision|grok-4/i.test(model);

  const provider = {
    id,
    label: v.label,
    capabilities: { readsLocalFiles: false, mcpTools: false, images },

    async check() {
      return {
        available: !!apiKey,
        detail: apiKey ? `${v.label} API key configured` : `${v.keyEnv} is not set`,
        command: `${v.label} API`, resolvedFrom: 'env', model, searched: [],
      };
    },

    async generate(prompt, opts) {
      const pics = (opts && opts.images) || [];
      const content = pics.length
        ? [{ type: 'text', text: prompt }].concat(pics.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })))
        : prompt;
      if (!apiKey) throw aiError(`No ${v.label} API key is configured on this server.`, `Set ${v.keyEnv} in the environment.`);
      const data = await postJson({
        url: base + '/chat/completions',
        headers: { authorization: 'Bearer ' + apiKey },
        body: {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }],
        },
        timeoutMs, label: v.label, host: new URL(base).host, keyEnv: v.keyEnv,
      });
      const choice = (data.choices || [])[0];
      const text = stripFence(choice && choice.message ? choice.message.content : '');
      if (!text) throw aiError(`${v.label} returned no text`, '');
      return { text, strategy: `${id}:${model}` };
    },

    explain: (blob) => (/not set|api key/i.test(String(blob)) ? `Set ${v.keyEnv} in the environment.` : ''),
    diagnose: () => probeOnce(provider),
    describe: () => ({ provider: id, label: v.label, model, auth: apiKey ? 'API key' : 'none' }),
  };
  return provider;
}
