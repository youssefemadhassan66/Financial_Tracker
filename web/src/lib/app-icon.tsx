import { ImageResponse } from 'next/og';
import { BRAND_ON_PRIMARY, BRAND_PRIMARY } from './brand-colors';
import { MARK_BUBBLE, MARK_COIN, MARK_STROKE } from './brand-mark';

// The Masroof mark (message bubble + coin) on the emerald brand color.

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
        <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none">
          <path d={MARK_BUBBLE} stroke={BRAND_ON_PRIMARY} strokeWidth={MARK_STROKE} strokeLinejoin="round" />
          <circle cx={MARK_COIN.cx} cy={MARK_COIN.cy} r={MARK_COIN.r} fill={BRAND_ON_PRIMARY} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
