import crypto from 'node:crypto';
import { send } from './http.js';

const secret = () => process.env.AUTH_SECRET || process.env.DASHBOARD_PASSWORD || 'open';
const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');

export function makeToken(days = 30) {
  const exp = String(Date.now() + days * 864e5);
  return `${exp}.${sign(exp)}`;
}

export function checkPassword(pw) {
  const ref = process.env.DASHBOARD_PASSWORD || '';
  if (!ref || typeof pw !== 'string') return false;
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(ref).digest();
  return crypto.timingSafeEqual(a, b);
}

export const isOpen = () => !process.env.DASHBOARD_PASSWORD;

export function authed(req, res) {
  if (isOpen()) return true;
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [exp, sig] = tok.split('.');
  let ok = false;
  if (exp && sig && secret() && Number(exp) > Date.now()) {
    const good = sign(exp);
    ok = sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  }
  if (!ok) send(res, 401, { error: 'Session expirée, reconnectez-vous.' });
  return ok;
}
