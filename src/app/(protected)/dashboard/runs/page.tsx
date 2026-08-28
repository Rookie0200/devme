import { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { api } from "@/trpc/server";
import { Runs } from "./runs";
import { ReconnectGitHub } from "../../reconnect-github";

/**
 * Review Run history: whether the reviewer ran, and if not, why.
 *
 * A plain server component. The Installation screen is a client component
 * because it mutates and invalidates; there is nothing to mutate here, so
 * there is no cache to hydrate and no hook to run. `loading.tsx` supplies the
 * streamed skeleton.
 *
 * The revoked-authorization case is caught here rather than left to an error
 * boundary, for the same reason the Installation screen catches it: a boundary
 * cannot offer the one action that fixes it.
 */
export default async function RunsPage() {
  let feed;
  try {
    feed = await api.reviewRun.list();
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return <ReconnectGitHub />;
    }
    throw error;
  }

  return (
    <Runs
      feed={feed}
      installUrl={`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`}
      // Naming the account on every row is noise when there is only one it
      // could be.
      showAccount={feed.installationCount > 1}
    />
  );
}
