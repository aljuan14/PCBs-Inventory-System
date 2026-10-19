import { Suspense } from 'react';
import CompanyPortal from '@/components/company/CompanyPortal';

/** A company's own area: its sidebar around every page under /lapor/<ID SIMPEL>. */
export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><CompanyPortal>{children}</CompanyPortal></Suspense>;
}
