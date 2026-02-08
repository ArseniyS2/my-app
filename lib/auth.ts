import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import argon2 from "argon2";
import { eq, or, and, gt } from "drizzle-orm";
import { db, users, sessions } from "@/src/db";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

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

        const valid = await argon2.verify(
          user.hashedPassword,
          credentials.password
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
        // Sign-in: create a new session record in the database
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

        await db.insert(sessions).values({
          sessionToken,
          userId: user.id as string,
          expiresAt,
        });

        token.id = user.id as string;
        token.username = user.name ?? "";
        token.role = "user";
        token.sessionToken = sessionToken;
        return token;
      }

      // Legacy token (pre-migration) without a session row – create one
      if (token.id && !token.sessionToken) {
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

        await db.insert(sessions).values({
          sessionToken,
          userId: token.id,
          expiresAt,
        });

        token.sessionToken = sessionToken;
        return token;
      }

      // Subsequent request: validate that the session still exists in DB
      if (token.sessionToken) {
        const [sess] = await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.sessionToken, token.sessionToken),
              gt(sessions.expiresAt, new Date())
            )
          )
          .limit(1);

        if (!sess) {
          // Session was revoked or expired – invalidate the token
          token.id = "";
          token.username = "";
          token.role = "";
          token.sessionToken = "";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      // With JWT strategy, NextAuth passes { token } on sign-out
      const token = "token" in message ? message.token : undefined;
      if (token?.sessionToken) {
        await db
          .delete(sessions)
          .where(eq(sessions.sessionToken, token.sessionToken));
      }
    },
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },
  pages: {
    signIn: "/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
