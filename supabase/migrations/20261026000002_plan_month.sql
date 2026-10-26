-- Roadmap plans are a month and year since 2026-10-26, kept as the month's
-- last day so "late" (rencana_tanggal < current_date) starts once the month
-- is over. Plans set before then (a full date) move to the end of their month.
UPDATE public.equipment_plans
SET rencana_tanggal = (date_trunc('month', rencana_tanggal) + interval '1 month - 1 day')::date
WHERE rencana_tanggal IS NOT NULL
  AND rencana_tanggal <> (date_trunc('month', rencana_tanggal) + interval '1 month - 1 day')::date;
