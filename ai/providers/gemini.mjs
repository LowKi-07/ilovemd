/* Google Gemini via the Generative Language REST API.
   Key: GEMINI_API_KEY (or GOOGLE_API_KEY), from https://aistudio.google.com/apikey */

import { aiError, postJson, probeOnce, stripFence } from '../shared.mjs';

export function createGeminiProvider({ env, systemPrompt, timeoutMs }) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '';
  const model = env.ILOVEMD_AI_MODEL || 'gemini-2.5-flash';
  const maxTokens = Number(env.ILOVEMD_AI_MAX_TOKENS || 16000);

  const provider = {
    id: 'gemini',
    label: 'Gemini',
    capabilities: { readsLocalFiles: false, mcpTools: false },

    async check() {
      return {
        available: !!apiKey,
        detail: apiKey ? 'Gemini API key configured' : 'GEMINI_API_KEY is not set',
        command: 'Gemini API', resolvedFrom: 'env', model, searched: [],
      };
    },

    async generate(prompt) {
      if (!apiKey) throw aiError('No Gemini API key is configured on this server.', 'Set GEMINI_API_KEY in the environment.');
      const data = await postJson({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        body: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        },
        timeoutMs, label: 'Gemini', host: 'generativelanguage.googleapis.com', keyEnv: 'GEMINI_API_KEY',
      });
      const cand = (data.candidates || [])[0];
      const text = stripFence(((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join(''));
      if (!text) {
        const why = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'no candidates';
        throw aiError('Gemini returned no text (' + why + ')', why === 'SAFETY' || data.promptFeedback ? 'Gemini declined this input under its safety filters.' : '');
      }
      return { text, strategy: 'gemini:' + model };
    },

    explain: (blob) => (/not set|api key/i.test(String(blob)) ? 'Set GEMINI_API_KEY in the environment.' : ''),
    diagnose: () => probeOnce(provider),
    describe: () => ({ provider: 'gemini', label: 'Gemini', model, auth: apiKey ? 'API key' : 'none' }),
  };
  return provider;
}
