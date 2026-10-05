import { q } from '../lib/db.js';
import { send, query } from '../lib/http.js';
import { authed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  const { site, path = '/', device = 'desktop' } = query(req);
  const mobile = device === 'mobile';
  try {
    const cond = mobile ? "coalesce((e.data->>'vw')::int, se.vw, 0) < 768" : "coalesce((e.data->>'vw')::int, se.vw, 1280) >= 768";
    const clicks = await q(`select (e.data->>'x')::float x, (e.data->>'y')::float y, (e.data->>'dh')::int dh,
      (e.data->>'vw')::int vw, coalesce((e.data->>'rage')::boolean,false) rage
      from events e join sessions se on se.id=e.session_id
      where e.site_id=$1 and e.type='click' and e.path=$2 and ${cond} order by e.id desc limit 5000`, [site, path]);
    const depths = await q(`select max((e.data->>'v')::numeric)::int v, max((e.data->>'dh')::int) dh
      from events e join sessions se on se.id=e.session_id
      where e.site_id=$1 and e.type='sc' and e.path=$2 and ${cond} group by e.page_id`, [site, path]);
    return send(res, 200, { clicks, depths });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
