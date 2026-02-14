import { auth } from "@/auth";
import { client } from "@/server/db";
import { redirect } from "next/navigation";
import React from "react";

type Props = {
  params: Promise<{
    projectId: string;
  }>;
};

const joinHandler = async (props: Props) => {
  const { projectId } = await props.params;
  const session = await auth();
  const user = session?.user;
  if (!session?.user.id) {
    return redirect("/sign-in");
  }
  const dbUser = await client.user.findUnique({
    where: {
      id: session.user.id,
    },
  });
  if (!dbUser) {
    await client.user.create({
      data: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email ?? "",
        image: session.user.image,
      },
    });
  }
  const project = await client.project.findUnique({
    where: {
      id: projectId,
    },
  });
  if (!project) {
    return redirect("/dashboard");
  }
  try {
    await client.userToProject.create({
      data: {
        projectId,
        userId: session.user.id,
      },
    });
  } catch (error) {
    console.error("Error adding user to project:", error);
    // Optionally, you could redirect to an error page or show a message here
    return redirect(`/dashboard`);
  }
};
//   await client.userToProject.create({
//     data: {
//       projectId,
//       userId: session.user.id,
//     },
//   });
//   redirect(`/projects/${projectId}`);
