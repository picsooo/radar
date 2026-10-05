import { q } from '../lib/db.js';
import { send, query } from '../lib/http.js';
import { authed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  const id = query(req).id;
  try {
    const [session] = await q(`select se.*, s.name site_name, s.prospect, s.url site_url, l.label link_label
      from sessions se join sites s on s.id=se.site_id left join links l on l.id=se.link_id where se.id=$1`, [id]);
    if (!session) return send(res, 404, { error: 'Visite introuvable.' });
    const events = await q(`select type, path, extract(epoch from ts)*1000 ts, data from events
      where session_id=$1 order by ts limit 2000`, [id]);
    const chunks = await q('select data from replay where session_id=$1 order by id', [id]);
    let replay = [];
    for (const c of chunks) { try { replay = replay.concat(JSON.parse(c.data)); } catch {} }
    replay.sort((a, b) => a.timestamp - b.timestamp);
    return send(res, 200, { session, events, replay });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
