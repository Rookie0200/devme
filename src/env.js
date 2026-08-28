import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),
    // Indexing is funded by the platform, not by an Installation's Provider
    // Key, so these are the application's own credentials.
    GROQ_API_KEY: z.string().min(1),
    GROQ_CHAT_MODEL: z.string().optional(),
    HF_TOKEN: z.string().optional(),

    // The GitHub App identity that posts reviews. Repository access comes from
    // an installation token minted per Installation — never a stored PAT.
    GITHUB_APP_ID: z.string().min(1),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),

    // GitHub OAuth establishes dashboard identity only. It grants no
    // repository access.
    GITHUB_OAUTH_CLIENT_ID: z.string().min(1),
    GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1),

    // 32 bytes, base64-encoded. Wraps every Provider Key at rest and lives
    // only in the environment. The length is checked here rather than only at
    // first use, because a placeholder that is merely non-empty otherwise
    // passes the build and fails on the first review instead.
    ENCRYPTION_MASTER_KEY: z
      .string()
      .refine((value) => Buffer.from(value, "base64").length === 32, {
        message:
          "must decode to 32 bytes. Generate one with: openssl rand -base64 32",
      }),

    REDIS_URL: z.string().url(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_CHAT_MODEL: process.env.GROQ_CHAT_MODEL,
    HF_TOKEN: process.env.HF_TOKEN,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
    GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
    REDIS_URL: process.env.REDIS_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
