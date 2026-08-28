import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const sessionToken = req.cookies.get('authjs.session-token') ?? req.cookies.get('__Secure-authjs.session-token')
  const isLoggedIn = !!sessionToken
  
  const { pathname } = req.nextUrl

  const isPublicRoute =
    ['/', '/sign-in', '/sign-up'].includes(pathname) ||
    pathname.startsWith('/api/auth') ||
    // GitHub sends no session cookie. This endpoint authenticates itself by
    // HMAC signature against the shared secret, verified before it does
    // anything else — see src/server/review/github/webhook.ts.
    pathname.startsWith('/api/webhooks/')

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
