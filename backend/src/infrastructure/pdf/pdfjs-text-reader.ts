import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { InvalidPdfError } from '../../application/errors.js';
import type { PdfTextReader } from '../../application/ports/pdf.js';
import type { PdfPages, PdfTextRun } from '../../domain/statements/card-statement.js';

/** A bank statement is a few pages a month; hundreds means something else. */
const MAX_PAGES = 100;

/**
 * Reads text with Mozilla's pdf.js (the engine of Firefox's PDF viewer).
 *
 * The file comes from an upload, so it is untrusted input to a complex
 * parser. We only ask for text: no fonts are loaded into anything, no
 * forms, no scripts, and a file with too many pages is refused before
 * any page is parsed.
 */
export class PdfjsTextReader implements PdfTextReader {
  async read(pdf: Uint8Array): Promise<PdfPages> {
    // pdf.js takes ownership of (and detaches) the buffer it is given.
    const task = getDocument({
      data: new Uint8Array(pdf),
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > MAX_PAGES) {
        throw new InvalidPdfError(`The PDF has ${doc.numPages} pages; at most ${MAX_PAGES} are accepted`);
      }
      const pages: PdfTextRun[][] = [];
      for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        const { height } = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const runs: PdfTextRun[] = [];
        for (const item of content.items) {
          if (!('str' in item) || item.str.trim() === '') continue;
          // transform = [a, b, c, d, x, y], with y measured from the BOTTOM.
          const x = item.transform[4] as number;
          runs.push({ text: item.str, x, right: x + item.width, y: height - (item.transform[5] as number) });
        }
        pages.push(runs);
        page.cleanup();
      }
      return pages;
    } catch (error) {
      if (error instanceof InvalidPdfError) {
        throw error;
      }
      // Corrupt, encrypted or malformed: whatever pdf.js tripped on, for
      // the user it is the same answer. Only the error NAME is kept; the
      // message could quote bytes of the file.
      throw new InvalidPdfError(`The file is not a readable PDF (${error instanceof Error ? error.name : 'unknown error'})`);
    } finally {
      await task.destroy();
    }
  }
}
