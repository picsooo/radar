import { q } from '../lib/db.js';
import { send, query } from '../lib/http.js';
import { authed } from '../lib/auth.js';
import { heat, SITE_STATS } from '../lib/stats.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  const id = query(req).id;
  try {
    const [site] = await q(`${SITE_STATS} where s.id=$1 group by s.id`, [id]);
    if (!site) return send(res, 404, { error: 'Maquette introuvable.' });
    site.heat = heat(site);
    const links = await q(`select l.*, count(se.id)::int visits, count(distinct se.visitor_id)::int visitors,
      max(se.started_at) last_visit, coalesce(sum(se.active_ms),0)::bigint active_ms
      from links l left join sessions se on se.link_id=l.id where l.site_id=$1 group by l.id order by l.created_at`, [id]);
    const sessions = await q(`select se.*, l.label link_label from sessions se left join links l on l.id=se.link_id
      where se.site_id=$1 order by se.started_at desc limit 150`, [id]);
    const pages = await q(`select path, count(*)::int views, count(distinct session_id)::int sessions
      from events where site_id=$1 and type='pv' group by path order by views desc limit 50`, [id]);
    const scroll = await q(`select path, round(avg(m))::int avg_scroll from (
      select path, page_id, max((data->>'v')::numeric) m from events where site_id=$1 and type='sc' group by path, page_id) t
      group by path`, [id]);
    const clicks = await q(`select path, coalesce(nullif(data->>'txt',''), data->>'sel') target, data->>'href' href,
      count(*)::int n, count(*) filter (where (data->>'rage')::boolean)::int rage
      from events where site_id=$1 and type='click' group by 1,2,3 order by n desc limit 40`, [id]);
    const sc = Object.fromEntries(scroll.map((r) => [r.path, r.avg_scroll]));
    return send(res, 200, { site, links, sessions, pages: pages.map((p) => ({ ...p, avg_scroll: sc[p.path] ?? null })), clicks });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
