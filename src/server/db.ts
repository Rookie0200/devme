import { PrismaClient } from "@prisma/client";

// No `datasources` override here: prisma/schema.prisma already reads
// DATABASE_URL via env("DATABASE_URL"), which resolves lazily. An explicit
// `datasources: { db: { url: process.env.DATABASE_URL } }` duplicates that
// but evaluates eagerly and passes `undefined` when the var isn't set yet —
// which is exactly what `next build` does while collecting page data inside
// the Docker build stage (SKIP_ENV_VALIDATION=1 is set there, DATABASE_URL is
// not). Prisma's constructor validates an explicit override strictly and
// throws PrismaClientConstructorValidationError; omitting the override keeps
// resolution lazy, so the build doesn't need a real database to succeed.
const createPrismaClient = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const client = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;

// Graceful shutdown handlers for Azure PostgreSQL connections
const shutdown = async () => {
  console.log("🔌 Disconnecting from Azure PostgreSQL...");
  await client.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

// Helper function to execute database operations with retry logic
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || "";
      
      // Check if it's a connection error that's worth retrying
      const isConnectionError = 
        errorMessage.includes("Connection") ||
        errorMessage.includes("Closed") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("timeout");
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`⚠️ Database connection error, retrying (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
        
        // Try to reconnect
        try {
          await client.$disconnect();
          await client.$connect();
        } catch {
          // Ignore reconnection errors, the next operation will try anyway
        }
      } else {
        throw lastError;
      }
    }
  }
  
  // Unreachable: the loop either returns or throws. Satisfies the compiler
  // without throwing a possibly-null value.
  throw lastError ?? new Error("withDbRetry exhausted without an error");
}
