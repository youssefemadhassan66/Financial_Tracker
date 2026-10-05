import { appIcon } from '@/lib/app-icon';

// iPhone home screen icon. iOS rounds the corners itself, so the square is full bleed.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return appIcon(180, { maskable: true });
}
