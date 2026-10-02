/**
 * Ids present in `after` but not in `before`: the rows a save just created.
 * `before` must be captured when the form OPENS, because the form reports
 * success only after the list has already refetched.
 */
export function addedIds(before: ReadonlySet<string>, after: readonly { id: string }[]): ReadonlySet<string> {
  const added = new Set<string>();
  for (const row of after) {
    if (!before.has(row.id)) added.add(row.id);
  }
  return added;
}
