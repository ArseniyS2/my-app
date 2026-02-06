import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/src/db";
import {
  allAnime,
  userRating,
  userRatingGenre,
  genre as genreTable,
  animeGenres,
} from "@/src/db/schema";
import { eq, and, or, ilike, inArray, asc, desc, sql, type SQL } from "drizzle-orm";

const MAX_LIMIT = 40;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl;
  const source = url.searchParams.get("source") ?? "user";
  const genreFilter = url.searchParams.get("genre") ?? "Overall";
  const search = (url.searchParams.get("search") ?? "").trim();
  const sort = url.searchParams.get("sort") === "desc" ? "desc" : "asc";
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") ?? "0", 10)
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10))
  );

  try {
    if (source === "user") {
      return await handleUserAnime(
        session.user.id,
        genreFilter,
        search,
        sort,
        offset,
        limit
      );
    }
    return await handleAllAnime(genreFilter, search, sort, offset, limit);
  } catch (error) {
    console.error("API /anime error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  "Your anime" – query user_rating joined with all_anime            */
/* ------------------------------------------------------------------ */
async function handleUserAnime(
  userId: string,
  genreFilter: string,
  search: string,
  sort: string,
  offset: number,
  limit: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: (SQL | undefined)[] = [eq(userRating.userId, userId)];

  /* genre filter — PRIMARY genre only */
  if (genreFilter !== "Overall") {
    const genreSub = db
      .select({ uid: userRatingGenre.userRatingId })
      .from(userRatingGenre)
      .innerJoin(genreTable, eq(userRatingGenre.genreId, genreTable.id))
      .where(
        and(
          eq(genreTable.genreName, genreFilter),
          eq(userRatingGenre.role, "PRIMARY")
        )
      );
    conditions.push(inArray(userRating.id, genreSub));
  }

  /* title search */
  if (search) {
    conditions.push(
      or(
        ilike(allAnime.titleEnglish, `%${search}%`),
        ilike(allAnime.titleRomaji, `%${search}%`)
      )
    );
  }

  const rows = await db
    .select({
      userRatingId: userRating.id,
      animeId: allAnime.id,
      titleEnglish: allAnime.titleEnglish,
      coverImage: allAnime.coverImage,
      rating: userRating.rating,
      status: userRating.status,
    })
    .from(userRating)
    .innerJoin(allAnime, eq(userRating.animeId, allAnime.id))
    .where(and(...conditions))
    .orderBy(
      sort === "asc"
        ? sql`${userRating.rating} asc nulls last`
        : sql`${userRating.rating} desc nulls last`
    )
    .offset(offset)
    .limit(limit);

  /* batch-fetch genres for the returned ratings */
  const urIds = rows.map((r) => r.userRatingId);
  const genreRows =
    urIds.length > 0
      ? await db
          .select({
            userRatingId: userRatingGenre.userRatingId,
            genreName: genreTable.genreName,
            role: userRatingGenre.role,
          })
          .from(userRatingGenre)
          .innerJoin(genreTable, eq(userRatingGenre.genreId, genreTable.id))
          .where(inArray(userRatingGenre.userRatingId, urIds))
      : [];

  const genreMap = new Map<number, { name: string; role: string }[]>();
  for (const g of genreRows) {
    if (!genreMap.has(g.userRatingId)) genreMap.set(g.userRatingId, []);
    genreMap.get(g.userRatingId)!.push({ name: g.genreName, role: g.role });
  }

  const items = rows.map((r) => ({
    id: r.animeId,
    titleEnglish: r.titleEnglish,
    coverImage: r.coverImage,
    rating: r.rating != null ? parseFloat(String(r.rating)) : null,
    genres: (genreMap.get(r.userRatingId) ?? []).sort((a, b) =>
      a.role === "PRIMARY" && b.role !== "PRIMARY"
        ? -1
        : a.role !== "PRIMARY" && b.role === "PRIMARY"
          ? 1
          : 0
    ),
    status: r.status,
  }));

  return NextResponse.json({ items, hasMore: items.length === limit });
}

/* ------------------------------------------------------------------ */
/*  "All anime" – query all_anime directly                            */
/* ------------------------------------------------------------------ */
async function handleAllAnime(
  genreFilter: string,
  search: string,
  sort: string,
  offset: number,
  limit: number
) {
  const conditions: (SQL | undefined)[] = [];

  if (genreFilter !== "Overall") {
    const genreSub = db
      .select({ aid: animeGenres.allAnimeId })
      .from(animeGenres)
      .innerJoin(genreTable, eq(animeGenres.genreId, genreTable.id))
      .where(eq(genreTable.genreName, genreFilter));
    conditions.push(inArray(allAnime.id, genreSub));
  }

  if (search) {
    conditions.push(
      or(
        ilike(allAnime.titleEnglish, `%${search}%`),
        ilike(allAnime.titleRomaji, `%${search}%`)
      )
    );
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: allAnime.id,
      titleEnglish: allAnime.titleEnglish,
      coverImage: allAnime.coverImage,
      avgScore: allAnime.avgScore,
    })
    .from(allAnime)
    .where(whereClause)
    .orderBy(sort === "asc" ? asc(allAnime.avgScore) : desc(allAnime.avgScore))
    .offset(offset)
    .limit(limit);

  /* batch-fetch genres */
  const animeIds = rows.map((r) => r.id);
  const genreRows =
    animeIds.length > 0
      ? await db
          .select({
            allAnimeId: animeGenres.allAnimeId,
            genreName: genreTable.genreName,
          })
          .from(animeGenres)
          .innerJoin(genreTable, eq(animeGenres.genreId, genreTable.id))
          .where(inArray(animeGenres.allAnimeId, animeIds))
      : [];

  const genreMap = new Map<number, { name: string; role: null }[]>();
  for (const g of genreRows) {
    if (!genreMap.has(g.allAnimeId)) genreMap.set(g.allAnimeId, []);
    genreMap.get(g.allAnimeId)!.push({ name: g.genreName, role: null });
  }

  const items = rows.map((r) => ({
    id: r.id,
    titleEnglish: r.titleEnglish,
    coverImage: r.coverImage,
    rating: r.avgScore,
    genres: genreMap.get(r.id) ?? [],
    status: null,
  }));

  return NextResponse.json({ items, hasMore: items.length === limit });
}
