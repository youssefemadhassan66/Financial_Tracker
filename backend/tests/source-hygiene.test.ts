import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Fails if any source file contains an INVISIBLE character.
 *
 * Why this exists: while building the sanitizer, the regex meant to
 * REJECT bidirectional-override characters was itself saved with those
 * characters written literally into the file — invisible in an editor,
 * and able to make code display differently from how it runs (the
 * "Trojan Source" attack, CVE-2021-42574). ESLint's no-irregular-whitespace
 * caught only part of it. This catches all of it.
 *
 * Written with String.fromCharCode rather than escape sequences on
 * purpose: the escapes are what got decoded into raw characters.
 */

const FORBIDDEN = new Set<number>([
  ...Array.from({ length: 9 }, (_, i) => i), // U+0000–U+0008
  0x0b,
  0x0c,
  ...Array.from({ length: 18 }, (_, i) => 0x0e + i), // U+000E–U+001F
  0x7f,
  0xa0, // no-break space
  0xfeff, // byte-order mark mid-file
  ...Array.from({ length: 5 }, (_, i) => 0x202a + i), // bidi embeddings/overrides
  ...Array.from({ length: 4 }, (_, i) => 0x2066 + i), // bidi isolates
]);

const ROOTS = ['src', 'tests', 'prisma'];
const EXTENSIONS = /\.(ts|mts|mjs|json|prisma|sql)$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path);
    return EXTENSIONS.test(name) ? [path] : [];
  });
}

describe('source hygiene', () => {
  it('contains no invisible control or bidirectional characters', () => {
    const offenders: string[] = [];

    for (const file of ROOTS.flatMap(listFiles)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const char of line) {
            const code = char.codePointAt(0) ?? 0;
            if (FORBIDDEN.has(code)) {
              offenders.push(`${file}:${index + 1} U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
              break;
            }
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
