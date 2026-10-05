/* Anthropic Messages API, called directly with ANTHROPIC_API_KEY - no CLI. */

import { aiError, postJson, probeOnce, stripFence } from '../shared.mjs';

export function createAnthropicProvider({ env, systemPrompt, timeoutMs, apiKey }) {
  // A fixed, known-good snapshot by default - override with ILOVEMD_AI_MODEL
  // to point at whichever current model the deployment should use.
  const model = env.ILOVEMD_AI_MODEL || 'claude-3-5-sonnet-20241022';
  const maxTokens = Number(env.ILOVEMD_AI_MAX_TOKENS || 8000);

  const provider = {
    id: 'anthropic',
    label: 'Claude',
    capabilities: { readsLocalFiles: false, mcpTools: false, images: true },

    async check() {
      return {
        available: !!apiKey,
        detail: apiKey ? 'Anthropic API key configured' : 'ANTHROPIC_API_KEY is not set',
        command: 'Anthropic API', resolvedFrom: 'env', model, searched: [],
      };
    },

    async generate(prompt, opts) {
      const pics = (opts && opts.images) || [];
      const content = pics.length
        ? pics.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })).concat([{ type: 'text', text: prompt }])
        : prompt;
      if (!apiKey) throw aiError('No Anthropic API key is configured on this server.', 'Set ANTHROPIC_API_KEY in the environment.');
      const data = await postJson({
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: { model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content }] },
        timeoutMs, label: 'Anthropic', host: 'api.anthropic.com', keyEnv: 'ANTHROPIC_API_KEY',
      });
      const text = stripFence((data.content || []).map((b) => b.text || '').join(''));
      if (!text) throw aiError('Anthropic API returned no text', '');
      return { text, strategy: 'anthropic:' + model };
    },

    explain: (blob) => (/not set|api key/i.test(String(blob)) ? 'Set ANTHROPIC_API_KEY in the environment.' : ''),
    diagnose: () => probeOnce(provider),
    describe: () => ({ provider: 'anthropic', label: 'Claude', model, auth: apiKey ? 'API key' : 'none' }),
  };
  return provider;
}
