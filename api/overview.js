import { q } from '../lib/db.js';
import { send } from '../lib/http.js';
import { authed } from '../lib/auth.js';
import { heat, SITE_STATS } from '../lib/stats.js';

const SESS = `select se.*, s.name site_name, s.prospect, l.label link_label
  from sessions se join sites s on s.id=se.site_id left join links l on l.id=se.link_id`;

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  try {
    const [k] = await q(`select
      count(*) filter (where started_at >= date_trunc('day', now()))::int today,
      count(*) filter (where started_at > now()-interval '7 days')::int week,
      count(distinct visitor_id) filter (where started_at > now()-interval '7 days')::int visitors,
      coalesce(avg(active_ms) filter (where started_at > now()-interval '7 days'),0)::int avg_ms,
      count(*) filter (where last_at > now()-interval '90 seconds')::int live
      from sessions`);
    const live = await q(`${SESS} where se.last_at > now()-interval '90 seconds' order by se.last_at desc limit 20`);
    const recent = await q(`${SESS} order by se.started_at desc limit 30`);
    const sites = await q(`${SITE_STATS} where not s.archived group by s.id`);
    const hot = sites.map((r) => ({ ...r, heat: heat(r) })).filter((r) => r.visits > 0)
      .sort((a, b) => b.heat - a.heat).slice(0, 8);
    const days = await q(`select to_char(d,'YYYY-MM-DD') as day, count(se.id)::int visits
      from generate_series(date_trunc('day',now())-interval '13 days', date_trunc('day',now()), interval '1 day') d
      left join sessions se on date_trunc('day',se.started_at)=d group by d order by d`);
    return send(res, 200, { kpi: k, live, recent, hot, days, sites: sites.length });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
