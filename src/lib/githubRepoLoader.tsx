import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { IGNORE_PATHS, shouldProcessFile } from "@/lib/utils";
import { Document } from "@langchain/core/documents";
import { generateEmbeddingsFromAi, summariseCode } from "@/lib/groqApi";

/**
 * `githubToken` is required, and deliberately has no ambient fallback.
 *
 * Repository access comes from an Installation token minted per Installation
 * and nothing else — see `docs/adr/0001`. A fallback to a token in the
 * environment would let a future caller read a Repository outside any
 * Installation, which is the exact credential model that ADR exists to forbid.
 */
export const loadGithubRepo = async (githubUrl:string,githubToken:string) =>{
    const loader = new GithubRepoLoader(githubUrl, {
        accessToken: githubToken,
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