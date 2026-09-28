import InventoryCategoryDashboard from '@/components/InventoryCategoryDashboard';
import { issueLinkFromParams } from '@/lib/inventory-query';

export default async function KapasitorPage({ searchParams }: PageProps<'/dashboard/kapasitor'>) {
  return <InventoryCategoryDashboard category="kapasitor" issue={issueLinkFromParams(await searchParams)} />;
}
