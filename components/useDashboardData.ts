'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ALL_SCOPE, fetchInventoryStats, type DashboardScope, type InventoryStats } from '@/lib/inventory-query';
import type { CompanyOption } from '@/components/DataTable';

/**
 * Figures and company list for a dashboard. The table and the map load
 * their own rows; bump `reloadKey` after edits so they refetch too.
 * `scope` narrows the figures to a company, unit or sub-unit.
 */
export function useDashboardData(scope: DashboardScope = ALL_SCOPE) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Only the latest request may update the state: switching filters quickly
  // must not let an older, slower response overwrite a newer one.
  const latestRequest = useRef(0);
  const { companyId, unit, subUnit } = scope;

  const fetchAll = useCallback(async () => {
    const [{ data: companyRows, error: companyError }, nextStats] = await Promise.all([
      supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan'),
      fetchInventoryStats(supabase, { companyId, unit, subUnit }),
    ]);
    if (companyError) throw new Error(companyError.message);
    const companyOptions = (companyRows ?? []).map((row) => ({ id: row.id as string, name: row.nama_perusahaan as string }));
    return { companyOptions, nextStats };
  }, [supabase, companyId, unit, subUnit]);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    const isLatest = () => request === latestRequest.current;
    return fetchAll()
      .then(({ companyOptions, nextStats }) => {
        if (!isLatest()) return;
        setCompanies(companyOptions);
        setStats(nextStats);
        setError(null);
      })
      .catch((err: Error) => { if (isLatest()) setError(err.message); })
      .finally(() => {
        if (!isLatest()) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setReloadKey((key) => key + 1);
    await load();
  }, [load]);

  return { supabase, stats, companies, loading, refreshing, error, reloadKey, reload };
}
