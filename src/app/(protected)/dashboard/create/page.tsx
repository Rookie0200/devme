"use client"

import { useForm } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { api } from "@/trpc/react"
import { toast } from "sonner"
import useRefetch from "@/hooks/use-refetch"


type formData = {
  name: string,
  githubUrl: string,
  githubToken?: string

}



export default function Page() {
  const { register, reset, handleSubmit } = useForm<formData>()
  const createProject = api.project.createProject.useMutation()
  const refetch = useRefetch()


  function sumbmitHandler(data: formData) {
    createProject.mutate({
      name: data.name,
      githubUrl: data.githubUrl,
      githubToken: data.githubToken
    }, {
      onSuccess: () => {
        toast.success("Project creation success")
        refetch()
        reset()

      },
      onError: () => {
        toast.error("Error while creating Project")
      }
    })
    return true
  }


  return (
    <div className="flex items-center justify-center h-full gap-12">
      <div>

        <div className="h-50 w-50  bg-gray-500">
        </div>
      </div>
      <div>

        <div>
          <h1>Link your github repository</h1>
          <p>Enter the url of your github repo to link with devme</p>
        </div>

        <div className="h-4"></div>

        <div>

          <div>
            <form onSubmit={handleSubmit(sumbmitHandler)}>

              <Input {...register("name", { required: true })}
                placeholder="Project Name"
              />
              <div className="h-2"></div>
              <Input {...register("githubUrl", { required: true })}
                placeholder="https://github.com/Rookie0200/devme"
                type="url"
              />
              <div className="h-2"></div>
              <Input {...register("githubToken")}
                placeholder="github:ashoweil@shvowesndopvhrthwopjweowl"
              />

              <div className="h-2"></div>
              <Button type="submit" disabled={createProject.isPending}>
                Create Project
              </Button>

            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

