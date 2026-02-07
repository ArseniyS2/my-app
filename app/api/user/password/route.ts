import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import argon2 from "argon2";
import { rateLimit } from "@/lib/rate-limit";
import { db, users } from "@/src/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 5 password change attempts per 15 minutes per user
  const rl = rateLimit(`pw:${session.user.id}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    );
  }

  const { currentPassword, password } = await req.json();

  // Require current password for verification
  if (!currentPassword || typeof currentPassword !== "string") {
    return Response.json(
      { error: "Current password is required" },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string") {
    return Response.json({ error: "New password is required" }, { status: 400 });
  }

  if (password.length < 12) {
    return Response.json(
      { error: "Password must be at least 12 characters" },
      { status: 400 }
    );
  }

  if (!/[a-zA-Z]/.test(password)) {
    return Response.json(
      { error: "Password must contain at least one letter" },
      { status: 400 }
    );
  }

  if (!/\d/.test(password)) {
    return Response.json(
      { error: "Password must contain at least one number" },
      { status: 400 }
    );
  }

  // Verify current password before allowing change
  const [user] = await db
    .select({ hashedPassword: users.hashedPassword })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.hashedPassword) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await argon2.verify(user.hashedPassword, currentPassword);
  if (!valid) {
    return Response.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  // Hash new password using argon2id
  const hashedPassword = await argon2.hash(password, { type: argon2.argon2id });

  await db
    .update(users)
    .set({ hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return Response.json({ success: true });
}
