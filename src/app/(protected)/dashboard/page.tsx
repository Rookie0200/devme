import Link from "next/link";
import { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { api } from "@/trpc/server";
import { Button } from "@/components/ui/button";
import { Installations } from "./installations";

/**
 * The Installations a signed-in user can reach, and the Provider Key each one
 * spends on reviews. This is the only way to configure the reviewer through a
 * browser; `bun run db:seed-key` remains the break-glass path.
 *
 * The list is fetched here rather than prefetched into the client cache so
 * that the one error worth acting on — a GitHub authorization that has been
 * revoked — can be caught and answered with the control that fixes it. Left
 * to an error boundary it would render as a failure the user cannot do
 * anything about.
 */
export default async function DashboardPage() {
  let installations;
  try {
    installations = await api.installation.list();
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return <ReconnectGitHub />;
    }
    throw error;
  }

  return (
    <Installations
      initialData={installations}
      installUrl={`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`}
    />
  );
}

function ReconnectGitHub() {
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
