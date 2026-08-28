import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

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
 * After this, a Run still marked `running` is reported as interrupted.
 *
 * Read-time interpretation only — no column, no worker, no sweep. The stored
 * row still says `running` because that is genuinely the last thing we knew.
 * Derived on the server so the answer does not depend on the reader's clock,
 * which would differ between the server render and the browser.
 */
const INTERRUPTED_AFTER_MS = 30 * 60 * 1000;

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
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const reachable = await ctx.github.reachableInstallations(ctx.user.id);
    if (reachable.length === 0) {
      return { installationCount: 0, limit: FEED_LIMIT, runs: [] };
    }

    const ids = reachable.map((i) => BigInt(i.githubInstallationId));

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

    const now = Date.now();

    return {
      installationCount: reachable.length,
      limit: FEED_LIMIT,
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
            row.status === "running" &&
            now - row.startedAt.getTime() > INTERRUPTED_AFTER_MS,
        };
      }),
    };
  }),
});
