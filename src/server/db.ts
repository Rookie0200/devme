import { PrismaClient } from "@prisma/client";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
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

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

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
  
  throw lastError;
}
