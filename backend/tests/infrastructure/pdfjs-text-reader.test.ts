import { describe, expect, it } from 'vitest';
import { PdfjsTextReader } from '../../src/infrastructure/pdf/pdfjs-text-reader.js';
import { InvalidPdfError } from '../../src/application/errors.js';

/**
 * The smallest valid PDF: US Letter pages (612 x 792 points), each with
 * the given text drawn at the given position (PDF origin = BOTTOM-left).
 */
function tinyPdf(pages: { x: number; y: number; text: string }[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) + 2; // ids 1 and 2 are catalog and page tree
  const kids: number[] = [];
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const page of pages) {
    const stream = page.map((t) => `BT /F1 10 Tf ${t.x} ${t.y} Td (${t.text}) Tj ET`).join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  const all = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`, ...objects];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  all.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe('PdfjsTextReader', () => {
  const reader = new PdfjsTextReader();

  it('returns each page with its text, measured from the TOP-left', async () => {
    const pages = await reader.read(tinyPdf([[{ x: 55, y: 300, text: '30-06' }], [{ x: 250, y: 762, text: 'TEST CAFE' }]]));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual([{ text: '30-06', x: 55, right: expect.any(Number), y: 492 }]);
    expect(pages[1]![0]).toMatchObject({ text: 'TEST CAFE', x: 250, y: 30 });
    expect(pages[1]![0]!.right).toBeGreaterThan(250);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(reader.read(new TextEncoder().encode('just some text'))).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it('refuses a PDF with more pages than any statement has', async () => {
    const huge = tinyPdf(Array.from({ length: 101 }, () => [{ x: 10, y: 10, text: 'x' }]));
    await expect(reader.read(huge)).rejects.toThrow(/101 pages/);
  });
});
