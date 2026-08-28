import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GitHub from "next-auth/providers/github"
import { client } from "@/server/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(client),
  providers: [
    // Dashboard identity only. Repository access comes from a GitHub App
    // installation token, never from this OAuth token. The `read:org` scope
    // exists solely so we can ask GitHub which Installations the signed-in
    // user may see — see docs/adr/0001.
    GitHub({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user user:email read:org" } },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
})
