"use client";

import { api } from "@/trpc/react";
import React from "react";
import { Button } from "./ui/button";
import useProject from "@/hooks/use-project";
import { toast } from "sonner";
import useRefetch from "@/hooks/use-refetch";

const ArchiveButton = () => {
  const { projectId } = useProject();
  const archiveProject = api.project.archiveProject.useMutation();
  const refetch = useRefetch();
  return (
    <Button
      disabled={archiveProject.isPending}
      size="sm"
      variant="destructive"
      onClick={() => {
        const confirm = window.confirm(
          "Are you sure you want to archive this project?",
        );
        if (confirm) {
          archiveProject.mutate(
            { projectId },
            {
              onSuccess: () => {
                toast.success("Project archived successfully");
                refetch();
              },
              onError: () => {
                toast.error("Failed to archive project");
              },
            },
          );
        }
      }}
    >
      Archive
    </Button>
  );
};

export default ArchiveButton;
