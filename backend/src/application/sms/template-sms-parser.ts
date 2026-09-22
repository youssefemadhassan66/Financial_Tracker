import { parseWithTemplates, validateCatalog, type SmsCatalog, type SmsParseResult } from '../../domain/sms/sms-template.js';
import type { SmsParser } from '../ports/sms.js';

/**
 * The regex parser: bank templates written in code, no network, no cost.
 * The planned LLM fallback will wrap this — try templates first, ask
 * the model only for messages from a known bank that nothing matched.
 */
export class TemplateSmsParser implements SmsParser {
  constructor(private readonly catalog: SmsCatalog) {
    // Fail at startup, not on the first real SMS.
    validateCatalog(catalog);
  }

  parse(sender: string, body: string): Promise<SmsParseResult> {
    return Promise.resolve(parseWithTemplates(this.catalog, sender, body));
  }
}
