-- RUN THIS ONCE, in the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- WHY IT EXISTS
-- privacy.html states two retention periods:
--   crash reports  deleted automatically after 30 days
--   page counts    deleted automatically after 180 days
--
-- Nothing in the repository was enforcing either of them. The crash-report
-- promise has been on the privacy page for a while with no mechanism behind it,
-- which is worse than having no promise: a privacy page that says something
-- untrue is the one document on a site that must not.
--
-- Storage limitation is also a GDPR requirement in its own right (Article
-- 5(1)(e)): personal data may be kept no longer than is necessary. Keeping
-- crash reports for ever "just in case" is exactly what that forbids.
--
-- STEP 1. Enable pg_cron, once, from the dashboard:
--   Database -> Extensions -> search "pg_cron" -> enable.
-- It cannot be enabled from a SQL editor query on a Supabase project.
--
-- STEP 2. Run everything below.
--
-- STEP 3. Confirm the jobs exist:
--   select jobname, schedule, command from cron.job;
-- Two rows. If that returns nothing, step 1 did not take effect.

-- ---------------------------------------------------------------------------
-- Crash reports: 30 days, matching privacy.html.
-- 03:20 UTC, a quiet hour, and not on the hour so it does not collide with
-- whatever else runs at midnight.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'purge-client-errors',
  '20 3 * * *',
  $$delete from public.client_errors where created_at < now() - interval '30 days'$$
);

-- ---------------------------------------------------------------------------
-- Page counts: 180 days, matching privacy.html.
--
-- These carry no identifier at all, so they are not personal data in the way a
-- crash report might be. They are still deleted on a schedule, for two
-- reasons: the free tier has a size limit, and a count from last year answers
-- no question anybody is going to ask.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'purge-hits',
  '40 3 * * *',
  $$delete from public.hits where inserted_at < now() - interval '180 days'$$
);

-- ---------------------------------------------------------------------------
-- IF THE COLUMN NAME IS WRONG
-- client_errors was created before this file existed, so its timestamp column
-- may not be called created_at. Check first:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'client_errors';
-- Then edit the first job to use whatever the timestamp column is really
-- called, and re-run just that statement. cron.schedule replaces a job of the
-- same name, so running it twice is safe.
--
-- TO REMOVE A JOB
--   select cron.unschedule('purge-client-errors');
--   select cron.unschedule('purge-hits');
--
-- TO SEE THAT THEY ACTUALLY RAN
--   select jobname, status, start_time, return_message
--   from cron.job_run_details order by start_time desc limit 10;
-- ---------------------------------------------------------------------------
