import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a GitHub webhook payload against the shared secret.
 *
 * This runs before anything else on the request path — before parsing, before
 * enqueuing, before any database write — because an unauthenticated caller
 * that got past it could make the application post comments on arbitrary
 * repositories.
 *
 * @param rawBody the exact bytes GitHub sent. Re-serialising parsed JSON
 * changes the bytes and the signature will not match.
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  const { rawBody, signatureHeader, secret } = input;
  if (!signatureHeader) return false;

  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // `timingSafeEqual` throws on a length mismatch, which is itself a leak-free
  // signal that the signature is wrong.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Sign a payload the way GitHub does. Used by the test suite's fixtures. */
export function signWebhookPayload(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}
