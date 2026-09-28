import InventoryCategoryDashboard from '@/components/InventoryCategoryDashboard';
import { issueLinkFromParams } from '@/lib/inventory-query';

export default async function TransformatorTidakDigunakanPage({ searchParams }: PageProps<'/dashboard/transformator-tidak-digunakan'>) {
  return <InventoryCategoryDashboard category="transformator_tidak_digunakan" issue={issueLinkFromParams(await searchParams)} />;
}
