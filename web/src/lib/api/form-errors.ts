import { ApiError } from './errors';

export interface FormErrors {
  /** Message per form field, keyed by the field name the API uses in `issues[].path`. */
  fields: Record<string, string>;
  /** Message for the whole form (shown above the fields), or null. */
  general: string | null;
}

/**
 * Turns anything thrown by an API call into messages a form can show.
 * `byStatus` lets a form word the common cases its own way (e.g. 401 on login).
 * Validation issues whose path is not one of `fields` are never dropped: they
 * go to the general message.
 */
export function toFormErrors(
  err: unknown,
  fields: readonly string[],
  byStatus: Partial<Record<number, string>> = {},
): FormErrors {
  if (!(err instanceof ApiError)) {
    return { fields: {}, general: 'Something went wrong. Please try again.' };
  }
  if (err.code === 'VALIDATION_FAILED' && err.issues?.length) {
    const result: FormErrors = { fields: {}, general: null };
    const unmatched: string[] = [];
    for (const issue of err.issues) {
      if (fields.includes(issue.path) && !result.fields[issue.path]) result.fields[issue.path] = issue.message;
      else if (!fields.includes(issue.path)) unmatched.push(issue.message);
    }
    if (unmatched.length > 0) result.general = unmatched.join(' ');
    return result;
  }
  const custom = byStatus[err.status];
  if (custom) return { fields: {}, general: custom };
  if (err.status === 0) return { fields: {}, general: 'Cannot reach the server. Check your connection and try again.' };
  if (err.status === 429) return { fields: {}, general: 'Too many attempts. Wait a few minutes, then try again.' };
  if (err.status >= 500) return { fields: {}, general: 'Something went wrong on our side. Please try again.' };
  return { fields: {}, general: err.message };
}
