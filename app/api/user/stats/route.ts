import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  db,
  userRating,
  allAnime,
  animeGenres,
  genre,
  animeTags,
  tags,
} from "@/src/db";
import { eq, and, sql, gte, inArray } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  /* ------------------------------------------------------------------ */
  /*  Batch 1 – independent queries run in parallel                      */
  /* ------------------------------------------------------------------ */
  const [statusCountsRaw, completedAnime, genreBreakdown] =
    await Promise.all([
      /* 1. Status counts */
      db
        .select({
          status: userRating.status,
          count: sql<number>`count(*)::int`,
        })
        .from(userRating)
        .where(eq(userRating.userId, userId))
        .groupBy(userRating.status),

      /* 2. Completed anime – anilistId for franchise lookup,
            watchedDate for timeline + 30-day filter */
      db
        .select({
          animeId: userRating.animeId,
          anilistId: allAnime.anilistId,
          watchedDate: userRating.watchedDate,
        })
        .from(userRating)
        .innerJoin(allAnime, eq(userRating.animeId, allAnime.id))
        .where(
          and(
            eq(userRating.userId, userId),
            eq(userRating.status, "COMPLETED")
          )
        ),

      /* 3. Genre breakdown (for donut chart) */
      db
        .select({
          genreName: genre.genreName,
          count: sql<number>`count(*)::int`,
        })
        .from(userRating)
        .innerJoin(animeGenres, eq(userRating.animeId, animeGenres.allAnimeId))
        .innerJoin(genre, eq(animeGenres.genreId, genre.id))
        .where(
          and(
            eq(userRating.userId, userId),
            eq(userRating.status, "COMPLETED")
          )
        )
        .groupBy(genre.genreName)
        .orderBy(sql`count(*) desc`),
    ]);

  /* ---- Process status counts ---- */
  const statusCounts = {
    completed: 0,
    watching: 0,
    planned: 0,
    onHold: 0,
    dropped: 0,
  };
  for (const row of statusCountsRaw) {
    switch (row.status) {
      case "COMPLETED":
        statusCounts.completed = row.count;
        break;
      case "WATCHING":
        statusCounts.watching = row.count;
        break;
      case "PLANNING":
        statusCounts.planned = row.count;
        break;
      case "ON_HOLD":
        statusCounts.onHold = row.count;
        break;
      case "DROPPED":
        statusCounts.dropped = row.count;
        break;
    }
  }

  /* ---- Derived ID lists ---- */
  const completedAnimeIds = completedAnime.map((r) => r.animeId);
  const completedAnilistIds = completedAnime.map((r) => r.anilistId);

  /* Raw watched dates – the frontend groups them by chosen period */
  const watchedDates = completedAnime
    .map((r) => r.watchedDate)
    .filter((d): d is string => d !== null)
    .sort();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  const last30AnilistIds = completedAnime
    .filter((r) => r.watchedDate && r.watchedDate >= thirtyDaysAgoStr)
    .map((r) => r.anilistId);

  /* ------------------------------------------------------------------ */
  /*  Batch 2 – queries that depend on batch-1 results                   */
  /* ------------------------------------------------------------------ */
  const [
    totalEpisodesResult,
    last30EpisodesResult,
    popularTagsResult,
    animeTopTagsData,
    animeGenresData,
  ] = await Promise.all([
    /* Total episodes (sum all seasons via franchise_id = anilist_id) */
    completedAnilistIds.length > 0
      ? db
          .select({
            total: sql<number>`COALESCE(SUM(${allAnime.episodeNumber}), 0)::int`,
          })
          .from(allAnime)
          .where(inArray(allAnime.franchiseId, completedAnilistIds))
      : Promise.resolve([{ total: 0 }]),

    /* Episodes from last-30-day completions (franchise-based) */
    last30AnilistIds.length > 0
      ? db
          .select({
            total: sql<number>`COALESCE(SUM(${allAnime.episodeNumber}), 0)::int`,
          })
          .from(allAnime)
          .where(inArray(allAnime.franchiseId, last30AnilistIds))
      : Promise.resolve([{ total: 0 }]),

    /* Popular tags – count distinct anime per tag, top 15 */
    completedAnimeIds.length > 0
      ? db
          .select({
            tagName: tags.tagName,
            count: sql<number>`count(DISTINCT ${animeTags.animeId})::int`,
          })
          .from(animeTags)
          .innerJoin(tags, eq(animeTags.tagId, tags.id))
          .where(inArray(animeTags.animeId, completedAnimeIds))
          .groupBy(tags.tagName)
          .orderBy(sql`count(DISTINCT ${animeTags.animeId}) desc`)
          .limit(15)
      : Promise.resolve([]),

    /* High-relevance tags per anime for combination computation
       rank is a 0-100 percentage in AniList; ≥ 60 = strongly relevant */
    completedAnimeIds.length > 0
      ? db
          .select({
            animeId: animeTags.animeId,
            tagName: tags.tagName,
          })
          .from(animeTags)
          .innerJoin(tags, eq(animeTags.tagId, tags.id))
          .where(
            and(
              inArray(animeTags.animeId, completedAnimeIds),
              gte(animeTags.rank, 60)
            )
          )
      : Promise.resolve([]),

    /* Genres per anime (for combination computation) */
    completedAnimeIds.length > 0
      ? db
          .select({
            animeId: animeGenres.allAnimeId,
            genreName: genre.genreName,
          })
          .from(animeGenres)
          .innerJoin(genre, eq(animeGenres.genreId, genre.id))
          .where(inArray(animeGenres.allAnimeId, completedAnimeIds))
      : Promise.resolve([]),
  ]);

  /* ---- Total & last-30 episodes ---- */
  const totalEpisodes = totalEpisodesResult[0]?.total ?? 0;
  const last30Episodes = last30EpisodesResult[0]?.total ?? 0;
  const hoursLast30Days =
    Math.round(((last30Episodes * 24) / 60) * 10) / 10;

  /* ---- Popular tags ---- */
  const popularTags = popularTagsResult.map((r) => ({
    tagName: r.tagName,
    count: r.count,
  }));

  /* ---- Tag combinations (high-relevance tags, co-occurrence pairs) -- */
  const animeTopTags = new Map<number, string[]>();
  for (const row of animeTopTagsData) {
    const existing = animeTopTags.get(row.animeId) ?? [];
    existing.push(row.tagName);
    animeTopTags.set(row.animeId, existing);
  }

  const tagPairCounts = new Map<string, number>();
  for (const [, tagList] of animeTopTags) {
    for (let i = 0; i < tagList.length; i++) {
      for (let j = i + 1; j < tagList.length; j++) {
        const pair = [tagList[i], tagList[j]].sort().join("\0");
        tagPairCounts.set(pair, (tagPairCounts.get(pair) ?? 0) + 1);
      }
    }
  }

  const tagCombinations = [...tagPairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pair, count]) => {
      const [tag1, tag2] = pair.split("\0");
      return { tag1, tag2, count };
    });

  /* ---- Genre combinations (co-occurrence pairs) ---- */
  const animeGenreMap = new Map<number, string[]>();
  for (const row of animeGenresData) {
    const existing = animeGenreMap.get(row.animeId) ?? [];
    existing.push(row.genreName);
    animeGenreMap.set(row.animeId, existing);
  }

  const genrePairCounts = new Map<string, number>();
  for (const [, genreList] of animeGenreMap) {
    for (let i = 0; i < genreList.length; i++) {
      for (let j = i + 1; j < genreList.length; j++) {
        const pair = [genreList[i], genreList[j]].sort().join("\0");
        genrePairCounts.set(pair, (genrePairCounts.get(pair) ?? 0) + 1);
      }
    }
  }

  const genreCombinations = [...genrePairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pair, count]) => {
      const [genre1, genre2] = pair.split("\0");
      return { genre1, genre2, count };
    });

  /* ------------------------------------------------------------------ */
  /*  Response                                                           */
  /* ------------------------------------------------------------------ */
  return Response.json({
    statusCounts,
    totalEpisodes,
    hoursLast30Days,
    watchedDates,
    genreBreakdown,
    popularTags,
    genreCombinations,
    tagCombinations,
  });
}
