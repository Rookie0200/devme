import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { env } from "@/env";
import { reviewStore } from "@/server/review/deps";
import { encryptProviderKey } from "@/server/review/crypto/providerKey";
import { validateProviderKey } from "@/server/review/model/anthropic";
import type {
  GitHubIdentity,
  ReachableInstallation,
} from "@/server/api/githubIdentity";

/**
 * Installations and their Provider Keys.
 *
 * Authorization is delegated to GitHub — see docs/adr/0001. This application
 * stores no membership, no roles, and no invites: the set of Installations a
 * signed-in user may see is whatever GitHub says it is, asked against their
 * own OAuth token.
 */

/** The shape `list` returns, and everything the dashboard is given. */
const installationSelect = {
  id: true,
  githubInstallationId: true,
  accountLogin: true,
  accountType: true,
  deletedAt: true,
  providerKey: {
    select: { hint: true, validatedAt: true, lastAuthFailureAt: true },
  },
  _count: { select: { repositories: true } },
} as const;

/**
 * Exactly the surface `assertReachable` touches.
 *
 * Deliberately not `PrismaClient`: the authorization check is the one thing
 * here worth a test, and a test should be able to supply this without
 * standing up a database or satisfying a thousand-method interface.
 */
interface ReachabilityContext {
  client: {
    installation: {
      findUnique(args: {
        where: { id: string };
        select: { githubInstallationId: true };
      }): PromiseLike<{ githubInstallationId: bigint } | null>;
    };
  };
  github: GitHubIdentity;
}

/** @throws if the signed-in user cannot reach this Installation on GitHub. */
async function assertReachable(
  ctx: ReachabilityContext,
  userId: string,
  installationId: string,
): Promise<void> {
  const installation = await ctx.client.installation.findUnique({
    where: { id: installationId },
    select: { githubInstallationId: true },
  });
  if (!installation) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const reachable = await ctx.github.reachableInstallations(userId);
  const found = reachable.some(
    (candidate) =>
      BigInt(candidate.githubInstallationId) ===
      installation.githubInstallationId,
  );
  if (!found) {
    // Deliberately NOT_FOUND: whether an Installation exists is itself
    // information this user is not entitled to. Do not "improve" this to
    // FORBIDDEN — that answer confirms the Installation is real.
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const installationRouter = createTRPCRouter({
  /**
   * Only the Installations the signed-in user's GitHub account can reach.
   *
   * This query **writes**, which is unusual enough to say out loud. Rows are
   * otherwise created by exactly one path — the `installation.created`
   * webhook — and a delivery that GitHub drops is never retried, so an
   * Installation whose event was missed would be invisible here forever. The
   * `Installation` table is a cache of GitHub's state rather than a record of
   * our own, so this reconciles the cache against the authority that owns it,
   * using the account data GitHub returned in the very same response and the
   * store method the webhook itself calls.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const reachable = await ctx.github.reachableInstallations(ctx.user.id);
    if (reachable.length === 0) return [];

    const ids = reachable.map((i) => BigInt(i.githubInstallationId));
    let rows = await ctx.client.installation.findMany({
      where: { githubInstallationId: { in: ids } },
      select: installationSelect,
      orderBy: { accountLogin: "asc" },
    });

    // Missing entirely, or soft-deleted locally while GitHub still reports it
    // reachable — a reinstall. `upsertInstallation` handles both: it creates,
    // and on update it clears `deletedAt`, reviving the row with its Review
    // history rather than orphaning it.
    const known = new Map(
      rows.map((row) => [String(row.githubInstallationId), row.deletedAt]),
    );
    const stale = reachable.filter((installation) => {
      const key = String(installation.githubInstallationId);
      return !known.has(key) || known.get(key) !== null;
    });

    if (stale.length > 0) {
      await reconcile(stale);
      rows = await ctx.client.installation.findMany({
        where: { githubInstallationId: { in: ids } },
        select: installationSelect,
        orderBy: { accountLogin: "asc" },
      });
    }

    return rows
      .filter((row) => row.deletedAt === null)
      .map((row) => ({
        id: row.id,
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        repositoryCount: row._count.repositories,
        // Only ever the last four characters — the key itself never leaves the
        // server, decrypted or otherwise.
        providerKey: row.providerKey
          ? {
              hint: row.providerKey.hint,
              validatedAt: row.providerKey.validatedAt,
              // Only ever set by a Run the provider *refused*, never by one it
              // could not serve — a warning about a credential that is fine
              // costs the same trust a false accusation does anywhere else.
              lastAuthFailureAt: row.providerKey.lastAuthFailureAt,
            }
          : null,
      }));
  }),

  /**
   * Save a Provider Key. Validated with a cheap live call first, so a typo
   * fails here rather than silently breaking every review.
   */
  setProviderKey: protectedProcedure
    .input(
      z.object({
        installationId: z.string().uuid(),
        apiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertReachable(ctx, ctx.user.id, input.installationId);

      const checked = await validateProviderKey(input.apiKey).catch(() => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not reach Anthropic to check that key. Try again.",
        });
      });
      if (!checked.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: checked.reason });
      }

      const encrypted = encryptProviderKey(
        input.apiKey,
        env.ENCRYPTION_MASTER_KEY,
      );

      await ctx.client.providerKey.upsert({
        where: { installationId: input.installationId },
        update: {
          ...encrypted,
          provider: "anthropic",
          validatedAt: new Date(),
          // Acting on the warning is what clears it. A key that was refused
          // during a real Review Run has just been replaced by one the
          // provider accepted moments ago.
          lastAuthFailureAt: null,
        },
        create: {
          ...encrypted,
          provider: "anthropic",
          validatedAt: new Date(),
          installationId: input.installationId,
        },
      });

      return { hint: encrypted.hint };
    }),

  /** Rotation is the customer's call, on their own schedule. */
  removeProviderKey: protectedProcedure
    .input(z.object({ installationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertReachable(ctx, ctx.user.id, input.installationId);
      await ctx.client.providerKey.deleteMany({
        where: { installationId: input.installationId },
      });
      return { removed: true };
    }),
});

/** Register Installations GitHub can see that we have no live row for. */
async function reconcile(stale: ReachableInstallation[]): Promise<void> {
  for (const installation of stale) {
    await reviewStore.upsertInstallation({
      githubInstallationId: installation.githubInstallationId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
    });
  }
}
