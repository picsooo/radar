import { q } from '../lib/db.js';
import { readBody, send, query, rid } from '../lib/http.js';
import { authed } from '../lib/auth.js';
import { heat, SITE_STATS } from '../lib/stats.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  try {
    if (req.method === 'GET') {
      const rows = await q(`${SITE_STATS} where not s.archived group by s.id order by coalesce(max(se.last_at), s.created_at) desc`);
      return send(res, 200, rows.map((r) => ({ ...r, heat: heat(r) })));
    }
    const b = req.method === 'DELETE' ? {} : await readBody(req);
    if (req.method === 'POST') {
      const name = String(b.name || '').trim();
      let url = String(b.url || '').trim();
      if (!name || !url) return send(res, 400, { error: 'Nom et URL de la maquette obligatoires.' });
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      try { new URL(url); } catch { return send(res, 400, { error: "L'URL de la maquette n'est pas valide." }); }
      const id = rid(8);
      const host = new URL(url).hostname.toLowerCase();
      const [dup] = await q('select id from sites where host=$1', [host]);
      if (dup) return send(res, 409, { error: 'Cette adresse est déjà suivie dans Radar.', id: dup.id });
      const [row] = await q('insert into sites(id,name,prospect,url,notify_emails,host) values($1,$2,$3,$4,$5,$6) returning *',
        [id, name, String(b.prospect || '').trim(), url.replace(/\/+$/, ''), String(b.notify_emails || '').trim(), host]);
      return send(res, 201, row);
    }
    if (req.method === 'PATCH') {
      const fields = { name: 'text', prospect: 'text', url: 'text', notify_emails: 'text', notify: 'bool', archived: 'bool' };
      const sets = [], vals = [b.id];
      for (const [k, t] of Object.entries(fields)) {
        if (b[k] === undefined) continue;
        vals.push(t === 'bool' ? !!b[k] : String(b[k]).trim());
        sets.push(`${k}=$${vals.length}`);
        if (k === 'url') { try { vals.push(new URL(String(b[k])).hostname.toLowerCase()); sets.push(`host=$${vals.length}`); } catch {} }
      }
      if (!sets.length) return send(res, 400, { error: 'Rien à modifier.' });
      const [row] = await q(`update sites set ${sets.join(',')} where id=$1 returning *`, vals);
      return row ? send(res, 200, row) : send(res, 404, { error: 'Maquette introuvable.' });
    }
    if (req.method === 'DELETE') {
      await q('delete from sites where id=$1', [query(req).id]);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, {});
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
