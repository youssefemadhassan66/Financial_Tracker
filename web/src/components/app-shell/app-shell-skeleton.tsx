/**
 * What the app looks like while the saved session is being restored. It has
 * the shell's real proportions so nothing jumps when the content arrives.
 */
export function AppShellSkeleton() {
  const bar = 'rounded-md bg-muted motion-safe:animate-pulse';
  return (
    <div className="flex min-h-dvh" aria-busy="true">
      <span className="sr-only" role="status">
        Loading your account
      </span>
      <aside className="hidden w-64 shrink-0 flex-col gap-8 border-e bg-sidebar px-4 py-5 md:flex" aria-hidden="true">
        <div className="flex items-center gap-2.5 px-2">
          <div className={`size-8 ${bar}`} />
          <div className={`h-4 w-20 ${bar}`} />
        </div>
        <div className="flex flex-col gap-3 px-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`h-4 ${bar}`} style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          ))}
        </div>
      </aside>
      <div className="flex-1 px-4 py-6 md:px-10 md:py-10" aria-hidden="true">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className={`h-7 w-48 ${bar}`} />
          <div className={`h-4 w-72 max-w-full ${bar}`} />
          <div className={`mt-8 h-56 rounded-2xl ${bar}`} />
        </div>
      </div>
    </div>
  );
}
