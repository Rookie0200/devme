/**
 * The feed asks GitHub which Installations this user can reach before it can
 * query anything, which is a network round trip on a cache miss. This fills
 * that pause.
 */
export default function Loading() {
  return (
    <div className="flex flex-col divide-y" aria-busy="true">
      <span className="sr-only">Loading review runs</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-col gap-2 py-3">
          <div className="bg-muted h-4 w-64 animate-pulse rounded" />
          <div className="bg-muted h-3 w-40 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
