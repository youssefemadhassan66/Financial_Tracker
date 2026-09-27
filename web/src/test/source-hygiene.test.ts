import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Invisible or direction-changing characters can hide in source (Trojan Source)
// and editors do not show them. Visible typography like ’ … – is fine.
// Build them with String.fromCharCode(...) when code needs one.
const FORBIDDEN = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0xa0],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
] as const;

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.mjs', '.mts', '.json', '.md']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return TEXT_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe('source hygiene', () => {
  it('has no invisible, control or bidi characters in src/ or scripts/', () => {
    const offenders: string[] = [];
    for (const file of [...files('src'), ...files('scripts')]) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const ch of line) {
          const code = ch.codePointAt(0)!;
          if (ch !== '\r' && FORBIDDEN.some(([lo, hi]) => code >= lo && code <= hi)) {
            offenders.push(`${file}:${i + 1} U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
