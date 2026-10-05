import { q } from '../lib/db.js';
import { send, query } from '../lib/http.js';
import { authed } from '../lib/auth.js';
import { heat, SITE_STATS, daysSQL } from '../lib/stats.js';
import { ensureSeed } from '../lib/seed.js';

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  const id = query(req).id;
  try {
    await ensureSeed();
    const [site] = await q(`${SITE_STATS} where s.id=$1 group by s.id`, [id]);
    if (!site) return send(res, 404, { error: 'Maquette introuvable.' });
    site.heat = heat(site);
    const links = await q(`select l.*, count(se.id)::int visits, count(distinct se.visitor_id)::int visitors,
      max(se.started_at) last_visit, coalesce(sum(se.active_ms),0)::bigint active_ms
      from links l left join sessions se on se.link_id=l.id where l.site_id=$1 group by l.id order by l.created_at`, [id]);
    const sessions = await q(`select se.*, l.label link_label,
      dense_rank() over (order by v.first_seen, se.visitor_id) visitor_no
      from sessions se left join links l on l.id=se.link_id
      join (select visitor_id, min(started_at) first_seen from sessions where site_id=$1 group by 1) v on v.visitor_id=se.visitor_id
      where se.site_id=$1 order by se.started_at desc limit 150`, [id]);
    const pages = await q(`select path, count(*)::int views, count(distinct session_id)::int sessions
      from events where site_id=$1 and type='pv' group by path order by views desc limit 50`, [id]);
    const scroll = await q(`select path, round(avg(m))::int avg_scroll from (
      select path, page_id, max((data->>'v')::numeric) m from events where site_id=$1 and type='sc' group by path, page_id) t
      group by path`, [id]);
    const clicks = await q(`select path, coalesce(nullif(data->>'txt',''), data->>'sel') target, data->>'href' href,
      count(*)::int n, count(*) filter (where (data->>'rage')::boolean)::int rage
      from events where site_id=$1 and type='click' group by 1,2,3 order by n desc limit 40`, [id]);
    const days = await q(daysSQL(30, true), [id]);
    const devices = await q(`select device label, count(*)::int n from sessions where site_id=$1 group by 1 order by 2 desc`, [id]);
    const cities = await q(`select coalesce(city,'Inconnue') label, max(country) country, count(*)::int n from sessions where site_id=$1 group by 1 order by 3 desc limit 6`, [id]);
    const sc = Object.fromEntries(scroll.map((r) => [r.path, r.avg_scroll]));
    return send(res, 200, { site, links, sessions, pages: pages.map((p) => ({ ...p, avg_scroll: sc[p.path] ?? null })), clicks, days, devices, cities });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
