import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Shown when GitHub rejects the signed-in user's OAuth token.
 *
 * Shared by both protected screens on purpose, which is the opposite call from
 * `assertReachable` — that one stays duplicated-in-spirit because collapsing it
 * would separate a security subtlety from the comment explaining it. This is
 * presentational and carries no such subtlety, and two drifting copies would
 * mean one route offers the recovery action while the other only reports a
 * failure the reader cannot act on.
 */
export function ReconnectGitHub() {
  return (
    <div className="flex flex-col items-start gap-4">
      <div>
        <h2 className="font-medium">Reconnect GitHub</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Your GitHub authorization is no longer valid, so we cannot ask which
          installations you can reach. Signing in again restores it.
        </p>
      </div>
      <Button asChild>
        <Link href="/sign-in">Reconnect GitHub</Link>
      </Button>
    </div>
  );
}
