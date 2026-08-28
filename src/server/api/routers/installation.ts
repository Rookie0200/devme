import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Octokit } from "octokit";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { client } from "@/server/db";
import { env } from "@/env";
import { encryptProviderKey } from "@/server/review/crypto/providerKey";
import { validateProviderKey } from "@/server/review/model/anthropic";

/**
 * Installations and their Provider Keys.
 *
 * Authorization is delegated to GitHub — see docs/adr/0001. This application
 * stores no membership, no roles, and no invites: the set of Installations a
 * signed-in user may see is whatever GitHub says it is, asked against their
 * own OAuth token.
 */

/**
 * Installation-list lookups hit the GitHub API, so ADR-0001 requires caching
 * them. This is a process-local cache keyed by user with a short TTL — an
 * install or uninstall on GitHub takes up to `CACHE_TTL_MS` to show up, and a
 * multi-process deploy caches per process.
 */
const reachableCache = new Map<
  string,
  { ids: Set<number>; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** The user's GitHub OAuth token. It grants dashboard identity, not repo access. */
async function githubTokenFor(userId: string): Promise<string> {
  const account = await client.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  if (!account?.access_token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Reconnect your GitHub account to continue.",
    });
  }
  return account.access_token;
}

/** Ask GitHub which Installations this user can reach; never answer it ourselves. */
async function reachableInstallationIds(userId: string): Promise<Set<number>> {
  const cached = reachableCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const octokit = new Octokit({ auth: await githubTokenFor(userId) });
  const { data } = await octokit.request("GET /user/installations", {
    per_page: 100,
  });

  const ids = new Set(data.installations.map((i) => i.id));
  reachableCache.set(userId, { ids, expiresAt: Date.now() + CACHE_TTL_MS });
  return ids;
}

/** @throws if the signed-in user cannot reach this Installation on GitHub. */
async function assertReachable(userId: string, installationId: string) {
  const installation = await client.installation.findUnique({
    where: { id: installationId },
    select: { githubInstallationId: true },
  });
  if (!installation) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const reachable = await reachableInstallationIds(userId);
  if (!reachable.has(Number(installation.githubInstallationId))) {
    // Deliberately NOT_FOUND: whether an Installation exists is itself
    // information this user is not entitled to.
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const installationRouter = createTRPCRouter({
  /** Only the Installations the signed-in user's GitHub account can reach. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const reachable = await reachableInstallationIds(ctx.user.id);
    if (reachable.size === 0) return [];

    const installations = await client.installation.findMany({
      where: {
        githubInstallationId: { in: [...reachable].map((id) => BigInt(id)) },
        deletedAt: null,
      },
      select: {
        id: true,
        accountLogin: true,
        accountType: true,
        providerKey: { select: { hint: true, validatedAt: true } },
        _count: { select: { repositories: true } },
      },
    });

    return installations.map((installation) => ({
      id: installation.id,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      repositoryCount: installation._count.repositories,
      // Only ever the last four characters — the key itself never leaves the
      // server, decrypted or otherwise.
      providerKey: installation.providerKey
        ? {
            hint: installation.providerKey.hint,
            validatedAt: installation.providerKey.validatedAt,
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
      await assertReachable(ctx.user.id, input.installationId);

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

      await client.providerKey.upsert({
        where: { installationId: input.installationId },
        update: { ...encrypted, provider: "anthropic", validatedAt: new Date() },
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
      await assertReachable(ctx.user.id, input.installationId);
      await client.providerKey.deleteMany({
        where: { installationId: input.installationId },
      });
      return { removed: true };
    }),
});
