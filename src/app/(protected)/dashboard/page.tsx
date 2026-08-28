import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

/**
 * A deliberate placeholder, not a dashboard.
 *
 * The reviewer is driven entirely by GitHub webhooks, so there is nothing an
 * Installation's owner needs to do here yet — but sign-in has to land somewhere
 * that exists. The Installation and Provider Key surfaces are the next piece of
 * work and get their own change; building a first version of them inside the
 * purge would bury them in a commit nobody can read.
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Signed in</h1>
        <p className="text-muted-foreground text-sm">
          {session?.user?.email ?? session?.user?.name ?? "Unknown account"}
        </p>
      </div>

      <p className="text-sm">
        devme reviews pull requests against the issues they link. It runs from a
        GitHub App installation and reports on the pull request itself, so there
        is nothing to configure here — there is no dashboard yet.
      </p>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
