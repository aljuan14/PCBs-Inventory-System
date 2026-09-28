'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { InventoryCategory } from '@/lib/inventory';
import { ALL_SCOPE, fetchInventoryStats, fetchMapPoints, type DashboardScope, type InventoryStats } from '@/lib/inventory-query';
import { toInventoryItem, type CompanyOption } from '@/components/DataTable';
import type { MapPoint } from '@/components/MapLeaflet';

/**
 * Figures, company list and (capped) map points for a dashboard. The table
 * loads its own pages; bump `reloadKey` after edits so it refetches too.
 * `scope` narrows the figures and map to a company, unit or sub-unit.
 */
export function useDashboardData(category?: InventoryCategory, scope: DashboardScope = ALL_SCOPE) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [pointTotal, setPointTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Only the latest request may update the state: switching filters quickly
  // must not let an older, slower response overwrite a newer one.
  const latestRequest = useRef(0);
  const { companyId, unit, subUnit } = scope;

  const fetchAll = useCallback(async () => {
    const [{ data: companyRows, error: companyError }, nextStats, map] = await Promise.all([
      supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan'),
      fetchInventoryStats(supabase, { companyId, unit, subUnit }),
      fetchMapPoints(supabase, category ?? 'all', { companyId, unit, subUnit }),
    ]);
    if (companyError) throw new Error(companyError.message);
    const companyOptions = (companyRows ?? []).map((row) => ({ id: row.id as string, name: row.nama_perusahaan as string }));
    const names = new Map(companyOptions.map((company) => [company.id, company.name]));
    return { companyOptions, nextStats, map, names };
  }, [supabase, category, companyId, unit, subUnit]);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    const isLatest = () => request === latestRequest.current;
    return fetchAll()
      .then(({ companyOptions, nextStats, map, names }) => {
        if (!isLatest()) return;
        setCompanies(companyOptions);
        setStats(nextStats);
        setPoints(map.rows.map((row) => toInventoryItem(row, names) as MapPoint));
        setPointTotal(map.total);
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

  return { supabase, stats, companies, points, pointTotal, loading, refreshing, error, reloadKey, reload };
}
