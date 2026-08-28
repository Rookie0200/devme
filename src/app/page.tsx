import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Deliberately minimal, and deliberately not marketing.
 *
 * The page it replaced described the Q&A and meeting product this repository no
 * longer contains, quoted testimonials from people who do not exist, and listed
 * pricing tiers that were never offered. Writing replacement copy for the
 * reviewer would mean inventing claims for a product with no users and no
 * measured results, so this says only what is true today.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">devme</h1>
        <p className="text-muted-foreground mt-2">
          A spec-adherence reviewer for GitHub pull requests.
        </p>
      </div>

      <p className="leading-relaxed">
        Most review tools read a diff and tell you whether the code is good. This
        one reads the issue a pull request links, treats it as the specification,
        and reports on each acceptance criterion in it — satisfied, unsatisfied,
        or unclear — with the evidence for every verdict. A pull request that
        links no issue is declined rather than reviewed against its own
        description.
      </p>

      <p className="text-muted-foreground text-sm">
        It installs as a GitHub App and comments on the pull request itself.
        Signing in is for one thing: giving an installation the API key its
        reviews are run with.
      </p>

      <div>
        <Button asChild>
          <Link href="/sign-in">Sign in with GitHub</Link>
        </Button>
      </div>
    </main>
  );
}
