import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/src/db";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/*  GET /api/anime/similar?id=123                                      */
/*  Returns up to 5 similar anime with unique franchises               */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const animeId = Number(req.nextUrl.searchParams.get("id"));
  if (!animeId || isNaN(animeId)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const franchiseId = Number(req.nextUrl.searchParams.get("franchiseId"));
  if (!franchiseId || isNaN(franchiseId)) {
    return NextResponse.json({ error: "Missing or invalid franchiseId" }, { status: 400 });
  }

  try {
    // Fetch up to 30 nearest neighbors, then deduplicate by franchise in JS
    const candidates = await db.execute(sql`
      SELECT
        a.id,
        a.title_english   AS "titleEnglish",
        a.cover_image_large      AS "coverImage",
        a.franchise_id     AS "franchiseId"
      FROM anime_embeddings ae
      JOIN all_anime a ON a.id = ae.id
      WHERE ae.id != ${animeId}
        AND a.franchise_id != ${franchiseId}
      ORDER BY ae.embedding <=> (
        SELECT embedding FROM anime_embeddings WHERE id = ${animeId}
      )
      LIMIT 30
    `);

    // Deduplicate by franchise — keep the first (most similar) hit per franchise
    const seenFranchises = new Set<number>();
    const similar: { id: number; titleEnglish: string; coverImage: string }[] = [];

    for (const row of candidates.rows as {
      id: number;
      titleEnglish: string;
      coverImage: string;
      franchiseId: number;
    }[]) {
      const fid = Number(row.franchiseId);
      if (seenFranchises.has(fid)) continue;
      seenFranchises.add(fid);
      similar.push({
        id: Number(row.id),
        titleEnglish: row.titleEnglish,
        coverImage: row.coverImage,
      });
      if (similar.length >= 5) break;
    }

    return NextResponse.json({ similar });
  } catch (error) {
    console.error("API /anime/similar error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
