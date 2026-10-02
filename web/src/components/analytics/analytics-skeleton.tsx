import * as React from 'react';

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {/* Controls skeleton */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="h-10 w-96 rounded-xl bg-muted motion-safe:animate-pulse" />
        <div className="h-10 w-32 rounded-xl bg-muted motion-safe:animate-pulse" />
      </div>

      {/* Summary strip skeleton (4 tiles) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl border bg-card p-5">
            <div className="h-4 w-20 rounded bg-muted motion-safe:animate-pulse" />
            <div className="mt-3 h-8 w-32 rounded bg-muted motion-safe:animate-pulse" />
            <div className="mt-3 h-3 w-28 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </div>

      {/* Main charts grid skeleton */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Left column: Where the money went */}
        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <div className="h-5 w-44 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-6 w-full rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 w-24 rounded bg-muted motion-safe:animate-pulse" />
                  <div className="h-4 w-16 rounded bg-muted motion-safe:animate-pulse" />
                </div>
                <div className="h-1.5 w-full rounded bg-muted motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Spending over time & comparison */}
        <div className="space-y-6">
          <div className="h-72 rounded-2xl border bg-card p-6">
            <div className="h-5 w-40 rounded bg-muted motion-safe:animate-pulse" />
            <div className="mt-8 h-48 w-full rounded bg-muted motion-safe:animate-pulse" />
          </div>
          <div className="h-72 rounded-2xl border bg-card p-6">
            <div className="h-5 w-48 rounded bg-muted motion-safe:animate-pulse" />
            <div className="mt-8 h-48 w-full rounded bg-muted motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
