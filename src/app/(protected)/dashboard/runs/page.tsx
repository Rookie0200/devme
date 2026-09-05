import { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { api } from "@/trpc/server";
import { Runs } from "./runs";
import { ReconnectGitHub } from "../../reconnect-github";

/**
 * Review Run history: whether the reviewer ran, and if not, why.
 *
 * A server component that fetches once and hands the result to `Runs`, a
 * client component, as `initialData` — the same split the Installation
 * screen uses. `Runs` needs to be a client component because retrying a Run
 * that never finished is a mutation with something to invalidate.
 * `loading.tsx` supplies the streamed skeleton for the server-side fetch.
 *
 * The revoked-authorization case is caught here rather than left to an error
 * boundary, for the same reason the Installation screen catches it: a boundary
 * cannot offer the one action that fixes it.
 *
 * `?installation=<id>` narrows the feed to a single Installation. The page
 * reads the parameter and hands it over; the filtering itself belongs to the
 * router, next to the reachability check it has to respect.
 */
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.installation;
  // A repeated parameter is a hand-edited URL rather than anything the app
  // produces. First one wins; refusing to render would be a worse answer.
  const installation = Array.isArray(raw) ? raw[0] : raw;

  let feed;
  try {
    feed = await api.reviewRun.list({ installation });
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
      installation={installation}
    />
  );
}
