'use client';

import { useSyncExternalStore } from 'react';
import { readCompanySort, subscribeCompanySort, writeCompanySort, type CompanySort } from '@/lib/company-sort';

/** The order chosen for the company lists (lib/company-sort.ts), shared by every list. */
export function useCompanySort(): [CompanySort, (value: CompanySort) => void] {
  const sort = useSyncExternalStore(subscribeCompanySort, readCompanySort, () => 'terbaru' as CompanySort);
  return [sort, writeCompanySort];
}
