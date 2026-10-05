import { q } from '../lib/db.js';
import { readBody, send, cors, parseUA, origin, rid, BOT } from '../lib/http.js';
import { notifyOpen } from '../lib/mail.js';
import { ensureLinks } from '../lib/seed.js';

const ID = /^[\w-]{4,64}$/;

// Hôtes acceptés pour l'enregistrement automatique, et hôtes ignorés (aperçus Vercel, local)
const ALLOW = (process.env.RADAR_ALLOWED_HOSTS || 'vercel.app,netlify.app,webminds.dz').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const IGNORE = (process.env.RADAR_IGNORE_HOSTS || '-git-,localhost,127.0.0.1').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function hostOf(req, b) {
  let o = req.headers.origin || '';
  if (!o || o === 'null') o = typeof b.o === 'string' ? b.o : '';
  try { return new URL(o).hostname.toLowerCase(); } catch { return ''; }
}

async function resolveSite(req, b, title) {
  const host = hostOf(req, b);
  if (!host || IGNORE.some((x) => host.includes(x))) return null;
  if (/-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$/.test(host)) return null; // URL d'un déploiement précis (aperçu)
  if (!ALLOW.some((d) => host === d || host.endsWith('.' + d))) return null;
  let [s] = await q('select * from sites where host=$1', [host]);
  if (!s) {
    const name = String(title || '').trim().slice(0, 80) || host;
    await q(`insert into sites(id,name,prospect,url,host) values($1,$2,$2,$3,$4) on conflict (host) do nothing`,
      [rid(8), name, 'https://' + host, host]);
    [s] = await q('select * from sites where host=$1', [host]);
    await ensureLinks();
  } else if (title && s.name === host) {
    const t = String(title).trim().slice(0, 80);
    [s] = await q('update sites set name=$2, prospect=$2 where id=$1 returning *', [s.id, t]);
  }
  return s && !s.archived ? s : null;
}
const TYPES = new Set(['pv', 'click', 'sc']);

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST uniquement' });
  const ua = req.headers['user-agent'] || '';
  if (BOT.test(ua)) return send(res, 204);

  let b;
  try { b = await readBody(req); } catch { return send(res, 400, { error: 'JSON invalide' }); }
  const { site, sid, vid, r, pid } = b || {};
  if (![site, sid, vid, pid].every((v) => typeof v === 'string' && ID.test(v))) return send(res, 400, { error: 'Champs manquants' });

  try {
    const pv0 = Array.isArray(b.ev) ? b.ev.find((e) => e && e.t === 'pv') : null;
    let s;
    if (site === 'auto') s = await resolveSite(req, b, pv0?.d?.title);
    else [s] = await q('select * from sites where id=$1 and not archived', [site]);
    if (!s) return send(res, 404, { error: 'Maquette inconnue' });
    const siteId = s.id;
    let link = null;
    if (typeof r === 'string' && ID.test(r)) [link] = await q('select id,label from links where id=$1 and site_id=$2', [r, siteId]);

    const ev = Array.isArray(b.ev) ? b.ev.slice(0, 400) : [];
    const pv = ev.find((e) => e && e.t === 'pv');
    const vw = Math.round(Number(pv?.d?.vw) || 0) || null;
    const { device, os, browser } = parseUA(ua, vw);
    const dec = (v) => { try { return v ? decodeURIComponent(v) : null; } catch { return v; } };

    const ins = await q(`insert into sessions(id,site_id,link_id,visitor_id,country,city,device,os,browser,referrer,entry_path,vw)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (id) do nothing returning id`,
      [sid, siteId, link?.id || null, vid, req.headers['x-vercel-ip-country'] || null, dec(req.headers['x-vercel-ip-city']),
        device, os, browser, String(pv?.d?.ref || '').slice(0, 300) || null, String(pv?.path || '/').slice(0, 300), vw]);
    const isNew = ins.length === 1;

    let hb = 0, pages = 0, clicks = 0, rage = 0, scroll = 0;
    const rows = [];
    for (const e of ev) {
      if (!e || typeof e !== 'object') continue;
      if (e.t === 'hb') { hb += Math.min(Math.max(Number(e.d?.a) || 0, 0), 20000); continue; }
      if (!TYPES.has(e.t)) continue;
      if (e.t === 'pv') pages++;
      if (e.t === 'click') { clicks++; if (e.d?.rage) rage++; }
      if (e.t === 'sc') scroll = Math.max(scroll, Math.min(100, Number(e.d?.v) || 0));
      rows.push({ p: pid, t: e.t, path: String(e.path || '/').slice(0, 300), ts: Number(e.ts) || Date.now(), d: e.d || {} });
    }
    if (rows.length) {
      await q(`insert into events(session_id,site_id,page_id,type,path,ts,data)
        select $1,$2,x.p,x.t,x.path,to_timestamp(x.ts/1000.0),x.d
        from jsonb_to_recordset($3::jsonb) as x(p text,t text,path text,ts bigint,d jsonb)`, [sid, siteId, JSON.stringify(rows)]);
    }
    const [sess] = await q(`update sessions set last_at=now(), active_ms=active_ms+$2, pages=pages+$3, clicks=clicks+$4,
      rage=rage+$5, max_scroll=greatest(max_scroll,$6) where id=$1 returning *`, [sid, Math.round(hb), pages, clicks, rage, Math.round(scroll)]);

    if (Array.isArray(b.rr) && b.rr.length) {
      const data = JSON.stringify(b.rr);
      if (data.length < 4_000_000) await q('insert into replay(session_id,page_id,seq,data) values($1,$2,$3,$4)', [sid, pid, Number(b.seq) || 0, data]);
    }

    if (isNew) {
      const [{ n }] = await q(`select count(*)::int n from sessions where site_id=$1 and
        coalesce(link_id,'v:'||visitor_id)=coalesce($2,'v:'||$3)`, [siteId, link?.id || null, vid]);
      await q('update sessions set visit_no=$2 where id=$1', [sid, n]);
      sess.visit_no = n;
      if (s.notify) await notifyOpen({ site: s, link, session: sess, dashboard: origin(req) });
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Erreur serveur' });
  }
}
