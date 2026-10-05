import { q } from '../lib/db.js';
import { readBody, send, query } from '../lib/http.js';
import { authed } from '../lib/auth.js';
import { heat, SITE_STATS } from '../lib/stats.js';
import { ensureSeed } from '../lib/seed.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  try {
    await ensureSeed();
    if (req.method === 'GET') {
      const rows = await q(`${SITE_STATS} where not s.archived group by s.id`);
      const spark = await q(`select site_id, (date_trunc('day',now())::date - date_trunc('day',started_at)::date) ago, count(*)::int n
        from sessions where started_at > date_trunc('day',now()) - interval '13 days' group by 1,2`);
      const sp = {};
      for (const r of spark) { (sp[r.site_id] ||= Array(14).fill(0))[13 - r.ago] = r.n; }
      const live = await q(`select distinct site_id from sessions where last_at > now() - interval '90 seconds'`);
      const liveSet = new Set(live.map((r) => r.site_id));
      return send(res, 200, rows.map((r) => ({ ...r, heat: heat(r), spark: sp[r.id] || Array(14).fill(0), live: liveSet.has(r.id) })));
    }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const fields = { name: 'text', prospect: 'text', notify_emails: 'text', notify: 'bool', archived: 'bool' };
      const sets = [], vals = [b.id];
      for (const [k, t] of Object.entries(fields)) {
        if (b[k] === undefined) continue;
        vals.push(t === 'bool' ? !!b[k] : String(b[k]).trim().slice(0, 120));
        sets.push(`${k}=$${vals.length}`);
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
