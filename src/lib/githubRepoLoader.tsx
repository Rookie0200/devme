import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { IGNORE_PATHS, shouldProcessFile } from "@/lib/utils";
import { Document } from "@langchain/core/documents";
import { generateEmbeddingsFromAi, summariseCode } from "@/lib/groqApi";
import { client, withDbRetry } from "@/server/db";

export const loadGithubRepo = async (githubUrl:string,githubToken?:string) =>{
    const loader = new GithubRepoLoader(githubUrl, {
        accessToken: githubToken ?? process.env.GITHUB_TOKEN_AUTH,
        ignorePaths:IGNORE_PATHS,
        recursive:true,
        unknown:"warn",
        maxConcurrency:5
    })
    const docs = await loader.load()
    return docs;
}

/**
 * Filter documents to only include files worth summarizing.
 * Removes config files, tiny files, barrel files, etc.
 */
export const filterDocsForEmbedding = (docs: Document[]): Document[] => {
    const before = docs.length;
    const filtered = docs.filter((doc) => {
        const filePath = doc.metadata.source as string;
        const content = doc.pageContent;
        return shouldProcessFile(filePath, content);
    });
    const after = filtered.length;
    console.log(`🔍 Filtered files: ${before} → ${after} (skipped ${before - after} low-value files)`);
    return filtered;
}

export const indexGithubRepo = async (projectId:string,githubUrl:string,githubToken?:string)=>{
    try {
        console.log(`📦 Loading repository: ${githubUrl}`);
        const docs = await loadGithubRepo(githubUrl,githubToken);
        console.log(`📚 Loaded ${docs.length} files from repository`);
        
        const filteredDocs = filterDocsForEmbedding(docs);
        console.log(`🎯 Processing ${filteredDocs.length} files for embeddings`);
        
        if (filteredDocs.length === 0) {
            console.warn(`⚠️ No files to process for project ${projectId}`);
            return;
        }
        
        const allEmbeddings = await generateEmbeddings(filteredDocs);
        console.log(`🧠 Generated ${allEmbeddings.length} embeddings`);
        
        // Process embeddings sequentially to avoid connection pool exhaustion
        for (let index = 0; index < allEmbeddings.length; index++) {
            const embedding = allEmbeddings[index];
            console.log(`💾 Saving to database ${index + 1}/${allEmbeddings.length}`)
            if(!embedding) continue;

            await withDbRetry(async () => {
                const sourceCodeEmbedding = await client.sourceCodeEmbedding.create({
                    data:{
                        summary:embedding.summary,
                        sourceCode:embedding.sourceCode,
                        fileName:embedding.fileName,
                        projectId
                    }
                })

                // Format embedding as pgvector string: [0.1, 0.2, ...]
                const vectorString = `[${embedding.embedding.join(",")}]`;
                
                await client.$executeRaw`
                UPDATE "SourceCodeEmbedding"
                SET "summaryEmbedding" = ${vectorString}::vector
                WHERE "id" = ${sourceCodeEmbedding.id}
                `
            });
        }
        
        console.log(`🎉 Indexing complete for project ${projectId}: ${allEmbeddings.length} files indexed`);
    } catch (error) {
        console.error(`❌ Error indexing repository for project ${projectId}:`, error);
        throw error; // Re-throw to let caller handle
    }
}

export const generateEmbeddings = async (docs:Document[])=>{
    // Process files sequentially to respect rate limits (free tier: 5 requests/min)
    const results = [];
    
    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i]!;
        console.log(`📄 Processing file ${i + 1}/${docs.length}: ${doc.metadata.source}`);
        
        try {
            const summary = await summariseCode(doc);
            const embedding = await generateEmbeddingsFromAi(summary);
            
            results.push({
                summary,
                embedding,
                // `pageContent` is already a string; LangChain's metadata is not typed.
                sourceCode: String(doc.pageContent),
                fileName: String(doc.metadata.source)
            });
            
            console.log(`✅ Completed ${i + 1}/${docs.length}`);
        } catch (error) {
            console.error(`❌ Failed to process ${doc.metadata.source}:`, error);
            // Continue with next file instead of failing the entire operation
            results.push(null);
        }
    }
    
    return results.filter(Boolean);
}