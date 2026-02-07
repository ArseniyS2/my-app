import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, users } from "@/src/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json();

  if (!password || typeof password !== "string") {
    return Response.json({ error: "Password is required" }, { status: 400 });
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

  // Hash password using Bun's built-in argon2id hashing
  const hashedPassword = await Bun.password.hash(password);

  await db
    .update(users)
    .set({ hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return Response.json({ success: true });
}
