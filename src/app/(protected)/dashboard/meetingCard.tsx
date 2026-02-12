"use client";

import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { Card } from "@/components/ui/card";
import { uploadFile } from "@/lib/firebase";
import { Presentation, Upload } from "lucide-react";
import { useState } from "react";
// import { Button } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { useDropzone } from "react-dropzone";
import { api } from "@/trpc/react";
import useProject from "@/hooks/use-project";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";

const MeetingCard = () => {
  const { projectId } = useProject();
  const processMeeting = useMutation({
    mutationFn: async (data: {
      meetingUrl: string;
      projectId: string;
      meetingId: string;
    }) => {
      const { meetingUrl, projectId, meetingId } = data;
      const response = await axios.post("/api/process-meeting", {
        meetingUrl,
        projectId,
        meetingId,
      });
      return response.data;
    },
  });
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const router = useRouter();
  const uploadMeeting = api.project.uploadMeeting.useMutation();
  const { getInputProps, getRootProps } = useDropzone({
    accept: { "audio/*": [".mp3", ".wav", ".m4a"] },
    multiple: false,
    maxSize: 50_000_000,
    onDrop: async (acceptedFiles) => {
      setIsUploading(true);
      console.log(acceptedFiles);
      const file = acceptedFiles[0];
      if (!file) return;
      const downloadUrl = (await uploadFile(
        file as File,
        setProgress,
      )) as string;

      uploadMeeting.mutate(
        {
          projectId: projectId!,
          meetingUrl: downloadUrl,
          name: file?.name,
        },
        {
          onSuccess: (meeting) => {
            toast.success("Meeting uploaded successfully!");
            router.push(`/dashboard/meeting`);
            processMeeting.mutate({
              meetingUrl: downloadUrl,
              projectId: projectId!,
              meetingId: meeting.id,
            });
          },
          onError: () => {
            toast.error("Error uploading meeting: ");
          },
        },
      );

      window.alert(downloadUrl);
      setIsUploading(false);
    },
  });

  return (
    <Card
      className="col-span-2 flex flex-col items-center justify-center"
      {...getRootProps()}
    >
      {!isUploading && (
        <>
          <Presentation className="h-10 w-10 animate-bounce" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            Create a new meeting
          </h3>
          <p className="mt-1 text-center text-sm text-gray-500">
            Analyse your meeting with CommitLytics.
            <br />
            Powered by AI.
          </p>
          <div className="mt-6">
            <Button disabled={isUploading}>
              <Upload className="mr-1.5 ml-0.5 h-5 w-5" aria-hidden="true" />
              Upload Meeting
              <input className="hidden" {...getInputProps()} />
            </Button>
          </div>
        </>
      )}
      {isUploading && (
        <div className="flex items-center justify-center">
          <CircularProgressbar
            value={progress}
            text={`${progress}%`}
            styles={buildStyles({
              textSize: "16px",
              pathColor: `rgba(59, 130, 246, ${progress / 100})`,
              textColor: "#374151",
              trailColor: "#d1d5db",
            })}
          />
          <p className="text-center text-sm text-gray-500"> Uploading...</p>
        </div>
      )}
    </Card>
  );
};

export default MeetingCard;
