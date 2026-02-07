import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, users } from "@/src/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pictureUrl } = await req.json();

  if (!pictureUrl || typeof pictureUrl !== "string") {
    return Response.json(
      { error: "Picture URL is required" },
      { status: 400 }
    );
  }

  // Validate URL format and restrict to HTTPS
  let parsed: URL;
  try {
    parsed = new URL(pictureUrl);
  } catch {
    return Response.json({ error: "Invalid URL format" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return Response.json(
      { error: "Only HTTPS URLs are allowed" },
      { status: 400 }
    );
  }

  await db
    .update(users)
    .set({ userPicture: pictureUrl, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return Response.json({ success: true, pictureUrl });
}
