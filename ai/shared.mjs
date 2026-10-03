/* Helpers shared by every AI provider. Nothing in here knows which vendor it
   is talking to. */

// Models sometimes wrap the whole answer in a ```markdown fence even when told
// not to. The document is what is inside it.
export function stripFence(text) {
  const t = String(text || '').trim();
  const fenced = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1].trim() : t;
}

// An Error carrying the plain-English `explain` the routes hand to the browser.
export function aiError(message, explain = '', extra = {}) {
  const e = new Error(message);
  e.explain = explain;
  Object.assign(e, extra);
  return e;
}

/* One HTTPS JSON call with a timeout, mapping transport failures and non-2xx
   statuses to aiError()s. `label` names the vendor in messages; `host` is what
   to check outbound access to. Returns the parsed JSON body. */
export async function postJson({ url, headers, body, timeoutMs, label, host, keyEnv }) {
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') {
      throw aiError(`${label} did not answer within ${Math.round(timeoutMs / 1000)}s`, 'Try again, or with a shorter input.');
    }
    throw aiError(`Could not reach ${label}: ${e.message}`, `Check that this server has outbound HTTPS access to ${host}.`);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw aiError(`${label} responded ${resp.status}`, explainStatus(resp.status, text, label, keyEnv));
  }
  return resp.json();
}

function explainStatus(status, bodyText, label, keyEnv) {
  if (status === 401 || status === 403) return `The ${label} API key configured on this server (${keyEnv}) is invalid or lacks access.`;
  if (status === 404) return `${label} does not know the configured model. Check ILOVEMD_AI_MODEL.`;
  if (status === 429) return `The ${label} rate limit or quota was hit - try again shortly.`;
  if (status >= 500) return `${label} is having issues right now - try again shortly.`;
  return String(bodyText || '').slice(0, 200);
}

/* Diagnose for the single-request HTTP providers: one probe call. */
export async function probeOnce(provider) {
  const t0 = Date.now();
  try {
    const r = await provider.generate('Reply with exactly the word OK and nothing else.');
    return { working: [provider.id], explain: '', results: [{ form: provider.id, ok: true, ms: Date.now() - t0, stdout: r.text.slice(0, 300) }] };
  } catch (e) {
    return { working: [], explain: e.explain || '', results: [{ form: provider.id, ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 300) }] };
  }
}
