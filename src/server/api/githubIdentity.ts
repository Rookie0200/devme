import { Octokit } from "octokit";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

/**
 * Which Installations a signed-in user may see.
 *
 * This is asked of GitHub against the user's own OAuth token and never
 * answered from our own records — see docs/adr/0001. It is an interface
 * because the answer is the only thing standing between one customer and
 * another's Installations, and that deserves a test that does not reach the
 * network.
 */

/** An Installation GitHub says this user can reach, as GitHub describes it. */
export interface ReachableInstallation {
  githubInstallationId: number;
  accountLogin: string;
  accountType: string;
}

export interface GitHubIdentity {
  /**
   * @throws TRPCError UNAUTHORIZED if the user has no usable GitHub token —
   * the one failure here the user can actually act on, by reconnecting.
   */
  reachableInstallations(userId: string): Promise<ReachableInstallation[]>;
}

/** ADR-0001 requires these lookups to be cached. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export class OctokitGitHubIdentity implements GitHubIdentity {
  /**
   * Held per instance rather than per module so that a test constructing its
   * own instance gets its own empty cache. Production shares one instance
   * (below), which is what makes the TTL worth having at all.
   */
  private readonly cache = new Map<
    string,
    { installations: ReachableInstallation[]; expiresAt: number }
  >();

  constructor(private readonly client: PrismaClient) {}

  async reachableInstallations(
    userId: string,
  ): Promise<ReachableInstallation[]> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.installations;

    const octokit = new Octokit({ auth: await this.tokenFor(userId) });
    const { data } = await octokit.request("GET /user/installations", {
      per_page: 100,
    });

    const installations = data.installations.map((installation) => {
      // `account` is a user/organization, or — for an enterprise
      // installation — a shape with a slug and no login at all.
      const account = installation.account;
      if (account && "login" in account) {
        return {
          githubInstallationId: installation.id,
          accountLogin: account.login,
          accountType: account.type,
        };
      }
      return {
        githubInstallationId: installation.id,
        accountLogin: account?.slug ?? "unknown",
        accountType: "Enterprise",
      };
    });

    this.cache.set(userId, {
      installations,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return installations;
  }

  /** The user's GitHub OAuth token. Dashboard identity, not repo access. */
  private async tokenFor(userId: string): Promise<string> {
    const account = await this.client.account.findFirst({
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
}
