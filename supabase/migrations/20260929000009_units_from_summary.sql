-- The units and sub-units of a company, for the dashboard and table
-- filters, from the summary table (20260929000007) instead of a scan.
--
-- inventory_units grouped every row of the company: 3-10 s for PLN, and
-- beside the other dashboard requests it passed the 15 s statement
-- timeout. The filter then hid its unit and sub-unit lists.
--
-- at_least_50 is dropped: nothing reads it, and the parts count > 50 ppm,
-- not >= 50. Changing the result columns needs the function dropped first.

DROP FUNCTION IF EXISTS public.inventory_units(uuid);

CREATE FUNCTION public.inventory_units(p_company_id uuid)
RETURNS TABLE (unit text, sub_unit text, total bigint, tested bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT unit, sub_unit, sum(total)::bigint, sum(tested)::bigint
  FROM public.inventory_stats_parts
  WHERE company_id = p_company_id AND unit IS NOT NULL
  GROUP BY unit, sub_unit
  ORDER BY unit, sub_unit NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_units(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
