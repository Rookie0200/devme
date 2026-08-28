import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import type { Session } from "next-auth";
import { createCaller } from "@/server/api/root";
import type {
  GitHubIdentity,
  ReachableInstallation,
} from "@/server/api/githubIdentity";

/**
 * A router authorization test, in the same narrow style as
 * `installation.test.ts`, and for one property only.
 *
 * The feed is restricted to Installations GitHub says the signed-in user can
 * reach. Losing that restriction raises no error and breaks no page — it makes
 * the screen work *better*, showing more rows. In development it is invisible,
 * because a developer can usually reach every Installation in their own
 * database. In production it leaks other tenants' pull request titles.
 *
 * The assertion is therefore that the unreachable Run is **absent from a
 * non-empty result**. A test that only checked for a thrown error would pass
 * straight through the regression, because the regression does not throw.
 *
 * What this does NOT prove: it runs against a stub, so it says nothing about
 * whether the real Prisma query is correct — the same blind spot recorded for
 * PrismaReviewStore. It exercises no part of the screen: nothing here asserts
 * that the cap is stated, that an unknown cost renders as unknown, or that an
 * interrupted Run is labelled. Do not grow it into a general router suite.
 */

const USER_ID = "user-00000000";
const MINE = 100;
const THEIRS = 200;

function fakeIdentity(reachable: number[]): GitHubIdentity {
  return {
    reachableInstallations(): Promise<ReachableInstallation[]> {
      return Promise.resolve(
        reachable.map((id) => ({
          githubInstallationId: id,
          accountLogin: `account-${id}`,
          accountType: "Organization",
        })),
      );
    },
  };
}

function run(githubInstallationId: number, title: string) {
  return {
    githubInstallationId,
    row: {
      id: `run-${githubInstallationId}`,
      status: "completed" as const,
      outcomeReason: null,
      costUsd: 0.02,
      startedAt: new Date("2026-08-01T00:00:00.000Z"),
      headSha: "a".repeat(40),
      review: {
        pullRequestNumber: 1,
        title,
        repository: {
          owner: "acme",
          name: "app",
          installation: { accountLogin: `account-${githubInstallationId}` },
        },
      },
    },
  };
}

const RUNS = [run(MINE, "My pull request"), run(THEIRS, "Someone else's")];

/**
 * Interprets the `where` clause it is handed rather than asserting on it.
 *
 * That distinction matters: asserting the query shape would be a test of
 * implementation, and would keep passing if the filter were built correctly
 * and then never applied. Interpreting it means a router that omits the
 * filter gets every row back, and the test fails on the leak itself.
 */
function stubClient() {
  return {
    reviewRun: {
      findMany(args?: {
        where?: {
          review?: {
            repository?: {
              installation?: { githubInstallationId?: { in?: bigint[] } };
            };
          };
        };
      }) {
        const allowed =
          args?.where?.review?.repository?.installation?.githubInstallationId
            ?.in;
        const rows =
          allowed === undefined
            ? RUNS
            : RUNS.filter((candidate) =>
                allowed.includes(BigInt(candidate.githubInstallationId)),
              );
        return Promise.resolve(rows.map((candidate) => candidate.row));
      },
    },
  };
}

function caller(
  reachable: number[],
  session: Session | null = {
    user: { id: USER_ID },
    expires: "2099-01-01T00:00:00.000Z",
  },
) {
  return createCaller({
    client: stubClient() as unknown as PrismaClient,
    github: fakeIdentity(reachable),
    session,
    headers: new Headers(),
  });
}

describe("the Review Run feed", () => {
  test("omits Runs from an Installation the user cannot reach", async () => {
    const trpc = caller([MINE]);

    const feed = await trpc.reviewRun.list();

    // Non-empty, so the filter is doing work rather than returning nothing.
    expect(feed.runs).toHaveLength(1);
    expect(feed.runs[0]!.title).toBe("My pull request");

    // The leak, stated directly: no part of the other tenant's Run appears.
    const titles = feed.runs.map((entry) => entry.title);
    expect(titles).not.toContain("Someone else's");
  });

  test("returns nothing at all when no Installation is reachable", async () => {
    const trpc = caller([]);

    const feed = await trpc.reviewRun.list();

    expect(feed.runs).toEqual([]);
    expect(feed.installationCount).toBe(0);
  });

  /**
   * The positive control. Without it, the first test would still pass if the
   * router simply returned an empty list to everyone.
   */
  test("includes Runs from every Installation the user can reach", async () => {
    const trpc = caller([MINE, THEIRS]);

    const feed = await trpc.reviewRun.list();

    expect(feed.runs).toHaveLength(2);
    expect(feed.installationCount).toBe(2);
  });
});

describe("a signed-out caller", () => {
  test("is UNAUTHORIZED before GitHub is asked anything", async () => {
    const trpc = caller([MINE], null);

    let code: string | null = null;
    try {
      await trpc.reviewRun.list();
    } catch (error) {
      code = error instanceof TRPCError ? error.code : null;
    }

    expect(code).toBe("UNAUTHORIZED");
  });
});
