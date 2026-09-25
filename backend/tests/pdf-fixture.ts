/**
 * Builds real (tiny) PDF files for tests: US Letter pages, 612 x 792
 * points, with text drawn in Helvetica at the given positions. Latin text
 * only; parentheses and backslashes are escaped.
 */
export interface PdfText {
  x: number;
  /** From the TOP of the page, like PdfTextRun.y. */
  top: number;
  text: string;
}

const PAGE_HEIGHT = 792;
/** Backslash and parentheses are special inside a PDF (string). */
const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);

export function buildPdf(pages: PdfText[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) + 2; // ids 1 and 2: catalog, page tree
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = pages.map((page) => {
    const stream = page
      .map((t) => `BT /F1 10 Tf ${t.x} ${PAGE_HEIGHT - t.top} Td (${escape(t.text)}) Tj ET`)
      .join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
  });
  const all = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`,
    ...objects,
  ];

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

/** One statement row in the CIB layout; the posting date sits 1pt higher. */
export function statementRow(top: number, date: string, posting: string, description: string, amount: string): PdfText[] {
  return [
    { x: 151, top: top - 1, text: posting },
    { x: 55, top, text: date },
    { x: 250, top, text: description },
    { x: 530, top, text: amount },
  ];
}

/** The summary block of a CIB statement, card ending 1111 unless told otherwise. */
export function statementSummary(s: { period: string; due: string; total: string; card?: string }): PdfText[] {
  const rows: [string, string][] = [
    ['Type of Credit Card', 'MASTER TEST'],
    ['Card Number', `5555 **** **** ${s.card ?? '1111'}`],
    ['Card Limit', '20000'],
    ['Total Amount Due', s.total],
    ['Minimum Payment Due', '60.00'],
    ['Payment Due Date', s.due],
    ['Statement Date', s.period],
    ['Available Credit Limit', '18800.00'],
  ];
  return rows.flatMap(([label, value], i) => [
    { x: 54, top: 280 + i * 18, text: label },
    { x: 180, top: 280 + i * 18, text: value },
  ]);
}
