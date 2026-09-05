-- RUN THIS ONCE, in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Nothing counts anything until this table exists; assets/stats.js checks for a
-- working endpoint and stays silent if it gets one it cannot post to.
--
-- WHY THE TABLE LOOKS LIKE THIS
-- There is no user column, no session column and no IP column, and that is the
-- entire design. privacy.html promises that nothing counted can identify you,
-- and the cheapest way to keep a promise like that is to build a table with
-- nowhere to put the thing you promised not to keep. A column that does not
-- exist cannot be filled in later by accident.
--
-- Postgres records inserted_at itself. Supabase sees the request IP in transit,
-- as any server does, but nothing here stores it.

create table if not exists public.hits (
  id          bigint generated always as identity primary key,
  inserted_at timestamptz not null default now(),
  path        text not null check (length(path) <= 200),
  ev          text not null check (length(ev)   <= 40),
  ref         text          check (length(ref)  <= 120),
  w           smallint      check (w between 0 and 10000)
);

-- Queries are always "what happened recently", so this is the index that matters.
create index if not exists hits_time_idx on public.hits (inserted_at desc);
create index if not exists hits_path_idx on public.hits (path, inserted_at desc);

alter table public.hits enable row level security;

-- INSERT ONLY, and only from the anonymous key the site already publishes.
-- The page can add a count and can do nothing else: it cannot read the table,
-- cannot change a row and cannot delete one. Anyone who lifts the anon key out
-- of the page source gets the ability to inflate a counter, which is the least
-- interesting thing they could possibly have.
drop policy if exists "anon may count" on public.hits;
create policy "anon may count"
  on public.hits for insert
  to anon, authenticated
  with check (true);

-- No select policy is created ON PURPOSE. With RLS on and no policy, reads
-- return zero rows to the site, and you still read everything from the
-- dashboard, which connects as the owner and bypasses RLS.

-- ---------------------------------------------------------------------------
-- READING THE NUMBERS. Paste any of these into the SQL editor.
-- ---------------------------------------------------------------------------

-- Views per day for the last fortnight
--   select date_trunc('day', inserted_at)::date as day, count(*)
--   from public.hits where ev = 'view' and inserted_at > now() - interval '14 days'
--   group by 1 order by 1 desc;

-- Which pages are actually being read
--   select path, count(*) as views
--   from public.hits where ev = 'view' and inserted_at > now() - interval '30 days'
--   group by 1 order by 2 desc limit 40;

-- THE ONE THAT MATTERS: how many visits led to a task being added.
-- Not a conversion RATE, because without an identifier a view and a task
-- cannot be tied to the same visit. It is two counts side by side, and the
-- ratio between them is still the number that moves when the product improves.
--   select date_trunc('day', inserted_at)::date as day,
--          count(*) filter (where ev = 'view') as views,
--          count(*) filter (where ev = 'task') as tasks_added
--   from public.hits where inserted_at > now() - interval '30 days'
--   group by 1 order by 1 desc;

-- Where people come from. Nulls are direct visits, or a link from this site.
--   select coalesce(ref, '(direct)') as source, count(*)
--   from public.hits where ev = 'view' and inserted_at > now() - interval '30 days'
--   group by 1 order by 2 desc limit 25;

-- Phone against desktop
--   select w as width_bucket, count(*)
--   from public.hits where ev = 'view' and inserted_at > now() - interval '30 days'
--   group by 1 order by 1;

-- ---------------------------------------------------------------------------
-- HOUSEKEEPING. The free tier has a size limit and counts are cheap to lose.
-- Run this occasionally, or schedule it if pg_cron is enabled on the project.
--   delete from public.hits where inserted_at < now() - interval '180 days';
