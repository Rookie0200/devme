import { signOut } from "@/auth";
import { ModeToggle } from "@/components/toggleTheme";
import { Button } from "@/components/ui/button";
import { Nav } from "./nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <div className="border-sidebar-border bg-sidebar flex items-center gap-2 rounded-md border p-2 px-4 shadow">
        <span className="text-sm font-medium">devme</span>
        <Nav />
        <div className="ml-auto"></div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
        <ModeToggle />
      </div>

      <div className="h-4"></div>
      <div className="border-sidebar-border bg-sidebar rounded-md border p-4 shadow">
        {children}
      </div>
    </main>
  );
}
