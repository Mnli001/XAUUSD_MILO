/**
 * What a signed-in page shows the instant a link is pressed, while the server prepares the real one.
 * Next.js prefetches this ahead of time for every link on screen, so a click always answers at once,
 * even on a slow connection to a far-away server. Shapes only: no text to read, nothing to press.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  const bar = "skeleton rounded-full";
  return (
    <div className="space-y-4 sm:space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="card space-y-4 sm:p-8">
        <div className={`${bar} h-3 w-32`} />
        <div className={`${bar} h-12 w-64 max-w-full sm:h-16`} />
        <div className={`${bar} h-3 w-48`} />
        <div className="skeleton h-24 w-full rounded-2xl sm:h-28" />
      </div>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-4 sm:space-y-6">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="card space-y-3">
              <div className={`${bar} h-3 w-40`} />
              <div className={`${bar} h-3 w-full`} />
              <div className={`${bar} h-3 w-5/6`} />
              <div className={`${bar} h-3 w-2/3`} />
            </div>
          ))}
        </div>
        <div className="card hidden space-y-3 lg:block">
          <div className={`${bar} h-3 w-32`} />
          <div className="skeleton h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
