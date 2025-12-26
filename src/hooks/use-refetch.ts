import { useQueryClient } from "@tanstack/react-query"

const useRefetch = () => {

  const queryClient = useQueryClient()
  return async () => {
    queryClient.resetQueries({ type: "active" })
  }
}
export default useRefetch
