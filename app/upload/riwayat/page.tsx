import type { Metadata } from 'next';
import UploadHistory from '@/components/UploadHistory';

export const metadata: Metadata = { title: 'Riwayat Upload | PCBs Inventory' };

/** Imported sheets with the check report kept at upload: /upload/riwayat?company=… */
export default async function UploadHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { company } = await searchParams;
  return <UploadHistory initialCompanyId={(Array.isArray(company) ? company[0] : company) ?? null} />;
}
