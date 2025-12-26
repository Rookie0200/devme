
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSideBar } from "./appSideBar"
import { ModeToggle } from "@/components/toggleTheme"


export default function Layout({ children }: { children: React.ReactNode }) {

  return (
    <SidebarProvider>
      <AppSideBar />
      <main className="w-full m-2">
        <div className="flex gap-2 items-center border-sidebar-border bg-sidebar border shadow rounded-md p-2 px-4">
          <div className="ml-auto"></div>
          <ModeToggle />
        </div>

        <div className="h-4"></div>
        <div className="border-sidebar-border bg-sidebar border shadow rounded-md overflow-y-scroll h-[calc(100vh-6rem)] p-4">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
