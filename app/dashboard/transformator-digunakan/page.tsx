import InventoryCategoryDashboard from '@/components/InventoryCategoryDashboard';
import { issueLinkFromParams } from '@/lib/inventory-query';

export default async function TransformatorDigunakanPage({ searchParams }: PageProps<'/dashboard/transformator-digunakan'>) {
  return <InventoryCategoryDashboard category="transformator_digunakan" issue={issueLinkFromParams(await searchParams)} />;
}
