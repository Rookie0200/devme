import { api } from "@/trpc/react";
import React from "react";

type Props = {
  meetingId: string;
};

const IssuesList = async ({ meetingId }: Props) => {
  const { data: meeting, isLoading } = api.project.getMeetingById.useQuery(
    { meetingId },
    { refetchInterval: 4000 },
  );
  if (isLoading || !meeting) return <div>Loading...</div>;

  return (
    <>
      <div className=""></div>
    </>
  );
};

export default IssuesList;
