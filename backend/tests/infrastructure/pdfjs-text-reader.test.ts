import { describe, expect, it } from 'vitest';
import { PdfjsTextReader } from '../../src/infrastructure/pdf/pdfjs-text-reader.js';
import { InvalidPdfError } from '../../src/application/errors.js';
import { buildPdf } from '../pdf-fixture.js';

describe('PdfjsTextReader', () => {
  const reader = new PdfjsTextReader();

  it('returns each page with its text, measured from the TOP-left', async () => {
    const pages = await reader.read(buildPdf([[{ x: 55, top: 492, text: '30-06' }], [{ x: 250, top: 30, text: 'TEST CAFE' }]]));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual([{ text: '30-06', x: 55, right: expect.any(Number), y: 492 }]);
    expect(pages[1]![0]).toMatchObject({ text: 'TEST CAFE', x: 250, y: 30 });
    expect(pages[1]![0]!.right).toBeGreaterThan(250);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(reader.read(new TextEncoder().encode('just some text'))).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it('refuses a PDF with more pages than any statement has', async () => {
    const huge = buildPdf(Array.from({ length: 101 }, () => [{ x: 10, top: 10, text: 'x' }]));
    await expect(reader.read(huge)).rejects.toThrow(/101 pages/);
  });

  it('stops reading at the text cap instead of holding a text bomb in memory', async () => {
    const small = new PdfjsTextReader(5);
    const five = Array.from({ length: 5 }, (_, i) => ({ x: 10, top: 10 + i * 20, text: `t${i}` }));
    expect((await small.read(buildPdf([five])))[0]).toHaveLength(5);
    const six = [...five, { x: 10, top: 200, text: 't5' }];
    await expect(small.read(buildPdf([six]))).rejects.toThrow(/more than 5 pieces of text/);
  });
});
