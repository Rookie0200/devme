import { auth } from "@/auth";
import { processMeeting } from "@/lib/assembly";
import { client } from "@/server/db";
import { NextRequest, NextResponse } from "next/server";
import type { start } from "repl";
import { z } from "zod";

const bodyParser = z.object({
  meetingUrl: z.string(),
  projectId: z.string(),
  meetingId: z.string(),
});

export const maxDuration = 300; // 5 minutes in seconds

export async function POST(req: NextRequest) {
  const user = await auth();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
      },
    );
  }
  try {
    const body = await req.json();
    const { meetingId, projectId, meetingUrl } = bodyParser.parse(body);

    // const { processMeeting } = await import("src/lib/assembly");
    const { summaries } = await processMeeting(meetingUrl);
    await client.meetingIssue.createMany({
      data: summaries.map((summary) => ({
        meetingId,
        headline: summary.headline,
        gist: summary.gist,
        summary: summary.summary,
        start: summary.start,
        end: summary.end,
      })),
    });
    await client.meeting.update({
      where: { id: meetingId },
      data: { status: "COMPLETED", name: summaries[0]!.headline },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error processing meeting:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      {
        status: 500,
      },
    );
  }
}
