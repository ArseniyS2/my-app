import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { db, sessions } from "@/src/db";
import { eq, and, gt } from "drizzle-orm";

/**
 * GET /api/user/sessions
 * Returns all active (non-expired) sessions for the current user.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Decode the JWT to find the current session token
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const currentSessionToken = (token?.sessionToken as string) ?? "";

  const userSessions = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      sessionToken: sessions.sessionToken,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, session.user.id),
        gt(sessions.expiresAt, new Date())
      )
    )
    .orderBy(sessions.createdAt);

  return Response.json(
    userSessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.sessionToken === currentSessionToken,
    }))
  );
}

/**
 * DELETE /api/user/sessions
 * Revokes ALL sessions for the current user (log-out everywhere).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.delete(sessions).where(eq(sessions.userId, session.user.id));

  return Response.json({ success: true });
}
