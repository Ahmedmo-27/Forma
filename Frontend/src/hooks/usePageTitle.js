import { useEffect } from 'react';
import { useTenant } from '../context/TenantContext';

const PLATFORM = 'Forma';

/**
 * Sets the document title.
 * Auth / unauthenticated screens use Forma.
 * Tenant workspace screens use the gym display name when available.
 */
export default function usePageTitle(page) {
  const { branding, tenant } = useTenant();
  const brand = branding?.displayName || tenant?.name || PLATFORM;

  useEffect(() => {
    document.title = page ? `${page} · ${brand}` : brand;
  }, [page, brand]);
}
