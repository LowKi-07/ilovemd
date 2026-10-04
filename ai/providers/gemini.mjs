/* Google Gemini via the Generative Language REST API.
   Key: GEMINI_API_KEY (or GOOGLE_API_KEY), from https://aistudio.google.com/apikey */

import { aiError, postJson, probeOnce, stripFence } from '../shared.mjs';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/* Google retires model versions, so a fixed default eventually 404s. From the
   models this key can call, pick the newest stable general-purpose Flash -
   cheap and fast - skipping lite, preview/experimental and special-purpose
   (image, audio, live, embedding ...) variants unless nothing else exists. */
export function pickFlashModel(models) {
  const usable = models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n));
  const version = (n) => Number((n.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const special = /image|tts|audio|live|embed|vision|robotics|computer|native|thinking|learnlm/;
  const tiers = [
    (n) => /flash/.test(n) && !/lite|preview|exp|latest/.test(n) && !special.test(n) && !/-\d{3}$/.test(n),
    (n) => /flash/.test(n) && !/lite/.test(n) && !special.test(n),
    (n) => /flash/.test(n) && !special.test(n),
    (n) => !special.test(n),
  ];
  for (const ok of tiers) {
    const hit = usable.filter(ok).sort((a, b) => version(b) - version(a) || a.length - b.length);
    if (hit.length) return hit[0];
  }
  return null;
}

export function createGeminiProvider({ env, systemPrompt, timeoutMs }) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '';
  const configured = env.ILOVEMD_AI_MODEL || '';
  let model = configured || DEFAULT_MODEL;
  const maxTokens = Number(env.ILOVEMD_AI_MAX_TOKENS || 16000);

  function call(prompt) {
    return postJson({
      url: `${API}/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      },
      timeoutMs, label: 'Gemini', host: 'generativelanguage.googleapis.com', keyEnv: 'GEMINI_API_KEY',
    });
  }

  async function listModels() {
    const resp = await fetch(`${API}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error('model list ' + resp.status);
    return (await resp.json()).models || [];
  }

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
      let data;
      try {
        data = await call(prompt);
      } catch (e) {
        if (e.status !== 404) throw e;
        // The model is gone or not offered to this key: see what is.
        const available = await listModels().catch(() => null);
        const pick = available && pickFlashModel(available);
        if (!pick || pick === model) throw e;
        if (configured) {
          e.explain = `Gemini has no model "${configured}" for this key. Set ILOVEMD_AI_MODEL to an available one, e.g. ${pick}, or remove it to choose automatically.`;
          throw e;
        }
        console.log(`gemini: ${model} is not available, switching to ${pick}`);
        model = pick;
        data = await call(prompt);
      }
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
