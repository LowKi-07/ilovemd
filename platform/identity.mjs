/* Who is making this request. Today every public visitor is anonymous: the
   first request gets a random id in a long-lived cookie, HMAC-signed with
   ILOVEMD_SESSION_SECRET so it cannot be forged or guessed. Everything a
   visitor owns (documents, uploads, kits) is keyed by that id.

   When real accounts arrive, identify() returns the signed-in user's id
   instead (kind: 'user') and nothing downstream has to change. */

import crypto from 'node:crypto';

export const VISITOR_COOKIE = 'ilovemd_vid';
const VISITOR_TTL_S = 365 * 24 * 60 * 60;
export const ID_RE = /^[a-f0-9]{32}$/;

// Set-Cookie can carry several cookies; setHeader() alone would drop earlier ones.
export function addCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

export function createIdentity({ secret }) {
  // 'vid:' keeps these signatures from ever matching a session-token signature.
  const sign = (id) => crypto.createHmac('sha256', secret).update('vid:' + id).digest('hex');

  function verify(token) {
    const [id, sig] = String(token || '').split('.');
    if (!ID_RE.test(id || '') || !sig) return null;
    const a = Buffer.from(sig), b = Buffer.from(sign(id));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
  }

  return {
    /* Returns { id, kind, isNew }. Issues the cookie when there is no valid one. */
    identify(req, res, cookies, { secure }) {
      const known = verify(cookies[VISITOR_COOKIE]);
      if (known) return { id: known, kind: 'anonymous', isNew: false };
      const id = crypto.randomBytes(16).toString('hex');
      addCookie(res, `${VISITOR_COOKIE}=${id}.${sign(id)}; HttpOnly; Path=/; Max-Age=${VISITOR_TTL_S}; SameSite=Lax${secure ? '; Secure' : ''}`);
      return { id, kind: 'anonymous', isNew: true };
    },
  };
}
