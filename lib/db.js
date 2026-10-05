import pg from 'pg';

let pool;
let ready;

export function db() {
  if (!pool) {
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!raw) throw new Error('DATABASE_URL manquant');
    const u = new URL(raw);
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    pool = new pg.Pool({
      connectionString: u.toString(),
      max: 3,
      ssl: local ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

const SCHEMA = `
create table if not exists sites (
  id text primary key,
  name text not null,
  prospect text default '',
  url text not null,
  notify boolean default true,
  notify_emails text default '',
  archived boolean default false,
  created_at timestamptz default now()
);
create table if not exists links (
  id text primary key,
  site_id text references sites(id) on delete cascade,
  label text not null,
  created_at timestamptz default now()
);
create table if not exists sessions (
  id text primary key,
  site_id text references sites(id) on delete cascade,
  link_id text,
  visitor_id text,
  started_at timestamptz default now(),
  last_at timestamptz default now(),
  active_ms integer default 0,
  pages integer default 0,
  clicks integer default 0,
  rage integer default 0,
  max_scroll integer default 0,
  country text, city text, device text, os text, browser text,
  referrer text, entry_path text, vw integer,
  visit_no integer default 1
);
create index if not exists sessions_site_idx on sessions(site_id, started_at desc);
create index if not exists sessions_last_idx on sessions(last_at desc);
create table if not exists events (
  id bigserial primary key,
  session_id text references sessions(id) on delete cascade,
  site_id text,
  page_id text,
  type text,
  path text,
  ts timestamptz,
  data jsonb
);
create index if not exists events_site_idx on events(site_id, type, path);
create index if not exists events_session_idx on events(session_id, ts);
create table if not exists replay (
  id bigserial primary key,
  session_id text references sessions(id) on delete cascade,
  page_id text,
  seq integer,
  data text,
  created_at timestamptz default now()
);
create index if not exists replay_session_idx on replay(session_id, id);
`;

export function ensureSchema() {
  if (!ready) ready = db().query(SCHEMA).catch((e) => { ready = null; throw e; });
  return ready;
}

export async function q(text, params) {
  await ensureSchema();
  return (await db().query(text, params)).rows;
}
