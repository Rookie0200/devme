import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { IGNORE_PATHS, shouldProcessFile } from "@/lib/utils";
import { Document } from "@langchain/core/documents";
import { generateEmbeddingsFromAi, summariseCode } from "@/lib/groqApi";
import { client, withDbRetry } from "@/server/db";

export const loadGithubRepo = async (githubUrl:string,githubToken?:string) =>{
    const loader = new GithubRepoLoader(githubUrl, {
        accessToken: githubToken || process.env.GITHUB_TOKEN_AUTH,
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
    const docs = await loadGithubRepo(githubUrl,githubToken)
    const filteredDocs = filterDocsForEmbedding(docs)
    const allEmbeddings = await generateEmbeddings(filteredDocs)
    
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

            await client.$executeRaw`
            UPDATE "SourceCodeEmbedding"
            SET "summaryEmbedding" = ${embedding.embedding}::vector
            WHERE "id" = ${sourceCodeEmbedding.id}
            `
        });
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
                sourceCode: JSON.parse(JSON.stringify(doc.pageContent)),
                fileName: doc.metadata.source
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