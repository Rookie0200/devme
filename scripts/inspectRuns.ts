/**
 * The operator view, over SSH:
 *
 *   docker compose exec worker bun run scripts/inspectRuns.ts [limit]
 *
 * Recent Review Runs across *every* Installation, grouped by Installation,
 * with status, outcome reason and cost.
 *
 * It deliberately ignores reachability. That is what makes it an operator tool
 * and not a screen: `/dashboard/runs` shows a signed-in user only the
 * Installations GitHub says they can reach, correctly, and there is no
 * cross-Installation view in the product on purpose. `docs/adr/0006` draws its
 * line around what a *customer* is shown; a maintainer with SSH access to the
 * database is not inside that argument.
 *
 * Building this into the dashboard instead would mean a new query, a new
 * router, and a new authorization question — "which humans are operators?" —
 * that `docs/adr/0001` spent an ADR avoiding.
 *
 * Read-only. It writes nothing and takes no arguments that could.
 */
import { PrismaClient } from "@prisma/client";

const limit = Number(process.argv[2] ?? 40);
if (!Number.isFinite(limit) || limit < 1) {
  console.error("usage: bun run scripts/inspectRuns.ts [limit]");
  process.exit(1);
}

const client = new PrismaClient();

const runs = await client.reviewRun.findMany({
  orderBy: { startedAt: "desc" },
  take: limit,
  select: {
    id: true,
    status: true,
    outcomeReason: true,
    costUsd: true,
    model: true,
    headSha: true,
    startedAt: true,
    completedAt: true,
    _count: { select: { results: true, findings: true } },
    review: {
      select: {
        pullRequestNumber: true,
        title: true,
        repository: {
          select: {
            owner: true,
            name: true,
            indexedAt: true,
            installation: {
              select: {
                githubInstallationId: true,
                accountLogin: true,
                deletedAt: true,
                providerKey: {
                  select: { hint: true, lastAuthFailureAt: true },
                },
              },
            },
          },
        },
      },
    },
  },
});

/** The same thirty minutes the feed uses when it calls a Run interrupted. */
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

function describe(run: (typeof runs)[number]): string {
  if (
    run.status === "running" &&
    Date.now() - run.startedAt.getTime() > ABANDONED_AFTER_MS
  ) {
    return "interrupted";
  }
  return run.outcomeReason ? `${run.status} (${run.outcomeReason})` : run.status;
}

function age(at: Date): string {
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Group by Installation, newest activity first.
const byInstallation = new Map<string, typeof runs>();
for (const run of runs) {
  const key = run.review.repository.installation.accountLogin;
  const bucket = byInstallation.get(key) ?? [];
  bucket.push(run);
  byInstallation.set(key, bucket);
}

if (runs.length === 0) {
  console.log("No Review Runs recorded yet.");
} else {
  console.log(
    `${runs.length} most recent Review Run(s) across ${byInstallation.size} Installation(s)\n`,
  );
}

for (const [login, installationRuns] of byInstallation) {
  const installation = installationRuns[0]!.review.repository.installation;
  const key = installation.providerKey;

  const keyState = !key
    ? "no provider key"
    : key.lastAuthFailureAt
      ? `key ••••${key.hint} REFUSED ${age(key.lastAuthFailureAt)}`
      : `key ••••${key.hint}`;

  console.log("═".repeat(76));
  console.log(
    `${login}  (installation ${installation.githubInstallationId})` +
      `${installation.deletedAt ? "  — UNINSTALLED" : ""}`,
  );
  console.log(`  ${keyState}`);
  console.log("═".repeat(76));

  for (const run of installationRuns) {
    const repo = run.review.repository;
    const title = run.review.title ?? "(title not recorded)";
    const cost =
      run.costUsd === null ? "cost unknown" : `$${run.costUsd.toFixed(4)}`;

    console.log(
      `  ${repo.owner}/${repo.name} #${run.review.pullRequestNumber} · ${run.headSha.slice(0, 7)}`,
    );
    console.log(`    ${title}`);
    console.log(
      `    ${describe(run).padEnd(28)} ${run._count.results} criteria · ${run._count.findings} findings`,
    );
    console.log(
      `    ${cost.padEnd(28)} ${run.model ?? "no model"}${repo.indexedAt ? "" : " · repo NOT INDEXED"}`,
    );
    console.log(
      `    started ${age(run.startedAt)}${run.completedAt ? "" : ", never completed"}`,
    );
    console.log();
  }
}

await client.$disconnect();
