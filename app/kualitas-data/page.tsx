import type { Metadata } from 'next';
import DataQualityOverview from '@/components/DataQualityOverview';

export const metadata: Metadata = { title: 'Kualitas Data | PCBs Inventory' };

export default function DataQualityPage() {
  return <DataQualityOverview />;
}
