import { q } from '../lib/db.js';
import { readBody, send, query, rid } from '../lib/http.js';
import { authed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  try {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const label = String(b.label || '').trim();
      if (!label) return send(res, 400, { error: 'Donnez un nom au lien (ex. : DG, Service marketing).' });
      const [row] = await q('insert into links(id,site_id,label) values($1,$2,$3) returning *', [rid(6), b.site_id, label]);
      return send(res, 201, row);
    }
    if (req.method === 'DELETE') {
      await q('delete from links where id=$1', [query(req).id]);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, {});
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
