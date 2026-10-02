import { describe, expect, it } from 'vitest';
import { endpointReachability, ingestEndpointUrl, relativeCairoDay, sortDevices } from './devices';
import type { DeviceDto } from './api/types';

describe('ingestEndpointUrl', () => {
  it('uses the page origin when API_URL is empty (same-origin proxy)', () => {
    expect(ingestEndpointUrl('', 'http://192.168.1.20:3001')).toBe('http://192.168.1.20:3001/api/ingest/sms');
  });

  it('uses API_URL when it is set, ignoring the page origin', () => {
    expect(ingestEndpointUrl('https://api.example.com', 'https://app.example.com')).toBe(
      'https://api.example.com/api/ingest/sms',
    );
  });

  it('does not double the slash when the base ends with one', () => {
    expect(ingestEndpointUrl('https://api.example.com/', 'x')).toBe('https://api.example.com/api/ingest/sms');
  });
});

describe('endpointReachability', () => {
  it.each([
    ['http://localhost:3001/api/ingest/sms', 'loopback'],
    ['http://127.0.0.1:3001/api/ingest/sms', 'loopback'],
    ['http://192.168.1.20:3001/api/ingest/sms', 'local-network'],
    ['http://10.0.0.5/api/ingest/sms', 'local-network'],
    ['http://172.20.1.1/api/ingest/sms', 'local-network'],
    ['http://172.32.1.1/api/ingest/sms', 'public'],
    ['https://app.example.com/api/ingest/sms', 'public'],
  ])('%s is %s', (url, expected) => {
    expect(endpointReachability(url)).toBe(expected);
  });
});

describe('relativeCairoDay', () => {
  // 2026-10-02 10:00 in Cairo (UTC+3 in summer time).
  const now = new Date('2026-10-02T07:00:00Z');

  it('counts Cairo calendar days, not 24-hour spans', () => {
    // 23:30 Cairo on 1 Oct is "yesterday" even though it is under 24h ago.
    expect(relativeCairoDay('2026-10-01T20:30:00Z', now)).toBe('yesterday');
    // 00:30 Cairo on 2 Oct is "today" although it is still 1 Oct in UTC.
    expect(relativeCairoDay('2026-10-01T21:30:00Z', now)).toBe('today');
  });

  it('says how many days ago within a week, then the date', () => {
    expect(relativeCairoDay('2026-09-29T09:00:00Z', now)).toBe('3 days ago');
    expect(relativeCairoDay('2026-09-20T09:00:00Z', now)).toBe('on 20 Sep');
  });
});

describe('sortDevices', () => {
  const d = (id: string, createdAt: string, revoked: boolean): DeviceDto => ({
    id,
    name: id,
    createdAt,
    lastUsedAt: null,
    revoked,
  });

  it('puts active phones first, newest first within each group', () => {
    const sorted = sortDevices([
      d('old-revoked', '2026-09-01T00:00:00Z', true),
      d('old-active', '2026-09-02T00:00:00Z', false),
      d('new-revoked', '2026-09-05T00:00:00Z', true),
      d('new-active', '2026-09-04T00:00:00Z', false),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['new-active', 'old-active', 'new-revoked', 'old-revoked']);
  });
});
