import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { IGNORE_PATHS } from "@/lib/utils";
import { Document } from "@langchain/core/documents";
import { generateEmbeddingsFromAi, summariseCode } from "@/lib/geminiApi";
import { client } from "@/server/db";

export const loadGithubRepo = async (githubUrl:string,githubToken?:string) =>{
    const loader = new GithubRepoLoader(githubUrl, {
        accessToken: githubToken || "",
        ignorePaths:IGNORE_PATHS,
        recursive:true,
        unknown:"warn",
        maxConcurrency:5

    })
    const docs = await loader.load()
    return docs;
}

export const indexGithubRepo = async (projectId:string,githubUrl:string,githubToken?:string)=>{
    const docs = await loadGithubRepo(githubUrl,githubToken)
    const allEmbeddings = await generateEmbeddings(docs)
    await Promise.allSettled(allEmbeddings.map(async (embedding,index)=>{
        console.log(`processing ${index} of ${allEmbeddings.length}`)
        if(!embedding) return

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
        SET "summeryEmbedding" = ${embedding.embedding}::vector
        WHERE "id" = ${sourceCodeEmbedding.id}
        `
    }))

}

export const generateEmbeddings = async (docs:Document[])=>{
return await Promise.all(docs.map(async doc =>{
    const summary = await summariseCode(doc)
    const embedding = await generateEmbeddingsFromAi(summary)

    return {
        summary,
        embedding,
        sourceCode: JSON.parse(JSON.stringify(doc.pageContent)),
        fileName: doc.metadata.source
    }

}))

}