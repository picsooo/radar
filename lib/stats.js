// Score d'intérêt 0-100 calculé sur les 30 derniers jours
export function heat(r) {
  if (!Number(r.visits)) return 0;
  const minutes = Number(r.active_ms) / 60000;
  const hours = r.last_visit ? (Date.now() - new Date(r.last_visit).getTime()) / 36e5 : 999;
  let s = Number(r.visits) * 9 + minutes * 6 + Math.min(Number(r.clicks), 60) * 0.6 + Math.max(Number(r.visitors) - 1, 0) * 10;
  s += hours < 2 ? 25 : hours < 24 ? 15 : hours < 72 ? 6 : 0;
  return Math.max(4, Math.min(100, Math.round(s)));
}

export const SITE_STATS = `
  select s.*, count(se.id)::int visits, count(distinct se.visitor_id)::int visitors,
    coalesce(sum(se.active_ms),0)::bigint active_ms, coalesce(sum(se.clicks),0)::int clicks,
    max(se.started_at) last_visit, max(se.last_at) last_seen,
    (select count(*)::int from links l where l.site_id=s.id) links
  from sites s left join sessions se on se.site_id=s.id and se.started_at > now() - interval '30 days'
`;
