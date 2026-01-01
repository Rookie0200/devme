"use client";
import { Button } from "@/components/ui/button";
import useProject from "@/hooks/use-project";
import { ExternalLink, Github } from "lucide-react";
import Link from "next/link";
import CommitLogs from "./commitLogs";
import AskQuestionCard from "./askQuestionCard";

const dashboard = () => {
  const { project, projects } = useProject();

  // Show empty state for new users
  if (!projects || projects.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h2 className="mb-4 text-2xl font-bold">Welcome to DevMe!</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Get started by creating your first project. Connect your GitHub
          repository to track commits and collaborate with your team.
        </p>
        <Button>Create Your First Project</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-y-4">
        {/* Github link div */}
        <div className="bg-primary flex w-fit items-center justify-center rounded-md px-4 py-4">
          <Github className="size-5 text-white" />
          <div className="ml-2">
            <Link
              href={project?.githubUrl ?? ""}
              className="inline-flex items-center gap-2 text-white"
            >
              The Github link of the Project is {project?.githubUrl}
              <ExternalLink />
            </Link>
          </div>
        </div>

        <div className="h-2"></div>
        {/* Features Button */}
        <div className="flex items-center gap-2">
          <Button variant={"outline"}>team members</Button>
          <Button variant={"outline"}>Archive Button</Button>
          <Button variant={"outline"}>Invitaiton Button</Button>
        </div>
      </div>
      <div className="mt-4">
        <div className="mt-4 grid-cols-5 gap-4">
          <AskQuestionCard />
          <Button variant={"outline"}>Create Meeting</Button>
        </div>
      </div>

      <div className="mt-8"></div>

      {/* Render commits */}
      <div>
        <CommitLogs />
      </div>
    </div>
  );
};

export default dashboard;
