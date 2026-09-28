import InventoryCategoryDashboard from '@/components/InventoryCategoryDashboard';
import { issueLinkFromParams } from '@/lib/inventory-query';

export default async function MinyakDielektrikPage({ searchParams }: PageProps<'/dashboard/minyak-dielektrik'>) {
  return <InventoryCategoryDashboard category="minyak_dielektrik" issue={issueLinkFromParams(await searchParams)} />;
}
