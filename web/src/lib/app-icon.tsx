import { ImageResponse } from 'next/og';
import { BRAND_ON_PRIMARY, BRAND_PRIMARY } from './brand-colors';

// The app mark (lucide "piggy-bank") on the indigo brand color.
const PIGGY_PATHS = [
  'M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z',
  'M16 10h.01',
  'M2 8v1a2 2 0 0 0 2 2h1',
];

/**
 * A square app icon. `maskable` keeps the mark inside the central safe zone
 * and fills the whole square, because the phone cuts its own shape out of it.
 */
export function appIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const mark = Math.round(size * (maskable ? 0.5 : 0.58));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND_PRIMARY,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg
          width={mark}
          height={mark}
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND_ON_PRIMARY}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {PIGGY_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
