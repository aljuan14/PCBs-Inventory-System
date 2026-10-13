-- The PCBs status counts of every company at once (company_pcb_status of
-- 20261013000001), for the national summary on the dashboard and the status
-- dots of the companies page. About 60 ms for 172 companies.

CREATE OR REPLACE FUNCTION public.pcb_status_all()
RETURNS TABLE (company_id uuid, status jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, public.company_pcb_status(c.id) FROM public.companies c;
$$;

REVOKE ALL ON FUNCTION public.pcb_status_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pcb_status_all() TO authenticated;

NOTIFY pgrst, 'reload schema';
