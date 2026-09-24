import type { PdfPages } from '../../domain/statements/card-statement.js';

/**
 * Turns an uploaded PDF into positioned text. The use case never sees a
 * PDF library: a test hands it pages built by hand.
 */
export interface PdfTextReader {
  /** Throws InvalidPdfError when the bytes are not a PDF it can read. */
  read(pdf: Uint8Array): Promise<PdfPages>;
}
