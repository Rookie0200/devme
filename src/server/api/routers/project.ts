import { client } from "@/server/db"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import z from "zod"
import { pollCommits } from "@/lib/githubApi"

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
    await pollCommits(project.id)

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
