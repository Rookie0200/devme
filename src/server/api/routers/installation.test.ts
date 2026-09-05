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
 * The second test seam in this repository, and a deliberately narrow one.
 *
 * It exists for one property: an Installation the signed-in user cannot reach
 * on GitHub must answer NOT_FOUND and never FORBIDDEN, because FORBIDDEN
 * confirms the Installation is real to someone not entitled to know it. That
 * is a security decision, it is subtle enough to look like a mistake, and
 * losing it fails silently — the router keeps working and starts leaking.
 *
 * What this seam does NOT prove: it runs against a stub, so it says nothing
 * about whether the real Prisma queries are correct — the same blind spot
 * CLAUDE.md records for PrismaReviewStore. It also says nothing about the
 * dashboard. Do not grow it into a general router suite.
 */

const USER_ID = "user-00000000";
const REACHABLE_ID = "11111111-1111-4111-8111-111111111111";
const UNREACHABLE_ID = "22222222-2222-4222-8222-222222222222";
const ABSENT_ID = "33333333-3333-4333-8333-333333333333";

/** GitHub's answer, scripted. Constructed per test, so it holds no cache. */
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

/** Exactly the two Prisma calls these procedures reach. Nothing else. */
function stubClient(rows: Record<string, bigint>) {
  const deleted: string[] = [];
  return {
    deleted,
    installation: {
      findUnique(args: { where: { id: string } }) {
        const githubInstallationId = rows[args.where.id];
        return Promise.resolve(
          githubInstallationId === undefined ? null : { githubInstallationId },
        );
      },
    },
    providerKey: {
      deleteMany(args: { where: { installationId: string } }) {
        deleted.push(args.where.installationId);
        return Promise.resolve({ count: 1 });
      },
    },
  };
}

const ROWS = { [REACHABLE_ID]: 100n, [UNREACHABLE_ID]: 200n };

/**
 * The stub stands in for Prisma, which is a thousand-method interface we have
 * no intention of implementing. That one cast is the seam's honest edge —
 * `github` and `session` are substituted with no cast at all, which is the
 * point of typing the context field as an interface.
 */
function caller(
  reachable: number[],
  client = stubClient(ROWS),
  session: Session | null = {
    user: { id: USER_ID },
    expires: "2099-01-01T00:00:00.000Z",
  },
) {
  const trpc = createCaller({
    client: client as unknown as PrismaClient,
    github: fakeIdentity(reachable),
    // Unused by this router; present only because the context type requires it.
    githubApp: {
      redeliverWebhook: () =>
        Promise.reject(new Error("not used by installation.ts")),
    },
    session,
    headers: new Headers(),
  });
  return { trpc, client };
}

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  throw new Error("expected the procedure to reject, but it resolved");
}

describe("an Installation the user cannot reach on GitHub", () => {
  test("is NOT_FOUND rather than FORBIDDEN when setting a Provider Key", async () => {
    const { trpc } = caller([100]);

    const code = await codeOf(
      trpc.installation.setProviderKey({
        installationId: UNREACHABLE_ID,
        apiKey: "sk-ant-whatever",
      }),
    );

    expect(code).toBe("NOT_FOUND");
    expect(code).not.toBe("FORBIDDEN");
  });

  test("is NOT_FOUND rather than FORBIDDEN when removing a Provider Key", async () => {
    const { trpc, client } = caller([100]);

    const code = await codeOf(
      trpc.installation.removeProviderKey({ installationId: UNREACHABLE_ID }),
    );

    expect(code).toBe("NOT_FOUND");
    expect(code).not.toBe("FORBIDDEN");
    // The check ran before the write, not after it.
    expect(client.deleted).toEqual([]);
  });

  test("is indistinguishable from an Installation that does not exist", async () => {
    const { trpc } = caller([100]);

    const absent = await codeOf(
      trpc.installation.removeProviderKey({ installationId: ABSENT_ID }),
    );
    const unreachable = await codeOf(
      trpc.installation.removeProviderKey({ installationId: UNREACHABLE_ID }),
    );

    expect(absent).toBe(unreachable);
  });
});

describe("an Installation the user can reach on GitHub", () => {
  /**
   * The positive control. Without it every test above would still pass if
   * `assertReachable` simply threw NOT_FOUND unconditionally.
   */
  test("removes its Provider Key", async () => {
    const { trpc, client } = caller([100]);

    const result = await trpc.installation.removeProviderKey({
      installationId: REACHABLE_ID,
    });

    expect(result).toEqual({ removed: true });
    expect(client.deleted).toEqual([REACHABLE_ID]);
  });
});

describe("a signed-out caller", () => {
  test("is UNAUTHORIZED before any Installation is looked up", async () => {
    const { trpc, client } = caller([100], stubClient(ROWS), null);

    const code = await codeOf(
      trpc.installation.removeProviderKey({ installationId: REACHABLE_ID }),
    );

    expect(code).toBe("UNAUTHORIZED");
    expect(client.deleted).toEqual([]);
  });
});
