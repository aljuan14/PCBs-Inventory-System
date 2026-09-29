-- The dashboard figures (inventory_stats, inventory_quality) scan every row in
-- scope. With ~240k rows they take 1-1.6 s on a warm cache, but on the Nano
-- instance a cold cache pushes them past the default 3 s limit for anon and
-- 8 s for authenticated ("canceling statement due to statement timeout").
-- Give both roles 15 s until the figures are precomputed.

ALTER ROLE anon SET statement_timeout = '15s';
ALTER ROLE authenticated SET statement_timeout = '15s';

-- PostgREST reads role settings when it loads its config.
NOTIFY pgrst, 'reload config';
