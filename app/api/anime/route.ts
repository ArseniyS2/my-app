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

/** Escape LIKE/ILIKE special characters to prevent pattern injection. */
function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl;
  const source = url.searchParams.get("source") ?? "user";
  const genreFilter = url.searchParams.get("genre") ?? "Overall";
  const search = (url.searchParams.get("search") ?? "").trim();
  const sortParam = url.searchParams.get("sort") ?? "rating_desc";
  const sort =
    sortParam === "rating_asc" || sortParam === "rating_desc"
      ? (sortParam === "rating_desc" ? "desc" : "asc")
      : sortParam === "watched_asc" || sortParam === "watched_desc"
        ? sortParam
        : "rating_desc";
  const statusFilter = url.searchParams.get("status") ?? null;
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
        limit,
        statusFilter
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
  limit: number,
  statusFilter: string | null
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: (SQL | undefined)[] = [eq(userRating.userId, userId)];

  /* status filter */
  if (statusFilter) {
    conditions.push(eq(userRating.status, statusFilter as typeof userRating.status.enumValues[number]));
  }

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

  /* title search (escape LIKE wildcards to prevent pattern injection) */
  if (search) {
    const escaped = escapeLikePattern(search);
    conditions.push(
      or(
        ilike(allAnime.titleEnglish, `%${escaped}%`),
        ilike(allAnime.titleRomaji, `%${escaped}%`)
      )
    );
  }

  const orderBy =
    sort === "watched_desc"
      ? sql`${userRating.watchedDate} desc nulls last, ${userRating.id} desc`
      : sort === "watched_asc"
        ? sql`${userRating.watchedDate} asc nulls first, ${userRating.id} asc`
        : sort === "asc"
          ? sql`${userRating.rating} asc nulls last, ${userRating.id} asc`
          : sql`${userRating.rating} desc nulls last, ${userRating.id} desc`;

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
    .orderBy(orderBy)
    .offset(offset)
    .limit(limit);

  /* batch-fetch genres for the returned ratings */
  /* For non-PLANNING items: use user_rating_genre */
  const nonPlanningRows = rows.filter((r) => r.status !== "PLANNING");
  const planningRows = rows.filter((r) => r.status === "PLANNING");

  const urIds = nonPlanningRows.map((r) => r.userRatingId);
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

  const genreMap = new Map<number, { name: string; role: string | null }[]>();
  for (const g of genreRows) {
    if (!genreMap.has(g.userRatingId)) genreMap.set(g.userRatingId, []);
    genreMap.get(g.userRatingId)!.push({ name: g.genreName, role: g.role });
  }

  /* For PLANNING items: use anime_genres (from all_anime table) */
  const planningAnimeIds = planningRows.map((r) => r.animeId);
  const planningGenreRows =
    planningAnimeIds.length > 0
      ? await db
          .select({
            allAnimeId: animeGenres.allAnimeId,
            genreName: genreTable.genreName,
          })
          .from(animeGenres)
          .innerJoin(genreTable, eq(animeGenres.genreId, genreTable.id))
          .where(inArray(animeGenres.allAnimeId, planningAnimeIds))
      : [];

  const planningGenreMap = new Map<number, { name: string; role: null }[]>();
  for (const g of planningGenreRows) {
    if (!planningGenreMap.has(g.allAnimeId)) planningGenreMap.set(g.allAnimeId, []);
    planningGenreMap.get(g.allAnimeId)!.push({ name: g.genreName, role: null });
  }

  const items = rows.map((r) => ({
    id: r.animeId,
    titleEnglish: r.titleEnglish,
    coverImage: r.coverImage,
    rating: r.rating != null ? parseFloat(String(r.rating)) : null,
    genres: r.status === "PLANNING"
      ? (planningGenreMap.get(r.animeId) ?? [])
      : (genreMap.get(r.userRatingId) ?? []).sort((a, b) =>
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
    const escaped = escapeLikePattern(search);
    conditions.push(
      or(
        ilike(allAnime.titleEnglish, `%${escaped}%`),
        ilike(allAnime.titleRomaji, `%${escaped}%`)
      )
    );
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  /* All anime: watched sort uses release_year; rating sort uses avgScore */
  const allOrderBy =
    sort === "watched_desc"
      ? desc(allAnime.releaseYear)
      : sort === "watched_asc"
        ? asc(allAnime.releaseYear)
        : sort === "asc"
          ? asc(allAnime.avgScore)
          : desc(allAnime.avgScore);

  const rows = await db
    .select({
      id: allAnime.id,
      titleEnglish: allAnime.titleEnglish,
      coverImage: allAnime.coverImage,
      avgScore: allAnime.avgScore,
    })
    .from(allAnime)
    .where(whereClause)
    .orderBy(allOrderBy, desc(allAnime.id))
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
