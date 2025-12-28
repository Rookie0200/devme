import { client } from "@/server/db";
import { Octokit } from "octokit";
import axios from "axios";
import { aiSummarizeCommit } from "./geminiApi";

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN_AUTH,
});
type ResponseType = {
  commitHash: string;
  commitMessage: string;
  commitAuthorName: string;
  commitAuthorAvatar: string;
  commitDate: string;
};

export const getCommitHash = async (
  githubUrl: string,
): Promise<ResponseType[]> => {
  const [owner, repo] = githubUrl.split("/").slice(3, 5);
  const { data } = await octokit.request(`GET /repos/${owner}/${repo}/commits`);
  const sortedCommits = data.sort(
    (a: any, b: any) =>
      new Date(b.commit.author?.date).getTime() -
      new Date(a.commit.author?.date).getTime(),
  );

  return sortedCommits.slice(0, 10).map((commit: any) => ({
    commitHash: commit.sha as string,
    commitMessage: commit.commit.message ?? "",
    commitAuthorName: commit.commit.author.name ?? "",
    commitAuthorAvatar: commit.author.avatar_url ?? "",
    commitDate: commit.commit.author.date,
  }));
};

export const pollCommits = async (projectId: string) => {
  const result = await getProjectGithubUrl(projectId);
  if (!result) {
    console.warn(`Skipping commit polling: Project ${projectId} not found or has no githubUrl`);
    return { count: 0 };
  }
  const { project, githubUrl } = result;
  const commithashes = await getCommitHash(githubUrl);
  const unProcessedCommits = await filterUnProcessedCommits(
    projectId,
    commithashes,
  );
  const summarizedResponse = await Promise.allSettled(
    unProcessedCommits.map((commit) => {
      return summarizeCommit(githubUrl, commit.commitHash);
    }),
  );
  const summaries = summarizedResponse.map((response, index) => {
    if (response.status === "fulfilled") {
      return response.value as string;
    }
    console.error(`Failed to summarize commit ${index}:`, response.reason);
    return "";
  });

  const commits = await client.commits.createMany({
    data: summaries.map((summary, index) => {
      console.log("processing commits : ", index);
      return {
        projectId: projectId,
        commitDate: unProcessedCommits[index]!.commitDate,
        commitHash: unProcessedCommits[index]!.commitHash,
        commitMessage: unProcessedCommits[index]!.commitMessage,
        commitAuthorName: unProcessedCommits[index]!.commitAuthorName,
        commitAuthorAvatar: unProcessedCommits[index]!.commitAuthorAvatar,
        Summary: summary,
      };
    }),
  });

  return commits;
};

async function summarizeCommit(githubUrl: string, commitHash: string) {
  try {
    console.log(`Fetching diff for commit: ${commitHash}`);
    const { data } = await axios.get(`${githubUrl}/commit/${commitHash}.diff`, {
      headers: { Accept: "application/vnd.github.v3.diff" },
    });
    console.log(`Diff fetched, size: ${data.length} characters`);
    const summary = await aiSummarizeCommit(data);
    console.log(`Summary generated for ${commitHash}`);
    return summary || "";
  } catch (error) {
    console.error(`Error summarizing commit ${commitHash}:`, error);
    throw error;
  }
}

async function getProjectGithubUrl(projectId: string) {
  const project = await client.project.findUnique({
    where: {
      id: projectId,
    },
    select: {
      githubUrl: true,
    },
  });
  if (!project?.githubUrl) {
    return null;
  }
  return { project, githubUrl: project.githubUrl };
}

async function filterUnProcessedCommits(
  projectId: string,
  commithashes: ResponseType[],
) {
  const processedCommits = await client.commits.findMany({
    where: { projectId },
  });

  const unProcessedCommits = commithashes.filter(
    (commit) =>
      !processedCommits.some(
        (processedCommits) => processedCommits.commitHash === commit.commitHash,
      ),
  );
  return unProcessedCommits;
}
