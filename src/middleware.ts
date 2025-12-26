import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const sessionToken = req.cookies.get('authjs.session-token') || req.cookies.get('__Secure-authjs.session-token')
  const isLoggedIn = !!sessionToken
  
  const isPublicRoute = ['/', '/sign-in', '/sign-up'].some(route => 
    req.nextUrl.pathname === route || req.nextUrl.pathname.startsWith('/api/auth')
  )

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
