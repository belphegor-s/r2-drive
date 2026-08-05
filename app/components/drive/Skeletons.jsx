'use client';

// Layout-matched placeholders. They mirror the real grid/list geometry so the
// content does not jump when the listing arrives.

export function GridSkeleton({ count = 12 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="skeleton aspect-square" />
          <div className="space-y-2 px-3 py-2.5">
            <div className="skeleton h-3 w-3/4 rounded" />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 10 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-0">
          <div className="skeleton h-4 w-4 rounded" />
          <div className="skeleton h-4 w-4 rounded" />
          <div className="skeleton h-3 flex-1 rounded" style={{ maxWidth: `${40 + ((i * 13) % 40)}%` }} />
          <div className="skeleton h-2.5 w-14 rounded" />
          <div className="skeleton hidden h-2.5 w-24 rounded sm:block" />
        </div>
      ))}
    </div>
  );
}
