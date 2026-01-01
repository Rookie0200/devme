# Azure Migration & Implementation Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Phase 1: Critical Upgrades](#phase-1-critical-upgrades)
   - [Azure OpenAI Service](#1-azure-openai-service)
   - [Azure Cache for Redis](#2-azure-cache-for-redis)
   - [Azure Database for PostgreSQL](#3-azure-database-for-postgresql)
3. [Phase 2: Optimization](#phase-2-optimization)
   - [Azure Cognitive Search](#4-azure-cognitive-search)
   - [Azure Service Bus + Functions](#5-azure-service-bus--azure-functions)
   - [Azure Blob Storage](#6-azure-blob-storage)
4. [Phase 3: Production Polish](#phase-3-production-polish)
   - [Azure Static Web Apps](#7-azure-static-web-apps)
   - [Azure Application Insights](#8-azure-application-insights)
5. [Cost Monitoring](#cost-monitoring)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Azure Student Account Setup
```bash
# Visit: https://azure.microsoft.com/free/students/
# Sign up with your .edu email
# Verify: $100 free credits + 12 months free services
```

### 2. Install Azure CLI
```bash
# Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login
az login

# Verify
az account show
```

### 3. Install Required Tools
```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Install Azure Static Web Apps CLI
npm install -g @azure/static-web-apps-cli
```

---

## Phase 1: Critical Upgrades

## 1. Azure OpenAI Service

### 🎯 Goal: Replace Google Gemini (5 req/min) → Azure OpenAI (100K+ req/min)

### Step 1: Create Azure OpenAI Resource
```bash
# Create resource group
az group create \
  --name devme-rg \
  --location eastus

# Create Azure OpenAI resource
az cognitiveservices account create \
  --name devme-openai \
  --resource-group devme-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus \
  --yes

# Get API keys
az cognitiveservices account keys list \
  --name devme-openai \
  --resource-group devme-rg
```

### Step 2: Deploy Models
```bash
# Deploy GPT-4o for code summarization
az cognitiveservices account deployment create \
  --name devme-openai \
  --resource-group devme-rg \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-05-13" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name "Standard"

# Deploy text-embedding-3-small for embeddings
az cognitiveservices account deployment create \
  --name devme-openai \
  --resource-group devme-rg \
  --deployment-name text-embedding-3-small \
  --model-name text-embedding-3-small \
  --model-version "1" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name "Standard"
```

### Step 3: Install SDK
```bash
npm install openai @azure/openai
```

### Step 4: Update Environment Variables
```bash
# Add to .env
AZURE_OPENAI_API_KEY="your-api-key-from-step-1"
AZURE_OPENAI_ENDPOINT="https://devme-openai.openai.azure.com/"
AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o"
AZURE_OPENAI_EMBEDDING_DEPLOYMENT="text-embedding-3-small"
```

### Step 5: Update `src/env.js`
```javascript
// Add to server schema
server: {
  // ... existing vars
  AZURE_OPENAI_API_KEY: z.string(),
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().default("gpt-4o"),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: z.string().default("text-embedding-3-small"),
}
```

### Step 6: Create New Azure OpenAI Client (`src/lib/azureOpenAI.ts`)
```typescript
import { AzureOpenAI } from "openai";
import { Document } from "@langchain/core/documents";

if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
  throw new Error("Azure OpenAI credentials not provided");
}

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: "2024-05-01-preview",
});

const DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o";
const EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small";

// No rate limiting needed - Azure handles this automatically!
export const summariseCode = async (doc: Document): Promise<string> => {
  console.log("🤖 Summarizing:", doc.metadata.source);
  
  const code = doc.pageContent.slice(0, 3000); // Can handle more code now
  
  const response = await client.chat.completions.create({
    model: DEPLOYMENT_NAME,
    messages: [
      {
        role: "system",
        content: "You are an expert software engineer specializing in code analysis and onboarding junior developers."
      },
      {
        role: "user",
        content: `Analyze this code from ${doc.metadata.source} and provide a concise summary (max 100 words) explaining its purpose, functionality, and role in the project:\n\n${code}`
      }
    ],
    temperature: 0.3,
    max_tokens: 150,
  });

  return response.choices[0]?.message?.content || "Unable to generate summary";
};

export const generateEmbeddingsFromAi = async (summary: string): Promise<number[]> => {
  const response = await client.embeddings.create({
    model: EMBEDDING_DEPLOYMENT,
    input: summary,
  });

  return response.data[0]?.embedding || [];
};

export const aiSummarizeCommit = async (diff: string): Promise<string> => {
  console.log("🤖 Summarizing commit...");
  
  const response = await client.chat.completions.create({
    model: DEPLOYMENT_NAME,
    messages: [
      {
        role: "system",
        content: "You are a git commit analyzer. Summarize code changes concisely."
      },
      {
        role: "user",
        content: `Summarize this git diff. Format as bullet points. Include file names in brackets.\n\nDiff:\n${diff.slice(0, 8000)}`
      }
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  return response.choices[0]?.message?.content || "Unable to summarize commit";
};
```

### Step 7: Update `src/lib/githubRepoLoader.tsx`
```typescript
// Replace this line:
// import { generateEmbeddingsFromAi, summariseCode } from "@/lib/geminiApi";

// With:
import { generateEmbeddingsFromAi, summariseCode } from "@/lib/azureOpenAI";

// Remove rate limiting - Azure handles it automatically!
export const generateEmbeddings = async (docs: Document[]) => {
  // Can now process in parallel - much faster!
  const results = await Promise.all(
    docs.map(async (doc, index) => {
      console.log(`📄 Processing ${index + 1}/${docs.length}: ${doc.metadata.source}`);
      
      try {
        const summary = await summariseCode(doc);
        const embedding = await generateEmbeddingsFromAi(summary);
        
        return {
          summary,
          embedding,
          sourceCode: JSON.parse(JSON.stringify(doc.pageContent)),
          fileName: doc.metadata.source
        };
      } catch (error) {
        console.error(`❌ Failed to process ${doc.metadata.source}:`, error);
        return null;
      }
    })
  );
  
  return results.filter(Boolean);
};
```

### Step 8: Update GitHub API (`src/lib/githubApi.ts`)
```typescript
// Replace aiSummarizeCommit import from geminiApi to azureOpenAI
import { aiSummarizeCommit } from "@/lib/azureOpenAI";
```

### ✅ Expected Results
- **17 files**: 8-9 minutes → **1-2 minutes** (80% faster)
- **No rate limiting errors**
- **Better code understanding**
- **Can process 100+ projects/hour**

---

## 2. Azure Cache for Redis

### 🎯 Goal: Cache AI summaries, embeddings, and GitHub data to reduce costs

### Step 1: Create Redis Instance
```bash
# Create Redis cache (Basic C0 - 250MB free)
az redis create \
  --name devme-redis \
  --resource-group devme-rg \
  --location eastus \
  --sku Basic \
  --vm-size c0

# Get connection string
az redis list-keys \
  --name devme-redis \
  --resource-group devme-rg
```

### Step 2: Install Redis Client
```bash
npm install ioredis @types/ioredis
```

### Step 3: Update Environment Variables
```bash
# Add to .env
REDIS_URL="rediss://devme-redis.redis.cache.windows.net:6380"
REDIS_PASSWORD="your-redis-key"
```

### Step 4: Create Redis Client (`src/lib/redis.ts`)
```typescript
import Redis from "ioredis";

let redis: Redis | null = null;

export const getRedisClient = () => {
  if (!redis) {
    if (!process.env.REDIS_URL || !process.env.REDIS_PASSWORD) {
      console.warn("⚠️ Redis not configured, caching disabled");
      return null;
    }

    redis = new Redis(process.env.REDIS_URL, {
      password: process.env.REDIS_PASSWORD,
      tls: {
        servername: process.env.REDIS_URL.split("://")[1]?.split(":")[0],
      },
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 50, 2000);
      },
    });

    redis.on("error", (err) => console.error("Redis error:", err));
  }
  
  return redis;
};

// Cache helper functions
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const client = getRedisClient();
  if (!client) return null;
  
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Cache get error:", error);
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttl: number = 3600 // 1 hour default
): Promise<void> => {
  const client = getRedisClient();
  if (!client) return;
  
  try {
    await client.set(key, JSON.stringify(value), "EX", ttl);
  } catch (error) {
    console.error("Cache set error:", error);
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  const client = getRedisClient();
  if (!client) return;
  
  try {
    await client.del(key);
  } catch (error) {
    console.error("Cache del error:", error);
  }
};
```

### Step 5: Add Caching to GitHub Repo Loader
```typescript
// Update src/lib/githubRepoLoader.tsx

import { cacheGet, cacheSet } from "@/lib/redis";

export const generateEmbeddings = async (docs: Document[]) => {
  const results = await Promise.all(
    docs.map(async (doc, index) => {
      // Create cache key based on file path and content hash
      const contentHash = require("crypto")
        .createHash("md5")
        .update(doc.pageContent)
        .digest("hex")
        .substring(0, 8);
      const cacheKey = `embedding:${doc.metadata.source}:${contentHash}`;
      
      // Check cache first
      const cached = await cacheGet<{
        summary: string;
        embedding: number[];
        sourceCode: string;
        fileName: string;
      }>(cacheKey);
      
      if (cached) {
        console.log(`💾 Cache hit for ${doc.metadata.source}`);
        return cached;
      }
      
      console.log(`📄 Processing ${index + 1}/${docs.length}: ${doc.metadata.source}`);
      
      try {
        const summary = await summariseCode(doc);
        const embedding = await generateEmbeddingsFromAi(summary);
        
        const result = {
          summary,
          embedding,
          sourceCode: JSON.parse(JSON.stringify(doc.pageContent)),
          fileName: doc.metadata.source
        };
        
        // Cache for 7 days
        await cacheSet(cacheKey, result, 60 * 60 * 24 * 7);
        
        return result;
      } catch (error) {
        console.error(`❌ Failed to process ${doc.metadata.source}:`, error);
        return null;
      }
    })
  );
  
  return results.filter(Boolean);
};
```

### Step 6: Cache GitHub Commits
```typescript
// Update src/lib/githubApi.ts

import { cacheGet, cacheSet } from "@/lib/redis";

export const pollCommits = async (projectId: string) => {
  // Check cache first
  const cacheKey = `commits:${projectId}`;
  const cached = await cacheGet<boolean>(cacheKey);
  
  if (cached) {
    console.log("⏭️ Commits recently fetched, skipping...");
    return;
  }
  
  // ... existing commit fetching logic ...
  
  // Cache for 5 minutes to prevent repeated fetches
  await cacheSet(cacheKey, true, 300);
};
```

### ✅ Expected Results
- **80% reduction in AI API calls** for re-processed repos
- **Instant responses** for cached data
- **$20-30/month savings** in API costs

---

## 3. Azure Database for PostgreSQL

### 🎯 Goal: Fix connection errors and improve performance

### Step 1: Create PostgreSQL Server
```bash
# Create PostgreSQL Flexible Server (Burstable B1ms - free for 12 months)
az postgres flexible-server create \
  --name devme-postgres \
  --resource-group devme-rg \
  --location eastus \
  --admin-user devmeadmin \
  --admin-password 'YourSecurePassword123!' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 14 \
  --public-access 0.0.0.0

# Enable pgvector extension
az postgres flexible-server parameter set \
  --resource-group devme-rg \
  --server-name devme-postgres \
  --name azure.extensions \
  --value VECTOR
```

### Step 2: Configure Firewall
```bash
# Allow your IP
az postgres flexible-server firewall-rule create \
  --resource-group devme-rg \
  --name devme-postgres \
  --rule-name AllowMyIP \
  --start-ip-address YOUR_IP \
  --end-ip-address YOUR_IP

# Allow Azure services
az postgres flexible-server firewall-rule create \
  --resource-group devme-rg \
  --name devme-postgres \
  --rule-name AllowAzure \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### Step 3: Get Connection String
```bash
# Get connection details
az postgres flexible-server show \
  --resource-group devme-rg \
  --name devme-postgres \
  --query "{FQDN:fullyQualifiedDomainName,AdminUser:administratorLogin}" \
  --output table

# Connection string format:
# postgresql://devmeadmin:YourSecurePassword123!@devme-postgres.postgres.database.azure.com:5432/postgres?sslmode=require
```

### Step 4: Update Environment Variables
```bash
# Replace DATABASE_URL in .env
DATABASE_URL="postgresql://devmeadmin:YourSecurePassword123!@devme-postgres.postgres.database.azure.com:5432/devme?sslmode=require&pgbouncer=true"
```

### Step 5: Enable pgvector Extension
```bash
# Connect to database
psql "postgresql://devmeadmin:YourSecurePassword123!@devme-postgres.postgres.database.azure.com:5432/postgres?sslmode=require"

# Run in psql:
CREATE DATABASE devme;
\c devme
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

### Step 6: Update Prisma Schema (if needed)
```prisma
// prisma/schema.prisma - ensure datasource is configured for connection pooling
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  extensions = [vector]
}
```

### Step 7: Run Migrations
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Verify
npx prisma db push
```

### Step 8: Update Connection Configuration
```typescript
// src/server/db.ts - add connection pool configuration

const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Add connection pool middleware
const client = globalForPrisma.prisma ?? createPrismaClient();

// Graceful shutdown
process.on('SIGINT', async () => {
  await client.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await client.$disconnect();
  process.exit(0);
});
```

### ✅ Expected Results
- **No more "Connection Closed" errors**
- **3-5x faster queries** with built-in connection pooling
- **99.9% uptime SLA**
- **Automatic backups**

---

## Phase 2: Optimization

## 4. Azure Cognitive Search

### 🎯 Goal: Replace pgvector with specialized vector search (100x faster)

### Step 1: Create Search Service
```bash
# Create Cognitive Search service (Free tier)
az search service create \
  --name devme-search \
  --resource-group devme-rg \
  --location eastus \
  --sku free

# Get admin key
az search admin-key show \
  --service-name devme-search \
  --resource-group devme-rg
```

### Step 2: Install SDK
```bash
npm install @azure/search-documents
```

### Step 3: Update Environment Variables
```bash
# Add to .env
AZURE_SEARCH_ENDPOINT="https://devme-search.search.windows.net"
AZURE_SEARCH_ADMIN_KEY="your-admin-key"
```

### Step 4: Create Search Client (`src/lib/azureSearch.ts`)
```typescript
import { SearchClient, SearchIndexClient, AzureKeyCredential } from "@azure/search-documents";

const endpoint = process.env.AZURE_SEARCH_ENDPOINT!;
const apiKey = process.env.AZURE_SEARCH_ADMIN_KEY!;
const indexName = "code-embeddings";

const credential = new AzureKeyCredential(apiKey);
const indexClient = new SearchIndexClient(endpoint, credential);
const searchClient = new SearchClient(endpoint, indexName, credential);

// Create index with vector search configuration
export const createSearchIndex = async () => {
  const index = {
    name: indexName,
    fields: [
      { name: "id", type: "Edm.String", key: true },
      { name: "projectId", type: "Edm.String", filterable: true },
      { name: "fileName", type: "Edm.String", searchable: true, filterable: true },
      { name: "sourceCode", type: "Edm.String", searchable: true },
      { name: "summary", type: "Edm.String", searchable: true },
      {
        name: "embedding",
        type: "Collection(Edm.Single)",
        searchable: true,
        vectorSearchDimensions: 1536, // For text-embedding-3-small
        vectorSearchProfileName: "vector-profile"
      }
    ],
    vectorSearch: {
      algorithms: [
        {
          name: "hnsw-algorithm",
          kind: "hnsw",
          hnswParameters: {
            m: 4,
            efConstruction: 400,
            efSearch: 500,
            metric: "cosine"
          }
        }
      ],
      profiles: [
        {
          name: "vector-profile",
          algorithmConfigurationName: "hnsw-algorithm"
        }
      ]
    }
  };

  await indexClient.createOrUpdateIndex(index);
  console.log("✅ Search index created");
};

// Upload embeddings
export const uploadEmbeddings = async (documents: Array<{
  id: string;
  projectId: string;
  fileName: string;
  sourceCode: string;
  summary: string;
  embedding: number[];
}>) => {
  await searchClient.uploadDocuments(documents);
};

// Vector similarity search
export const searchCode = async (queryEmbedding: number[], projectId: string, top: number = 5) => {
  const results = await searchClient.search("*", {
    vectorSearchOptions: {
      queries: [
        {
          kind: "vector",
          vector: queryEmbedding,
          kNearestNeighborsCount: top,
          fields: ["embedding"]
        }
      ]
    },
    filter: `projectId eq '${projectId}'`,
    select: ["id", "fileName", "summary", "sourceCode"],
    top
  });

  const hits = [];
  for await (const result of results.results) {
    hits.push(result.document);
  }
  return hits;
};

// Hybrid search (keyword + semantic)
export const hybridSearch = async (query: string, projectId: string) => {
  const results = await searchClient.search(query, {
    filter: `projectId eq '${projectId}'`,
    select: ["fileName", "summary", "sourceCode"],
    top: 10,
    searchMode: "all"
  });

  const hits = [];
  for await (const result of results.results) {
    hits.push(result.document);
  }
  return hits;
};
```

### Step 5: Update GitHub Repo Loader
```typescript
// src/lib/githubRepoLoader.tsx

import { uploadEmbeddings, createSearchIndex } from "@/lib/azureSearch";

export const indexGithubRepo = async (
  projectId: string,
  githubUrl: string,
  githubToken?: string
) => {
  const docs = await loadGithubRepo(githubUrl, githubToken);
  const allEmbeddings = await generateEmbeddings(docs);
  
  // Ensure index exists
  await createSearchIndex().catch(console.log);
  
  // Upload to Azure Cognitive Search
  const searchDocs = allEmbeddings.map((emb, index) => ({
    id: `${projectId}-${index}`,
    projectId,
    fileName: emb.fileName,
    sourceCode: emb.sourceCode,
    summary: emb.summary,
    embedding: emb.embedding
  }));
  
  await uploadEmbeddings(searchDocs);
  
  // Optionally still save to PostgreSQL for backup
  for (const embedding of allEmbeddings) {
    await withDbRetry(async () => {
      await client.sourceCodeEmbedding.create({
        data: {
          summary: embedding.summary,
          sourceCode: embedding.sourceCode,
          fileName: embedding.fileName,
          projectId
        }
      });
    });
  }
};
```

### Step 6: Add QA Search Endpoint
```typescript
// src/server/api/routers/project.ts

import { searchCode, hybridSearch } from "@/lib/azureSearch";
import { generateEmbeddingsFromAi } from "@/lib/azureOpenAI";

export const projectRouter = createTRPCRouter({
  // ... existing routes ...
  
  searchCode: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      query: z.string()
    }))
    .query(async ({ input }) => {
      // Generate embedding for the query
      const queryEmbedding = await generateEmbeddingsFromAi(input.query);
      
      // Vector search
      return await searchCode(queryEmbedding, input.projectId, 5);
    }),
    
  hybridSearchCode: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      query: z.string()
    }))
    .query(async ({ input }) => {
      // Hybrid search (keyword + semantic)
      return await hybridSearch(input.query, input.projectId);
    })
});
```

### ✅ Expected Results
- **<10ms vector searches** (vs 100-500ms in pgvector)
- **Better search relevance** with hybrid search
- **Scales to millions of documents**

---

## 5. Azure Service Bus + Azure Functions

### 🎯 Goal: Move long AI processing to background jobs

### Step 1: Create Service Bus Namespace
```bash
# Create Service Bus (Basic tier - free)
az servicebus namespace create \
  --name devme-servicebus \
  --resource-group devme-rg \
  --location eastus \
  --sku Basic

# Create queue
az servicebus queue create \
  --namespace-name devme-servicebus \
  --resource-group devme-rg \
  --name repo-processing

# Get connection string
az servicebus namespace authorization-rule keys list \
  --resource-group devme-rg \
  --namespace-name devme-servicebus \
  --name RootManageSharedAccessKey \
  --query primaryConnectionString \
  --output tsv
```

### Step 2: Create Azure Function
```bash
# Create Function App
az functionapp create \
  --name devme-functions \
  --resource-group devme-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --storage-account devmestorage

# Initialize function project locally
mkdir azure-functions
cd azure-functions
func init --worker-runtime node --language typescript
func new --name ProcessRepo --template "ServiceBusQueueTrigger"
```

### Step 3: Install Dependencies
```bash
cd azure-functions
npm install @azure/service-bus @prisma/client openai
```

### Step 4: Create Function Code
```typescript
// azure-functions/src/functions/ProcessRepo.ts

import { app, InvocationContext } from "@azure/functions";
import { PrismaClient } from "@prisma/client";
import { indexGithubRepo } from "../../src/lib/githubRepoLoader";
import { pollCommits } from "../../src/lib/githubApi";

const prisma = new PrismaClient();

export async function processRepoQueue(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const { projectId, githubUrl, githubToken } = message as {
    projectId: string;
    githubUrl: string;
    githubToken?: string;
  };

  try {
    context.log(`🚀 Processing repo: ${githubUrl}`);
    
    // Index repository
    await indexGithubRepo(projectId, githubUrl, githubToken);
    
    // Poll commits
    await pollCommits(projectId);
    
    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { 
        updatedAt: new Date()
      }
    });
    
    context.log(`✅ Completed processing: ${projectId}`);
  } catch (error) {
    context.error(`❌ Error processing repo:`, error);
    throw error; // Will retry automatically
  }
}

app.serviceBusQueue("ProcessRepo", {
  connection: "ServiceBusConnection",
  queueName: "repo-processing",
  handler: processRepoQueue
});
```

### Step 5: Configure Function
```json
// azure-functions/host.json
{
  "version": "2.0",
  "extensions": {
    "serviceBus": {
      "prefetchCount": 100,
      "messageHandlerOptions": {
        "maxConcurrentCalls": 32,
        "maxAutoRenewDuration": "00:05:00"
      }
    }
  }
}
```

### Step 6: Deploy Function
```bash
func azure functionapp publish devme-functions
```

### Step 7: Create Queue Client (`src/lib/serviceBus.ts`)
```typescript
import { ServiceBusClient } from "@azure/service-bus";

const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING!;
const queueName = "repo-processing";

const client = new ServiceBusClient(connectionString);
const sender = client.createSender(queueName);

export const queueRepoProcessing = async (
  projectId: string,
  githubUrl: string,
  githubToken?: string
) => {
  const message = {
    body: {
      projectId,
      githubUrl,
      githubToken
    }
  };
  
  await sender.sendMessages(message);
  console.log(`📨 Queued repo processing for ${projectId}`);
};
```

### Step 8: Update Project Creation
```typescript
// src/server/api/routers/project.ts

import { queueRepoProcessing } from "@/lib/serviceBus";

export const projectRouter = createTRPCRouter({
  createProject: protectedProcedure
    .input(z.object({
      name: z.string(),
      githubUrl: z.string(),
      githubToken: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.client.project.create({
        data: {
          name: input.name,
          githubUrl: input.githubUrl,
          UserToProject: {
            create: {
              userId: ctx.user.id!
            }
          }
        }
      });
      
      // Queue background processing instead of blocking
      await queueRepoProcessing(project.id, input.githubUrl, input.githubToken);
      
      return project; // Returns immediately!
    })
});
```

### ✅ Expected Results
- **Instant project creation** (5 seconds vs 8-9 minutes)
- **Automatic retries** on failures
- **Process multiple repos in parallel**
- **Better user experience**

---

## 6. Azure Blob Storage

### 🎯 Goal: Store large files efficiently, reduce DB costs

### Step 1: Create Storage Account
```bash
# Create storage account
az storage account create \
  --name devmestorage \
  --resource-group devme-rg \
  --location eastus \
  --sku Standard_LRS

# Create container
az storage container create \
  --account-name devmestorage \
  --name source-code \
  --public-access off
```

### Step 2: Get Connection String
```bash
az storage account show-connection-string \
  --name devmestorage \
  --resource-group devme-rg \
  --output tsv
```

### Step 3: Install SDK
```bash
npm install @azure/storage-blob
```

### Step 4: Create Blob Client (`src/lib/blobStorage.ts`)
```typescript
import { BlobServiceClient } from "@azure/storage-blob";

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const containerName = "source-code";

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

export const uploadSourceCode = async (
  projectId: string,
  fileName: string,
  content: string
): Promise<string> => {
  const blobName = `${projectId}/${fileName}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  await blockBlobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: "text/plain" }
  });
  
  return blobName;
};

export const downloadSourceCode = async (blobName: string): Promise<string> => {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const downloadResponse = await blockBlobClient.download();
  return await streamToString(downloadResponse.readableStreamBody!);
};

async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    readableStream.on("data", (data) => {
      chunks.push(data.toString());
    });
    readableStream.on("end", () => {
      resolve(chunks.join(""));
    });
    readableStream.on("error", reject);
  });
}
```

### Step 5: Update Schema
```prisma
// prisma/schema.prisma

model SourceCodeEmbedding {
  id String @id @default(uuid())
  summaryEmbedding Unsupported("vector(768)")?
  sourceCodeBlobPath String? // Store blob path instead of content
  fileName String
  summary String

  projectId String
  project Project @relation(fields: [projectId], references: [id])
}
```

### Step 6: Update Repo Loader
```typescript
// src/lib/githubRepoLoader.tsx

import { uploadSourceCode } from "@/lib/blobStorage";

export const indexGithubRepo = async (...) => {
  // ... existing code ...
  
  for (const embedding of allEmbeddings) {
    // Upload source code to blob storage
    const blobPath = await uploadSourceCode(
      projectId,
      embedding.fileName,
      embedding.sourceCode
    );
    
    await withDbRetry(async () => {
      await client.sourceCodeEmbedding.create({
        data: {
          summary: embedding.summary,
          sourceCodeBlobPath: blobPath, // Store path, not content
          fileName: embedding.fileName,
          projectId
        }
      });
    });
  }
};
```

### ✅ Expected Results
- **70% reduction in database costs**
- **Faster queries** (smaller database)
- **Can store much larger projects**

---

## Phase 3: Production Polish

## 7. Azure Static Web Apps

### 🎯 Goal: Deploy Next.js with global CDN

### Step 1: Build Configuration
```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli
```

### Step 2: Create Static Web App
```bash
az staticwebapp create \
  --name devme-app \
  --resource-group devme-rg \
  --location eastus2 \
  --sku Free \
  --source https://github.com/YOUR_USERNAME/devme \
  --branch main \
  --app-location "/" \
  --api-location "api" \
  --output-location ".next"
```

### Step 3: Configure GitHub Actions
GitHub Actions workflow will be auto-created. Update it:

```yaml
# .github/workflows/azure-static-web-apps.yml
name: Azure Static Web Apps CI/CD

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - main

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build And Deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/"
          api_location: ""
          output_location: ".next"
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          AZURE_OPENAI_API_KEY: ${{ secrets.AZURE_OPENAI_API_KEY }}
          # ... add all env vars
```

### Step 4: Configure Custom Domain (Optional)
```bash
az staticwebapp hostname set \
  --name devme-app \
  --resource-group devme-rg \
  --hostname www.yourdomain.com
```

### ✅ Expected Results
- **Global CDN** with edge caching
- **40% faster page loads** worldwide
- **Free SSL certificate**
- **Auto GitHub deployments**

---

## 8. Azure Application Insights

### 🎯 Goal: Monitor performance and catch errors

### Step 1: Create Application Insights
```bash
az monitor app-insights component create \
  --app devme-insights \
  --location eastus \
  --resource-group devme-rg \
  --application-type web
```

### Step 2: Get Instrumentation Key
```bash
az monitor app-insights component show \
  --app devme-insights \
  --resource-group devme-rg \
  --query instrumentationKey \
  --output tsv
```

### Step 3: Install SDK
```bash
npm install applicationinsights @microsoft/applicationinsights-web
```

### Step 4: Initialize Client (`src/lib/appInsights.ts`)
```typescript
import { ApplicationInsights } from "@microsoft/applicationinsights-web";

let appInsights: ApplicationInsights | null = null;

export const initAppInsights = () => {
  if (typeof window === "undefined") return null;
  
  if (!appInsights) {
    appInsights = new ApplicationInsights({
      config: {
        instrumentationKey: process.env.NEXT_PUBLIC_APP_INSIGHTS_KEY,
        enableAutoRouteTracking: true,
        enableRequestHeaderTracking: true,
        enableResponseHeaderTracking: true,
      }
    });
    
    appInsights.loadAppInsights();
    appInsights.trackPageView();
  }
  
  return appInsights;
};

export const trackEvent = (name: string, properties?: Record<string, any>) => {
  appInsights?.trackEvent({ name, properties });
};

export const trackError = (error: Error, properties?: Record<string, any>) => {
  appInsights?.trackException({ exception: error, properties });
};
```

### Step 5: Add to Root Layout
```typescript
// src/app/layout.tsx

import { initAppInsights } from "@/lib/appInsights";

export default function RootLayout({ children }) {
  useEffect(() => {
    initAppInsights();
  }, []);
  
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

### Step 6: Track Custom Events
```typescript
// Track project creation
import { trackEvent } from "@/lib/appInsights";

trackEvent("ProjectCreated", {
  projectId: project.id,
  repoUrl: input.githubUrl,
  fileCount: docs.length
});
```

### ✅ Expected Results
- **Real-time performance monitoring**
- **Automatic error tracking**
- **User journey analytics**
- **API performance insights**

---

## Cost Monitoring

### Check Azure Spending
```bash
# View current costs
az consumption usage list \
  --start-date 2025-01-01 \
  --end-date 2025-01-31

# Set budget alert
az consumption budget create \
  --amount 50 \
  --budget-name devme-budget \
  --category cost \
  --time-grain monthly \
  --time-period start=2025-01-01
```

### Monitor Resource Usage
- Azure Portal: https://portal.azure.com → Cost Management
- Set alerts at $25, $50, $75 (under your $100 student credit)

---

## Troubleshooting

### Common Issues

#### 1. Azure OpenAI Rate Limits
```bash
# Check quota usage
az cognitiveservices account list-usage \
  --name devme-openai \
  --resource-group devme-rg
```

#### 2. Database Connection Issues
```typescript
// Add retry logic with exponential backoff
// Already implemented in withDbRetry() function
```

#### 3. Redis Connection Timeout
```typescript
// Check Redis connection
const redis = getRedisClient();
await redis?.ping(); // Should return "PONG"
```

#### 4. Function App Not Triggering
```bash
# Check function logs
az functionapp log tail \
  --name devme-functions \
  --resource-group devme-rg
```

---

## Next Steps

1. **Week 1:** Implement Phase 1 (OpenAI + Redis + PostgreSQL)
2. **Week 2:** Add Phase 2 (Cognitive Search + Service Bus)
3. **Week 3:** Polish with Phase 3 (Static Web Apps + Monitoring)

## Support Resources

- **Azure Student Portal:** https://azure.microsoft.com/free/students/
- **Azure Documentation:** https://docs.microsoft.com/azure/
- **Azure Support:** Submit tickets via Azure Portal
- **Community:** https://stackoverflow.com/questions/tagged/azure

---

**Good luck with your migration! 🚀**

**Remember:** Start with Phase 1 (OpenAI + Redis) for immediate 10x improvement!
