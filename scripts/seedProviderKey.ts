/**
 * Seed an Installation's Provider Key from the command line.
 *
 * The dashboard has no settings page yet, so there is otherwise no way to get a
 * key into the database for local development. This mirrors what
 * `installation.setProviderKey` does — validate, encrypt under
 * `ENCRYPTION_MASTER_KEY`, upsert — minus the GitHub reachability check, which
 * exists to stop one signed-in user configuring another org's Installation and
 * is meaningless from a shell on the developer's own machine.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... bun run db:seed-key
 *   bun run db:seed-key --installation my-org
 *   bun run db:seed-key --skip-validation
 *
 * The key is read from the environment or prompted for, never taken as an
 * argument, so it does not land in shell history. Only the hint is printed.
 */
import { env } from "@/env";
import { client } from "@/server/db";
import { encryptProviderKey } from "@/server/review/crypto/providerKey";
import { validateProviderKey } from "@/server/review/model/anthropic";

function flagValue(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

function readKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const typed = prompt("Anthropic API key:")?.trim();
  if (!typed) {
    throw new Error(
      "No key given. Set ANTHROPIC_API_KEY or type one at the prompt.",
    );
  }
  return typed;
}

async function main(): Promise<void> {
  const installations = await client.installation.findMany({
    where: { deletedAt: null },
    select: { id: true, accountLogin: true, accountType: true },
    orderBy: { createdAt: "asc" },
  });

  if (installations.length === 0) {
    throw new Error(
      "No Installations found. Install the GitHub App on an account first — the\n" +
        "`installation` webhook is what creates the row a Provider Key hangs off.",
    );
  }

  const wanted = flagValue("--installation");
  const matches = wanted
    ? installations.filter((i) => i.accountLogin === wanted)
    : installations;

  if (matches.length === 0) {
    throw new Error(
      `No Installation for "${wanted}". Found: ${installations
        .map((i) => i.accountLogin)
        .join(", ")}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} Installations found. Choose one with --installation <login>: ${matches
        .map((i) => i.accountLogin)
        .join(", ")}`,
    );
  }

  const installation = matches[0]!;
  const apiKey = readKey();

  if (process.argv.includes("--skip-validation")) {
    console.log("Skipping validation — the key is not being checked.");
  } else {
    console.log("Checking the key against Anthropic...");
    const checked = await validateProviderKey(apiKey);
    if (!checked.ok) {
      throw new Error(checked.reason);
    }
  }

  const encrypted = encryptProviderKey(apiKey, env.ENCRYPTION_MASTER_KEY);

  await client.providerKey.upsert({
    where: { installationId: installation.id },
    update: {
      ...encrypted,
      provider: "anthropic",
      validatedAt: new Date(),
      // Same as the dashboard path: saving a key clears the record of one
      // that was refused, or the break-glass route would leave a warning
      // standing over a credential that has just been replaced.
      lastAuthFailureAt: null,
    },
    create: {
      ...encrypted,
      provider: "anthropic",
      validatedAt: new Date(),
      installationId: installation.id,
    },
  });

  console.log(
    `Provider Key saved for ${installation.accountLogin} (${installation.accountType}), ending ${encrypted.hint}.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
