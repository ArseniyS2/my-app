import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, userRating, animeGenres, genre } from "@/src/db";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // Count completed anime
  const [completedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRating)
    .where(
      and(eq(userRating.userId, userId), eq(userRating.status, "COMPLETED"))
    );

  // Genre breakdown for completed anime (via anime_genres table)
  const genreBreakdown = await db
    .select({
      genreName: genre.genreName,
      count: sql<number>`count(*)::int`,
    })
    .from(userRating)
    .innerJoin(animeGenres, eq(userRating.animeId, animeGenres.allAnimeId))
    .innerJoin(genre, eq(animeGenres.genreId, genre.id))
    .where(
      and(eq(userRating.userId, userId), eq(userRating.status, "COMPLETED"))
    )
    .groupBy(genre.genreName)
    .orderBy(sql`count(*) desc`);

  return Response.json({
    completedCount: completedRow?.count ?? 0,
    genreBreakdown,
  });
}
