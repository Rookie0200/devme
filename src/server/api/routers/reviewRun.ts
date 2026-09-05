import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  isRunAbandoned,
  isRunManuallyRetriable,
} from "@/server/review/runLifecycle";

/**
 * Review Run history.
 *
 * Answers one question — *did the reviewer run, and if not, why* — and
 * deliberately not what any review concluded. The pull request comment owns
 * the report, in full, with its evidence; see `docs/adr/0006`. Everything
 * returned here is data that never reaches that comment.
 */

/**
 * The feed is capped rather than paginated, and the cap is stated on screen.
 * Nobody diagnoses a revoked credential by scrolling: the failures are in the
 * last handful by construction.
 */
const FEED_LIMIT = 50;

/**
 * A Run still marked `running` past the threshold is reported as interrupted.
 *
 * Still read-time interpretation only — no column, no worker, no sweep. The
 * stored row says `running` because that is genuinely the last thing we knew.
 * Derived on the server so the answer does not depend on the reader's clock,
 * which would differ between the server render and the browser.
 *
 * The judgement itself comes from `isRunAbandoned`, shared with the Review
 * Store, so that "interrupted" on this screen means exactly what the pipeline
 * means when it takes a Run over. A copy of the number here would let the two
 * drift, and the drift would show as a screen calling a Run dead while the
 * pipeline still refuses to touch it.
 */

/**
 * Narrowing the feed to one Installation.
 *
 * The filter arrives as a query parameter on `/dashboard/runs` rather than as
 * a control on it — `docs/adr/0006` keeps this screen to one question, and a
 * control implies a browsing surface the screen does not have. The parameter
 * is optional, and absent means every reachable Installation.
 */
const listInput = z
  .object({
    /** GitHub's own installation id, as a string because it came from a URL. */
    installation: z.string().optional(),
  })
  .optional();

/**
 * The Installation id a feed was asked to narrow to, or `null` for all of them.
 *
 * A value that is not a positive integer cannot name an Installation at all,
 * so it is discarded and the feed stays unfiltered: a mistyped URL showing an
 * empty history reads as "the reviewer never ran", which is the one thing this
 * screen exists to answer correctly.
 *
 * A well-formed id is matched against the reachable set instead, and a miss
 * yields an empty feed rather than an error. We cannot distinguish "no such
 * Installation" from "not yours", and answering those two differently is
 * exactly the existence leak `installation.assertReachable` avoids.
 */
function parseInstallationId(raw: string | undefined): bigint | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const value = BigInt(raw);
  return value > 0n ? value : null;
}

export const reviewRunRouter = createTRPCRouter({
  /**
   * The most recent Review Runs across every Installation the signed-in user
   * can reach on GitHub.
   *
   * **Authorization is the `where` clause.** Unlike `installation`'s
   * procedures, nothing here is looked up by identifier, so there is no
   * existence to leak and no `assertReachable` to call — the whole guard is
   * that the query is restricted to Installations GitHub says this user can
   * reach. Removing that restriction does not raise an error and does not
   * break the page; it makes the feed show other tenants' pull request titles.
   * `reviewRun.test.ts` exists for exactly that.
   *
   * An optional `installation` narrows the feed to one of them. It is applied
   * here rather than by the page, so the cap counts the Runs the reader is
   * actually shown: filtering after `take` would silently hide Runs that were
   * inside the cap.
   */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const reachable = await ctx.github.reachableInstallations(ctx.user.id);
    if (reachable.length === 0) {
      return {
        installationCount: 0,
        limit: FEED_LIMIT,
        filter: null,
        runs: [],
      };
    }

    const requested = parseInstallationId(input?.installation);

    // The filter narrows the reachable set; it never widens it. Applying it
    // here rather than to the query keeps authorization and presentation as
    // one `where` clause instead of two that could drift apart.
    const selected =
      requested === null
        ? reachable
        : reachable.filter((i) => BigInt(i.githubInstallationId) === requested);

    const filter =
      requested === null
        ? null
        : {
            githubInstallationId: requested.toString(),
            // Absent when the id names nothing this reader can reach. The
            // screen has no name to show, and inventing one would confirm the
            // Installation exists.
            accountLogin: selected[0]?.accountLogin ?? null,
          };

    if (selected.length === 0) {
      return {
        installationCount: reachable.length,
        limit: FEED_LIMIT,
        filter,
        runs: [],
      };
    }

    const ids = selected.map((i) => BigInt(i.githubInstallationId));

    const rows = await ctx.client.reviewRun.findMany({
      where: {
        review: {
          repository: {
            installation: {
              githubInstallationId: { in: ids },
              // A soft-deleted Installation is one GitHub no longer reports,
              // so there is nobody to ask whether this reader is entitled to
              // it. Reinstalling revives the row and the history returns.
              deletedAt: null,
            },
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: FEED_LIMIT,
      select: {
        id: true,
        status: true,
        outcomeReason: true,
        costUsd: true,
        startedAt: true,
        headSha: true,
        review: {
          select: {
            pullRequestNumber: true,
            title: true,
            repository: {
              select: {
                owner: true,
                name: true,
                installation: { select: { accountLogin: true } },
              },
            },
          },
        },
      },
    });

    const now = new Date();

    return {
      installationCount: reachable.length,
      limit: FEED_LIMIT,
      filter,
      runs: rows.map((row) => {
        const repository = row.review.repository;
        return {
          id: row.id,
          status: row.status,
          outcomeReason: row.outcomeReason,
          // Null means unknown and is rendered as such. It is not zero.
          costUsd: row.costUsd,
          startedAt: row.startedAt,
          headSha: row.headSha,
          pullRequestNumber: row.review.pullRequestNumber,
          title: row.review.title,
          repository: `${repository.owner}/${repository.name}`,
          accountLogin: repository.installation.accountLogin,
          url: `https://github.com/${repository.owner}/${repository.name}/pull/${row.review.pullRequestNumber}`,
          interrupted:
            row.status === "running" && isRunAbandoned(row.startedAt, now),
          retriable: isRunManuallyRetriable(row.status, row.startedAt, now),
        };
      }),
    };
  }),

  /**
   * Retries a Run that never finished, by asking GitHub to redeliver the
   * webhook event that produced it.
   *
   * **Never touches a `completed` Run** — `isRunManuallyRetriable` excludes
   * it, which mirrors the absolute guard in `ReviewStore.startRun` against
   * charging a Provider Key twice for the same head commit. This check is a
   * courtesy, not the real guard: even if it were skipped, the redelivered
   * webhook would hit `startRun` again and be refused there. Its job is only
   * to avoid a pointless GitHub call and a "nothing happened" click.
   *
   * Authorization mirrors `list`: an Installation this user cannot reach
   * answers `NOT_FOUND`, the same as a Run that does not exist at all, so a
   * stranger's Run id leaks nothing by the shape of the error it gets back.
   */
  rerun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const run = await ctx.client.reviewRun.findUnique({
        where: { id: input.id },
        select: {
          status: true,
          startedAt: true,
          githubDeliveryId: true,
          review: {
            select: {
              repository: {
                select: {
                  installation: { select: { githubInstallationId: true } },
                },
              },
            },
          },
        },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const reachable = await ctx.github.reachableInstallations(ctx.user.id);
      const owner = BigInt(
        run.review.repository.installation.githubInstallationId,
      );
      const isReachable = reachable.some(
        (installation) => BigInt(installation.githubInstallationId) === owner,
      );
      // Same response as a Run that does not exist — confirming that a real
      // Run sits behind an id the caller cannot reach is exactly the leak
      // `installation.test.ts` and `reviewRun.test.ts` both exist to prevent.
      if (!isReachable) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!isRunManuallyRetriable(run.status, run.startedAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This run already completed and cannot be retried.",
        });
      }

      if (!run.githubDeliveryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This run predates retry support and cannot be redelivered automatically — push a new commit instead.",
        });
      }

      await ctx.githubApp.redeliverWebhook(run.githubDeliveryId);
    }),
});
