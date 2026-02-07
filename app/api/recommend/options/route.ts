import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/src/db";
import { genre, tags } from "@/src/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [genreRows, tagRows] = await Promise.all([
      db.select({ name: genre.genreName }).from(genre).orderBy(asc(genre.genreName)),
      db.select({ name: tags.tagName }).from(tags).orderBy(asc(tags.tagName)),
    ]);

    return NextResponse.json({
      genres: genreRows.map((r) => r.name),
      tags: tagRows.map((r) => r.name),
    });
  } catch (error) {
    console.error("API /recommend/options error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
