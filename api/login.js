import { readBody, send } from '../lib/http.js';
import { checkPassword, makeToken, isOpen } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, {});
  let b = {};
  try { b = await readBody(req); } catch {}
  if (isOpen()) return send(res, 200, { token: 'open', open: true });
  if (!checkPassword(b.password)) {
    await new Promise((r) => setTimeout(r, 600));
    return send(res, 401, { error: 'Mot de passe incorrect.' });
  }
  return send(res, 200, { token: makeToken() });
}
