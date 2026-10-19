import type { MetadataRoute } from 'next';
import { BRAND_BACKGROUND_LIGHT, BRAND_PRIMARY } from '@/lib/brand-colors';

/**
 * Makes the app installable: "Add to Home Screen" gives a Masroof icon that
 * opens full screen, straight on the dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Masroof: your bank SMS, sorted',
    short_name: 'Masroof',
    description: 'Your bank SMS and card statements turned into a clear picture of your spending.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND_BACKGROUND_LIGHT,
    theme_color: BRAND_PRIMARY,
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
