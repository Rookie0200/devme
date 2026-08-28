/**
 * Listing Installations asks GitHub which ones this user can reach, which is
 * a network round trip on a cache miss. This is what fills that pause.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Loading installations</span>
      {[0, 1].map((row) => (
        <div
          key={row}
          className="border-border flex flex-col gap-3 rounded-md border p-4"
        >
          <div className="bg-muted h-4 w-40 animate-pulse rounded" />
          <div className="bg-muted h-3 w-24 animate-pulse rounded" />
          <div className="bg-muted h-8 w-full animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
