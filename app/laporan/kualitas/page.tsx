import type { Metadata } from 'next';
import QualityReport from '@/components/QualityReport';

export const metadata: Metadata = { title: 'Laporan Kualitas Data | PCBs Inventory' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** Printable data quality report: /laporan/kualitas?company=…&unit=…&sub=… */
export default async function QualityReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <QualityReport scope={{ companyId: first(params.company), unit: first(params.unit), subUnit: first(params.sub) }} />;
}
