'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { InventoryCategory } from '@/lib/inventory';
import { fetchInventoryStats, fetchMapPoints, type InventoryStats } from '@/lib/inventory-query';
import { toInventoryItem, type CompanyOption } from '@/components/DataTable';
import type { MapPoint } from '@/components/MapLeaflet';

/**
 * Figures, company list and (capped) map points for a dashboard. The table
 * loads its own pages; bump `reloadKey` after edits so it refetches too.
 */
export function useDashboardData(category?: InventoryCategory) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [pointTotal, setPointTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchAll = useCallback(async () => {
    const [{ data: companyRows, error: companyError }, nextStats, map] = await Promise.all([
      supabase.from('companies').select('id, nama_perusahaan').order('nama_perusahaan'),
      fetchInventoryStats(supabase),
      fetchMapPoints(supabase, category ?? 'all'),
    ]);
    if (companyError) throw new Error(companyError.message);
    const companyOptions = (companyRows ?? []).map((row) => ({ id: row.id as string, name: row.nama_perusahaan as string }));
    const names = new Map(companyOptions.map((company) => [company.id, company.name]));
    return { companyOptions, nextStats, map, names };
  }, [supabase, category]);

  const load = useCallback(() => fetchAll()
    .then(({ companyOptions, nextStats, map, names }) => {
      setCompanies(companyOptions);
      setStats(nextStats);
      setPoints(map.rows.map((row) => toInventoryItem(row, names) as MapPoint));
      setPointTotal(map.total);
      setError(null);
    })
    .catch((err: Error) => setError(err.message))
    .finally(() => {
      setLoading(false);
      setRefreshing(false);
    }), [fetchAll]);

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
