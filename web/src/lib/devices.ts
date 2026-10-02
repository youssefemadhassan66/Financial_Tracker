import type { DeviceDto } from './api/types';
import { toCairoDateString } from './cairo-date';
import { formatInstantDay } from './format';

/**
 * The address the phone's SMS forwarder posts to. With an empty API_URL the
 * app runs same-origin (the Next server proxies /api), so the phone must use
 * the address this page was opened from.
 */
export function ingestEndpointUrl(apiUrl: string, origin: string): string {
  const base = (apiUrl === '' ? origin : apiUrl).replace(/\/+$/, '');
  return `${base}/api/ingest/sms`;
}

export type Reachability = 'loopback' | 'local-network' | 'public';

/**
 * Who can reach this URL. "localhost" is the computer itself, so a phone can
 * never reach it; a private address works only on the same Wi-Fi.
 */
export function endpointReachability(url: string): Reachability {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'public';
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host)) {
    return 'loopback';
  }
  const octets = host.split('.').map(Number);
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = octets;
    if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return 'local-network';
  }
  return 'public';
}

function cairoDayNumber(date: Date): number {
  const [y, m, d] = toCairoDateString(date).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** "today", "yesterday", "3 days ago", or "on 12 Sep" (Cairo calendar days). */
export function relativeCairoDay(iso: string, now: Date = new Date()): string {
  const days = cairoDayNumber(now) - cairoDayNumber(new Date(iso));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${formatInstantDay(iso, now)}`;
}

/** Active phones first, newest first within each group. */
export function sortDevices(devices: DeviceDto[]): DeviceDto[] {
  return [...devices].sort((a, b) => {
    if (a.revoked !== b.revoked) return a.revoked ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
