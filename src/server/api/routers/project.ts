import { client } from "@/server/db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import z from "zod";
import { pollCommits } from "@/lib/githubApi";
import { indexGithubRepo } from "@/lib/githubRepoLoader";
import { get } from "http";

export const projectRouter = createTRPCRouter({
  createProject: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        githubUrl: z.string(),
        githubToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.client.project.create({
        data: {
          name: input.name,
          githubUrl: input.githubUrl,
          UserToProject: {
            create: {
              userId: ctx.user.id!,
            },
          },
        },
      });

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

      return project;
    }),
  getProjects: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.client.project.findMany({
      where: {
        UserToProject: {
          some: {
            userId: ctx.user.id!,
          },
        },
      },
    });
  }),
  getCommits: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Skip processing if projectId is empty or invalid
      if (!input.projectId || input.projectId.trim() === "") {
        return [];
      }
      pollCommits(input.projectId).then().catch(console.error);
      return await ctx.client.commits.findMany({
        where: { projectId: input.projectId },
      });
    }),
  saveQuestion: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        question: z.string(),
        answer: z.string(),
        fileReferences: z.any().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.client.question.create({
        data: {
          projectId: input.projectId,
          question: input.question,
          answer: input.answer,
          userId: ctx.user.id!,
          fileReferences: input.fileReferences,
        },
      });
    }),
  getQuestions: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await ctx.client.question.findMany({
        where: {
          projectId: input.projectId,
        },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),
  uploadMeeting: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        meetingUrl: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.client.meeting.create({
        data: {
          projectId: input.projectId,
          meetingUrl: input.meetingUrl,
          name: input.name,
          status: "PROCESSING",
        },
      });
      return meeting;
    }),
  getMeetings: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await ctx.client.meeting.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: { issues: true },
      });
    }),
  deleteMeeting: protectedProcedure
    .input(
      z.object({
        meetingId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.client.meeting.delete({
        where: {
          id: input.meetingId,
        },
      });
      return { success: true };
    }),
  getMeetingById: protectedProcedure
    .input(z.object({ meetingId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.client.meeting.findUnique({
        where: { id: input.meetingId },
        include: { issues: true },
      });
    }),
  archiveProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.client.project.update({
        where: { id: input.projectId },
        data: { deletedAt: new Date() },
      });
      // return { success: true };
    }),
  getTeamMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.client.userToProject.findMany({
        where: { projectId: input.projectId },
        include: { user: true },
      });
      return members.map((member) => member.user);
    }),
});
