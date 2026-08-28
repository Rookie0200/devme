"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The application's only navigation, and deliberately flat.
 *
 * Two peers, no hierarchy: one screen configures Installations, the other
 * reports what the reviewer did. A per-Installation route was rejected because
 * it would make a reader click through a hierarchy of one to reach the page
 * they wanted.
 */
const LINKS = [
  { href: "/dashboard", label: "Installations" },
  { href: "/dashboard/runs", label: "Runs" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded px-2 py-1 text-sm font-medium"
                : "text-muted-foreground hover:text-foreground rounded px-2 py-1 text-sm"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
