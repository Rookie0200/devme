import { client } from "@/server/db"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import z from "zod"
import { pollCommits } from "@/lib/githubApi"
import { indexGithubRepo } from "@/lib/githubRepoLoader"

export const projectRouter = createTRPCRouter({
  createProject: protectedProcedure.input(
    z.object({
      name: z.string(),
      githubUrl: z.string(),
      githubToken: z.string().optional()

    })
  ).mutation(async ({ ctx, input }) => {
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
    })
    
    // Run indexing and commit polling in background (non-blocking)
    console.log(`🚀 Starting background indexing for project: ${project.id}`);
    indexGithubRepo(project.id, input.githubUrl, input.githubToken)
      .then(() => {
        console.log(`✅ Successfully indexed project: ${project.id}`);
      })
      .catch((error) => {
        console.error(`❌ Failed to index project ${project.id}:`, error);
      });
    
    pollCommits(project.id)
      .then(() => {
        console.log(`✅ Successfully polled commits for: ${project.id}`);
      })
      .catch((error) => {
        console.error(`❌ Failed to poll commits for ${project.id}:`, error);
      });
    
    return project
  }),
  getProjects: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.client.project.findMany({
      where: {
        UserToProject: {
          some: {
            userId: ctx.user.id!
          }
        }
      }
    })
  }),
  getCommits: protectedProcedure.input(z.object({
    projectId: z.string()
  })).query(async ({ ctx, input }) => {
    // Skip processing if projectId is empty or invalid
    if (!input.projectId || input.projectId.trim() === "") {
      return []
    }
    pollCommits(input.projectId).then().catch(console.error)
    return await ctx.client.commits.findMany({ where: { projectId: input.projectId } })
  })
})
