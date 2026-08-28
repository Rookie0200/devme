import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

/**
 * The webhook endpoint sits *outside* the review pipeline's single test seam:
 * the suite in `server/review` calls the handler directly, so it cannot see a
 * middleware redirect in front of it.
 *
 * That gap already shipped a showstopper once — GitHub sends no session
 * cookie, so an unlisted webhook path is redirected to `/sign-in` and every
 * delivery silently fails. These tests exist to keep that from recurring.
 */

function anonymousRequestTo(path: string) {
  return new NextRequest(new URL(path, "https://example.test"));
}

describe("route guarding", () => {
  test("lets an unauthenticated GitHub webhook through", async () => {
    const response = await middleware(anonymousRequestTo("/api/webhooks/github"));

    // A redirect here means GitHub gets a 302 to the sign-in page and the
    // delivery is lost.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("still redirects an unauthenticated dashboard request", async () => {
    const response = await middleware(anonymousRequestTo("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  test("leaves the marketing page and auth routes public", async () => {
    for (const path of ["/", "/sign-in", "/sign-up", "/api/auth/callback/github"]) {
      const response = await middleware(anonymousRequestTo(path));
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
