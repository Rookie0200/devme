"use client";

import Link from "next/link";
import { toast } from "sonner";

import { api, type RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";

type Feed = RouterOutputs["reviewRun"]["list"];
type Run = Feed["runs"][number];
type Filter = NonNullable<Feed["filter"]>;

/**
 * Fixed locale and time zone, for the same reason the Installation cards use
 * one: a date formatted with the ambient locale differs between the server
 * render and the browser.
 */
const DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Four significant places: a Run routinely costs a fraction of a cent. */
const COST = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * What each outcome means, in the reader's terms rather than the schema's.
 *
 * Deliberately says nothing a pull request comment already says. This screen
 * reports whether the reviewer ran; the comment reports what it concluded.
 */
const REASON: Record<string, string> = {
  unlinked: "No linked issue",
  no_provider_key: "No provider key",
  provider_auth: "Provider key refused",
  provider_unavailable: "Provider unavailable",
  github_error: "GitHub error",
  internal: "Internal error",
};

function label(run: Run): { text: string; tone: string } {
  if (run.interrupted) {
    return { text: "Interrupted", tone: "text-muted-foreground" };
  }
  switch (run.status) {
    case "completed":
      return { text: "Reviewed", tone: "text-emerald-600 dark:text-emerald-400" };
    case "running":
      return { text: "Running", tone: "text-muted-foreground" };
    case "declined":
      return {
        text: run.outcomeReason ? REASON[run.outcomeReason] ?? "Declined" : "Declined",
        tone: "text-amber-600 dark:text-amber-400",
      };
    case "failed":
      return {
        text: run.outcomeReason ? REASON[run.outcomeReason] ?? "Failed" : "Failed",
        tone: "text-destructive",
      };
  }
}

export function Runs({
  feed,
  installUrl,
  installation,
}: {
  feed: Feed;
  installUrl: string;
  /** The `?installation=` query param, so a retry can refetch the same view. */
  installation: string | undefined;
}) {
  // A client query seeded with the server render, exactly like the
  // Installation screen: retrying a Run needs a mutation and something for it
  // to invalidate, so this screen is no longer read-only.
  const { data } = api.reviewRun.list.useQuery(
    { installation },
    { initialData: feed },
  );

  if (data.installationCount === 0) return <NoInstallations installUrl={installUrl} />;

  // Naming the account on every row is noise when there is only one it could
  // be — and under a filter there is only one it could be.
  const showAccount = data.installationCount > 1 && data.filter === null;

  return (
    <div className="flex flex-col gap-3">
      {/* Above the list, and rendered even when the list is empty: a filtered
          feed showing nothing is indistinguishable from a reviewer that never
          ran, unless the narrowing is stated where the reader is looking. */}
      {data.filter && <FilterNotice filter={data.filter} />}

      {data.runs.length === 0 ? (
        <NoRuns filtered={data.filter !== null} />
      ) : (
        <>
          <ul className="flex flex-col divide-y">
            {data.runs.map((run) => (
              <RunRow key={run.id} run={run} showAccount={showAccount} />
            ))}
          </ul>

          {/* Stated rather than silently truncated: a capped list that presents
              itself as complete lets a reader conclude older Runs never happened.
              The cap is the router's, so it binds a filtered feed identically. */}
          {data.runs.length === data.limit && (
            <p className="text-muted-foreground text-xs">
              Showing the {data.limit} most recent runs.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The active filter, named, with the way back out of it.
 *
 * There is no control to unset — the filter is a URL, so the link is the
 * whole affordance.
 */
function FilterNotice({ filter }: { filter: Filter }) {
  return (
    <p className="text-muted-foreground text-xs">
      Showing runs from{" "}
      <span className="text-foreground font-medium">
        {filter.accountLogin ?? `installation ${filter.githubInstallationId}`}
      </span>{" "}
      only.{" "}
      <Link href="/dashboard/runs" className="underline">
        Show all installations
      </Link>
    </p>
  );
}

function RunRow({ run, showAccount }: { run: Run; showAccount: boolean }) {
  const { text, tone } = label(run);
  const utils = api.useUtils();

  // Never offered for a `completed` Run — that guard is `isRunManuallyRetriable`
  // on the server, not this flag; the flag only decides whether to show the
  // button, the router still refuses the mutation on its own.
  const rerun = api.reviewRun.rerun.useMutation({
    onSuccess: async () => {
      toast.success("Asked GitHub to redeliver this run.");
      await utils.reviewRun.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
      <Link
        href={run.url}
        className="font-medium hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        {run.title ?? `Pull request #${run.pullRequestNumber}`}
      </Link>
      <span className="text-muted-foreground text-xs">
        #{run.pullRequestNumber} · {run.repository}
        {showAccount && ` · ${run.accountLogin}`}
      </span>

      <span className={`ml-auto text-sm font-medium ${tone}`}>{text}</span>

      {run.retriable && (
        <Button
          variant="outline"
          size="sm"
          disabled={rerun.isPending}
          onClick={() => rerun.mutate({ id: run.id })}
        >
          {rerun.isPending ? "Retrying…" : "Retry"}
        </Button>
      )}

      <span className="text-muted-foreground w-full text-xs">
        {DATE.format(run.startedAt)}
        {" · "}
        {/* Unknown and zero are different facts, and stay different here. */}
        {run.costUsd === null ? "cost unknown" : COST.format(run.costUsd)}
      </span>
    </li>
  );
}

function NoRuns({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <h2 className="font-medium">
        {filtered ? "No runs for this installation" : "No runs yet"}
      </h2>
      <p className="text-muted-foreground text-sm">
        A run happens when a pull request is opened or pushed to on a repository
        this installation can reach. The pull request has to link an issue with
        a closing keyword — <code>Closes #123</code> — because that issue is
        what the review is judged against.
      </p>
    </div>
  );
}

function NoInstallations({ installUrl }: { installUrl: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div>
        <h2 className="font-medium">No installations yet</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          devme reviews pull requests from a GitHub App installation. Install it
          on the account or organisation whose repositories you want reviewed.
        </p>
      </div>
      <Button asChild>
        <Link href={installUrl}>Install the GitHub App</Link>
      </Button>
    </div>
  );
}
