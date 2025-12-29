import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { IGNORE_PATHS } from "@/lib/utils";

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

console.log(await loadGithubRepo("https://github.com/sudipkumar0200/assignment-temp"))