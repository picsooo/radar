import { q } from '../lib/db.js';
import { send } from '../lib/http.js';
import { authed } from '../lib/auth.js';
import { heat, SITE_STATS, daysSQL } from '../lib/stats.js';
import { ensureSeed } from '../lib/seed.js';

const SESS = `select se.*, s.name site_name, s.host, l.label link_label
  from sessions se join sites s on s.id=se.site_id left join links l on l.id=se.link_id`;

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  try {
    await ensureSeed();
    const [k] = await q(`select
      count(*) filter (where started_at >= date_trunc('day', now()))::int today,
      count(*) filter (where started_at > now()-interval '7 days')::int week,
      count(*) filter (where started_at <= now()-interval '7 days' and started_at > now()-interval '14 days')::int prev_week,
      count(distinct site_id) filter (where started_at > now()-interval '7 days')::int active_sites,
      count(distinct site_id) filter (where started_at <= now()-interval '7 days' and started_at > now()-interval '14 days')::int prev_active_sites,
      coalesce(avg(active_ms) filter (where started_at > now()-interval '7 days'),0)::int avg_ms,
      coalesce(avg(active_ms) filter (where started_at <= now()-interval '7 days' and started_at > now()-interval '14 days'),0)::int prev_avg_ms,
      count(*) filter (where last_at > now()-interval '90 seconds')::int live
      from sessions`);
    const [{ total, never }] = await q(`select count(*)::int total,
      count(*) filter (where not exists (select 1 from sessions se where se.site_id=s.id))::int never
      from sites s where not archived`);
    const live = await q(`${SESS} where se.last_at > now()-interval '90 seconds' order by se.last_at desc limit 20`);
    const recent = await q(`${SESS} order by se.started_at desc limit 25`);
    const sites = await q(`${SITE_STATS} where not s.archived group by s.id`);
    const hot = sites.map((r) => ({ ...r, heat: heat(r) })).filter((r) => r.visits > 0)
      .sort((a, b) => b.heat - a.heat).slice(0, 6);
    const days = await q(daysSQL(30, false));
    const devices = await q(`select device label, count(*)::int n from sessions where started_at > now()-interval '30 days' group by 1 order by 2 desc`);
    const cities = await q(`select coalesce(city, 'Inconnue') label, max(country) country, count(*)::int n from sessions
      where started_at > now()-interval '30 days' group by 1 order by 3 desc limit 6`);
    return send(res, 200, { kpi: { ...k, total, never }, live, recent, hot, days, devices, cities });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erreur serveur' }); }
}
