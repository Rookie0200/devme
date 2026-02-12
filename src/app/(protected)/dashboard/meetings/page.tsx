"use client";

import useProject from "@/hooks/use-project";
import MeetingCard from "../meetingCard";
import { api } from "@/trpc/react";
import { Link } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import useRefetch from "@/hooks/use-refetch";
import { toast } from "sonner";

const meetingPage = () => {
  const { projectId } = useProject();
  const { data: meetings, isLoading } = api.project.getMeetings.useQuery(
    { projectId },
    { refetchInterval: 4000 },
  );
  const deleteMeeting = api.project.deleteMeeting.useMutation();
  const refetch = useRefetch();

  return (
    <>
      <MeetingCard />
      <div className="h-6"></div>
      <h1 className="text-xl font-semibold">Meetings</h1>
      {meetings && meetings.length === 0 && (
        <p className="mt-4 text-gray-500">No meetings found.</p>
      )}
      {isLoading && <p>Loading meetings...</p>}
      <ul className="divide-y divide-gray-200">
        {meetings?.map((meeting) => (
          <li
            key={meeting.id}
            className="flex items-center justify-between gap-x-6 py-5"
          >
            <div>
              <div className="min-w-0">
                <div className="item-center flex gap-2">
                  <Link
                    href={`/dashboard/meetings/${meeting.id}`}
                    className="text-sm font-semibold"
                  >
                    {meeting.name}
                  </Link>
                  {meeting.status === "PROCESSING" && (
                    <Badge className="bg-yellow-500 text-white">
                      Processing...
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-x-2 text-xs text-gray-500">
                <p className="whitespace-nowrap">
                  {meeting.createdAt.toLocaleDateString()}
                </p>
                <p className="truncate">{meeting.issues.length}</p>
              </div>
            </div>
            <div className="flex flex-none items-center gap-x-4">
              <Link href={`/meetings/${meeting.id}`}>
                <Button variant="outline">View Meeting</Button>
              </Link>
              <Button
                disabled={deleteMeeting.isPending}
                variant="ghost"
                size="sm"
                onClick={() => {
                  deleteMeeting.mutate(
                    { meetingId: meeting.id },
                    {
                      onSuccess: () => {
                        toast.success("Meeting deleted successfully!");
                        refetch();
                      },
                      onError: () => {
                        toast.error("Error deleting meeting");
                      },
                    },
                  );
                }}
              >
                Delete Meeting
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
};

export default meetingPage;
