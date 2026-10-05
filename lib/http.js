import crypto from 'node:crypto';

export async function readBody(req) {
  const b = req.body;
  if (b !== undefined && b !== null && b !== '') {
    if (typeof b === 'string') return JSON.parse(b);
    if (Buffer.isBuffer(b)) return JSON.parse(b.toString('utf8') || '{}');
    return b;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function query(req) {
  return req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}

export function send(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(data === undefined ? '' : JSON.stringify(data));
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function rid(n = 8) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += a[bytes[i] % a.length];
  return s;
}

export function origin(req) {
  const h = req.headers;
  const host = h['x-forwarded-host'] || h.host;
  const proto = h['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function parseUA(ua = '', vw = 0) {
  let device = 'Ordinateur';
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = 'Tablette';
  else if (/Mobi|iPhone|Android/i.test(ua) || (vw && vw < 700)) device = 'Mobile';
  const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Mac OS X/i.test(ua) ? 'macOS' : /Android/i.test(ua) ? 'Android' : /Linux/i.test(ua) ? 'Linux' : 'Autre';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Autre';
  return { device, os, browser };
}

export const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom/i;
