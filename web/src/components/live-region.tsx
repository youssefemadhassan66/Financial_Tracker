'use client';

/**
 * Polite screen reader announcer for mutations and page updates.
 */
export function LiveRegion({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
