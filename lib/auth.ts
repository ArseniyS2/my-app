import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { eq, or } from "drizzle-orm";
import { db, users } from "@/src/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        login: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials?.password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(
            or(
              eq(users.email, credentials.login),
              eq(users.username, credentials.login)
            )
          )
          .limit(1);

        if (!user?.hashedPassword) return null;

        const valid = await Bun.password.verify(
          credentials.password,
          user.hashedPassword
        );
        if (!valid) return null;

        return {
          id: user.id,
          name: user.username,
          email: user.email ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.username = user.name ?? "";
        token.role = "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
