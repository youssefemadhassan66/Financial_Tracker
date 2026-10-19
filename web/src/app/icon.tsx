import { appIcon } from '@/lib/app-icon';

// Browser tab icon plus the sizes the web app manifest asks for:
// /icon/32, /icon/192, /icon/512 and /icon/maskable (512, full bleed).
export function generateImageMetadata() {
  return [
    { id: '32', size: { width: 32, height: 32 }, contentType: 'image/png' },
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
    { id: 'maskable', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const which = await id;
  if (which === 'maskable') return appIcon(512, { maskable: true });
  return appIcon(Number(which));
}
