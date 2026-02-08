import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/src/db";
import {
  allAnime,
  animeEmbeddings,
  userRating,
  animeGenres,
  animeTags,
  genre as genreTable,
  tags as tagsTable,
} from "@/src/db/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Rating threshold for "top-rated" seed selection */
const TOP_RATED_THRESHOLD = 8.5;
/** Max seeds to use from top-rated */
const MAX_SEEDS = 20;
/** Number of candidates to retrieve from vector search (before reranking) */
const CANDIDATE_K = 200;
/** Default number of final recommendations to return */
const DEFAULT_LIMIT = 15;
/** DeepInfra reranker model */
const RERANKER_MODEL = "Qwen/Qwen3-Reranker-8B";

/* ------------------------------------------------------------------ */
/*  Request body types                                                  */
/* ------------------------------------------------------------------ */

interface RecommendRequest {
  seedAnimeIds?: number[];
  useTopRated?: boolean;
  includeGenres?: string[];
  excludeGenres?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  /** "any" = at least one genre must match (default), "all" = every genre must match */
  genreMatchMode?: "any" | "all";
  /** "any" = at least one tag must match (default), "all" = every tag must match */
  tagMatchMode?: "any" | "all";
  excludeWatched?: boolean;
  freeText?: string;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/*  POST /api/recommend                                                */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Rate limit: 10 recommendation requests per 5 minutes per user
  const rl = rateLimit(`recommend:${userId}`, 10, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    );
  }

  let body: RecommendRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    seedAnimeIds,
    useTopRated = true,
    includeGenres = [],
    excludeGenres = [],
    includeTags = [],
    excludeTags = [],
    genreMatchMode = "any",
    tagMatchMode = "any",
    excludeWatched = true,
    freeText = "",
    limit = DEFAULT_LIMIT,
  } = body;

  try {
    /* ============================================================== */
    /*  A) Determine seed set                                          */
    /* ============================================================== */

    let seedIds: number[] = [];

    if (seedAnimeIds && seedAnimeIds.length > 0) {
      seedIds = seedAnimeIds.slice(0, MAX_SEEDS);
    } else if (useTopRated) {
      const topRated = await db
        .select({ animeId: userRating.animeId, rating: userRating.rating })
        .from(userRating)
        .where(
          and(
            eq(userRating.userId, userId),
            sql`${userRating.rating} >= ${TOP_RATED_THRESHOLD}`
          )
        )
        .orderBy(desc(userRating.rating))
        .limit(MAX_SEEDS);

      seedIds = topRated.map((r) => r.animeId);
    }

    if (seedIds.length === 0) {
      return NextResponse.json(
        { error: "No seed anime found. Rate some anime first or pick seeds manually." },
        { status: 400 }
      );
    }

    /* ============================================================== */
    /*  B) Build user preference vector                                */
    /* ============================================================== */

    // Fetch seed embeddings and optional ratings for weighting
    const seedEmbeddings = await db
      .select({
        id: animeEmbeddings.id,
        embedding: animeEmbeddings.embedding,
      })
      .from(animeEmbeddings)
      .where(inArray(animeEmbeddings.id, seedIds));

    if (seedEmbeddings.length === 0) {
      return NextResponse.json(
        { error: "No embeddings found for seed anime." },
        { status: 400 }
      );
    }

    // Get ratings for weighting (if available)
    const seedRatings = await db
      .select({ animeId: userRating.animeId, rating: userRating.rating })
      .from(userRating)
      .where(
        and(eq(userRating.userId, userId), inArray(userRating.animeId, seedIds))
      );

    const ratingMap = new Map<number, number>();
    for (const r of seedRatings) {
      if (r.rating !== null) ratingMap.set(r.animeId, parseFloat(String(r.rating)));
    }

    // Weighted average of seed embeddings
    // Drizzle returns halfvec as number[] or a string "[0.1,0.2,...]"
    const dim = 3920;
    const queryVector = new Float64Array(dim);
    let totalWeight = 0;

    for (const se of seedEmbeddings) {
      const weight = ratingMap.get(se.id) ?? 7.0; // default weight if no rating
      const values = parseEmbedding(se.embedding);
      if (values.length !== dim) continue;
      for (let i = 0; i < dim; i++) {
        queryVector[i] += values[i] * weight;
      }
      totalWeight += weight;
    }

    // Normalize: divide by total weight, then L2-normalize
    if (totalWeight > 0) {
      for (let i = 0; i < dim; i++) {
        queryVector[i] /= totalWeight;
      }
    }

    // L2 normalize the query vector
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += queryVector[i] * queryVector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        queryVector[i] /= norm;
      }
    }

    const queryVecStr = `[${Array.from(queryVector).join(",")}]`;

    /* ============================================================== */
    /*  C) Candidate retrieval via vector similarity                   */
    /* ============================================================== */

    // Build exclusion set: seeds + watched anime (entire franchises)
    let excludeIds = [...seedIds];
    let excludeFranchiseIds: number[] = [];

    if (excludeWatched) {
      // Get all watched anime IDs
      const watchedRows = await db
        .select({ animeId: userRating.animeId })
        .from(userRating)
        .where(eq(userRating.userId, userId));
      const watchedIds = watchedRows.map((r) => r.animeId);

      // Resolve franchise IDs for all watched + seed anime
      const allExcludeSourceIds = [...new Set([...seedIds, ...watchedIds])];
      if (allExcludeSourceIds.length > 0) {
        const franchiseRows = await db
          .select({ franchiseId: allAnime.franchiseId })
          .from(allAnime)
          .where(inArray(allAnime.id, allExcludeSourceIds));
        excludeFranchiseIds = [...new Set(franchiseRows.map((r) => r.franchiseId))];

        // Get ALL anime IDs in those franchises so we can exclude them from vector search
        const franchiseAnimeRows = await db
          .select({ id: allAnime.id })
          .from(allAnime)
          .where(inArray(allAnime.franchiseId, excludeFranchiseIds));
        excludeIds = [...new Set(franchiseAnimeRows.map((r) => r.id))];
      }
    }

    // Resolve genre/tag IDs for filtering
    const excludeGenreIds: number[] = [];
    const includeGenreIds: number[] = [];
    const excludeTagIds: number[] = [];
    const includeTagIds: number[] = [];

    const [genreRows, tagRows] = await Promise.all([
      (includeGenres.length > 0 || excludeGenres.length > 0)
        ? db
            .select({ id: genreTable.id, name: genreTable.genreName })
            .from(genreTable)
            .where(
              inArray(
                genreTable.genreName,
                [...includeGenres, ...excludeGenres]
              )
            )
        : Promise.resolve([]),
      (includeTags.length > 0 || excludeTags.length > 0)
        ? db
            .select({ id: tagsTable.id, name: tagsTable.tagName })
            .from(tagsTable)
            .where(
              inArray(
                tagsTable.tagName,
                [...includeTags, ...excludeTags]
              )
            )
        : Promise.resolve([]),
    ]);

    for (const g of genreRows) {
      if (includeGenres.includes(g.name)) includeGenreIds.push(g.id);
      if (excludeGenres.includes(g.name)) excludeGenreIds.push(g.id);
    }
    for (const t of tagRows) {
      if (includeTags.includes(t.name)) includeTagIds.push(t.id);
      if (excludeTags.includes(t.name)) excludeTagIds.push(t.id);
    }

    // Build the vector similarity query with filters
    // Using cosine distance (<=>) with halfvec
    // Apply exclude filters early by joining with anime_genres / anime_tags
    const candidateQuery = buildCandidateQuery(
      queryVecStr,
      excludeIds,
      excludeGenreIds,
      includeGenreIds,
      excludeTagIds,
      includeTagIds,
      CANDIDATE_K,
      genreMatchMode,
      tagMatchMode
    );

    const candidates = await candidateQuery;

    if (candidates.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    const candidateIds = candidates.map((c) => c.id);

    /* Fetch full metadata for candidates (including franchiseId) */
    const [candidateMeta, candidateGenreRows, candidateTagRows] = await Promise.all([
      db
        .select({
          id: allAnime.id,
          titleEnglish: allAnime.titleEnglish,
          titleRomaji: allAnime.titleRomaji,
          coverImage: allAnime.coverImage,
          synopsis: allAnime.synopsis,
          avgScore: allAnime.avgScore,
          franchiseId: allAnime.franchiseId,
        })
        .from(allAnime)
        .where(inArray(allAnime.id, candidateIds)),
      db
        .select({
          animeId: animeGenres.allAnimeId,
          genreName: genreTable.genreName,
        })
        .from(animeGenres)
        .innerJoin(genreTable, eq(animeGenres.genreId, genreTable.id))
        .where(inArray(animeGenres.allAnimeId, candidateIds)),
      db
        .select({
          animeId: animeTags.animeId,
          tagName: tagsTable.tagName,
        })
        .from(animeTags)
        .innerJoin(tagsTable, eq(animeTags.tagId, tagsTable.id))
        .where(inArray(animeTags.animeId, candidateIds)),
    ]);

    // Build lookup maps
    const metaMap = new Map(candidateMeta.map((m) => [m.id, m]));
    const genreMap = new Map<number, string[]>();
    for (const g of candidateGenreRows) {
      if (!genreMap.has(g.animeId)) genreMap.set(g.animeId, []);
      genreMap.get(g.animeId)!.push(g.genreName);
    }
    const tagMap = new Map<number, string[]>();
    for (const t of candidateTagRows) {
      if (!tagMap.has(t.animeId)) tagMap.set(t.animeId, []);
      tagMap.get(t.animeId)!.push(t.tagName);
    }

    /* ============================================================== */
    /*  D) Reranking with DeepInfra Qwen3-Reranker                     */
    /* ============================================================== */

    // Build seed summary for the reranker query
    const seedMeta = await db
      .select({
        id: allAnime.id,
        titleEnglish: allAnime.titleEnglish,
      })
      .from(allAnime)
      .where(inArray(allAnime.id, seedIds));

    const seedTitles = seedMeta.map((s) => s.titleEnglish).slice(0, 10).join(", ");

    // Build reranker query
    let rerankerQuery = `Anime similar to: ${seedTitles}.`;
    if (includeGenres.length > 0) {
      rerankerQuery += ` Preferred genres: ${includeGenres.join(", ")}.`;
    }
    if (freeText) {
      rerankerQuery += ` User preference: ${freeText}`;
    }

    // Build document texts for each candidate
    const documents: string[] = [];
    const candidateOrder: number[] = []; // track id order

    for (const c of candidates) {
      const meta = metaMap.get(c.id);
      if (!meta) continue;
      candidateOrder.push(c.id);

      const genres = genreMap.get(c.id)?.join(", ") ?? "";
      const tagsList = tagMap.get(c.id)?.slice(0, 10).join(", ") ?? "";
      // Strip HTML from synopsis and truncate
      const synopsis = stripHtml(meta.synopsis).slice(0, 200);
      documents.push(
        `${meta.titleEnglish}. Genres: ${genres}. Tags: ${tagsList}. ${synopsis}`
      );
    }

    let rerankedIds: number[];
    let rerankedScores: Map<number, number>;

    const apiKey = process.env.DEEPINFRA_API_KEY;
    if (apiKey && documents.length > 0) {
      try {
        const rerankerResult = await callReranker(rerankerQuery, documents, apiKey);
        // Map scores back to anime IDs
        rerankedScores = new Map<number, number>();
        for (let i = 0; i < rerankerResult.scores.length; i++) {
          rerankedScores.set(candidateOrder[i], rerankerResult.scores[i]);
        }
        // Sort by reranker score descending
        rerankedIds = [...candidateOrder].sort(
          (a, b) => (rerankedScores.get(b) ?? 0) - (rerankedScores.get(a) ?? 0)
        );
      } catch (error) {
        console.error("Reranker failed, falling back to vector order:", error);
        rerankedIds = candidateOrder;
        rerankedScores = new Map(
          candidates.map((c) => [c.id, c.similarity])
        );
      }
    } else {
      // No API key or no documents — skip reranking
      rerankedIds = candidateOrder;
      rerankedScores = new Map(
        candidates.map((c) => [c.id, c.similarity])
      );
    }

    /* ============================================================== */
    /*  E) Post-processing                                             */
    /*     – filter excluded/included genres/tags                       */
    /*     – deduplicate by franchise (keep best hit per franchise)     */
    /*     – resolve franchise (season 1) info for display             */
    /* ============================================================== */

    const excludeGenreSet = new Set(excludeGenres);
    const excludeTagSet = new Set(excludeTags);
    const includeGenreSet = new Set(includeGenres);
    const includeTagSet = new Set(includeTags);

    // Filter, then deduplicate by franchise keeping best score
    const seenFranchises = new Set<number>();
    const franchiseHits: {
      franchiseId: number;
      hitId: number;
      hitTitle: string;
      score: number;
      genres: string[];
      tags: string[];
    }[] = [];

    for (const id of rerankedIds) {
      const meta = metaMap.get(id);
      if (!meta) continue;

      const g = genreMap.get(id) ?? [];
      const t = tagMap.get(id) ?? [];

      // Hard exclude
      if (g.some((genre) => excludeGenreSet.has(genre))) continue;
      if (t.some((tag) => excludeTagSet.has(tag))) continue;
      // Include filter — respect match mode (any vs all)
      if (includeGenreSet.size > 0) {
        if (genreMatchMode === "all") {
          if (![...includeGenreSet].every((genre) => g.includes(genre))) continue;
        } else {
          if (!g.some((genre) => includeGenreSet.has(genre))) continue;
        }
      }
      if (includeTagSet.size > 0) {
        if (tagMatchMode === "all") {
          if (![...includeTagSet].every((tag) => t.includes(tag))) continue;
        } else {
          if (!t.some((tag) => includeTagSet.has(tag))) continue;
        }
      }

      // Franchise dedup: skip if we already have a hit from this franchise
      if (seenFranchises.has(meta.franchiseId)) continue;
      seenFranchises.add(meta.franchiseId);

      franchiseHits.push({
        franchiseId: meta.franchiseId,
        hitId: id,
        hitTitle: meta.titleEnglish,
        score: rerankedScores.get(id) ?? 0,
        genres: g,
        tags: t.slice(0, 8),
      });

      if (franchiseHits.length >= limit) break;
    }

    // Fetch the franchise representative for each franchise_id.
    // franchise_id is a grouping key, NOT a foreign key to all_anime.id.
    // Find the earliest anime (by id) in each franchise to use as the representative.
    const franchiseIdValues = franchiseHits.map((h) => h.franchiseId);
    const franchiseAllRows = franchiseIdValues.length > 0
      ? await db
          .select({
            id: allAnime.id,
            franchiseId: allAnime.franchiseId,
            titleEnglish: allAnime.titleEnglish,
            coverImage: allAnime.coverImage,
          })
          .from(allAnime)
          .where(inArray(allAnime.franchiseId, franchiseIdValues))
      : [];

    // Pick one representative per franchise (lowest id = earliest entry / season 1)
    const franchiseRepMap = new Map<number, { id: number; titleEnglish: string; coverImage: string }>();
    for (const row of franchiseAllRows) {
      const existing = franchiseRepMap.get(row.franchiseId);
      if (!existing || row.id < existing.id) {
        franchiseRepMap.set(row.franchiseId, {
          id: row.id,
          titleEnglish: row.titleEnglish,
          coverImage: row.coverImage,
        });
      }
    }

    // Fetch genres for franchise representative anime
    const franchiseRepIds = [...new Set([...franchiseRepMap.values()].map((r) => r.id))];
    const franchiseGenreRows = franchiseRepIds.length > 0
      ? await db
          .select({
            animeId: animeGenres.allAnimeId,
            genreName: genreTable.genreName,
          })
          .from(animeGenres)
          .innerJoin(genreTable, eq(animeGenres.genreId, genreTable.id))
          .where(inArray(animeGenres.allAnimeId, franchiseRepIds))
      : [];

    const franchiseGenreMap = new Map<number, string[]>();
    for (const fg of franchiseGenreRows) {
      if (!franchiseGenreMap.has(fg.animeId)) franchiseGenreMap.set(fg.animeId, []);
      franchiseGenreMap.get(fg.animeId)!.push(fg.genreName);
    }

    /** Minimum similarity score (60%) — results below this are not shown */
    const MIN_SCORE_THRESHOLD = 0.6;

    const recommendations = franchiseHits
      .filter((hit) => hit.score >= MIN_SCORE_THRESHOLD)
      .map((hit) => {
        const rep = franchiseRepMap.get(hit.franchiseId);
        const hitMeta = metaMap.get(hit.hitId);

        if (rep) {
          const hitIsRep = hit.hitId === rep.id;
          return {
            // Link to the franchise representative (season 1)
            id: rep.id,
            title: rep.titleEnglish,
            coverUrl: rep.coverImage,
            score: hit.score,
            genres: franchiseGenreMap.get(rep.id) ?? hit.genres,
            tags: hit.tags,
            directHit: {
              id: hit.hitId,
              // Only show "matched: X" when the hit is a different entry than what we display
              title: hitIsRep ? "" : hit.hitTitle,
            },
          };
        }

        // No franchise entries found at all — display the direct hit itself
        return {
          id: hit.hitId,
          title: hit.hitTitle,
          coverUrl: hitMeta?.coverImage ?? "",
          score: hit.score,
          genres: hit.genres,
          tags: hit.tags,
          directHit: {
            id: hit.hitId,
            title: "",
          },
        };
      });

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("API /recommend error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: parse embedding (number[] or string "[0.1,0.2,...]")       */
/* ------------------------------------------------------------------ */

function parseEmbedding(raw: unknown): number[] {
  if (!raw) return [];
  // Already an array of numbers (Drizzle neon-http returns this)
  if (Array.isArray(raw)) return raw.map(Number);
  // String format "[0.1,0.2,...]"
  if (typeof raw === "string") {
    const cleaned = raw.replace(/^\[|\]$/g, "");
    return cleaned.split(",").map((v) => parseFloat(v));
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Helper: strip HTML tags                                             */
/* ------------------------------------------------------------------ */

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/*  Helper: build vector similarity candidate query                     */
/* ------------------------------------------------------------------ */

async function buildCandidateQuery(
  queryVecStr: string,
  excludeIds: number[],
  excludeGenreIds: number[],
  includeGenreIds: number[],
  excludeTagIds: number[],
  includeTagIds: number[],
  candidateK: number,
  genreMatchMode: "any" | "all" = "any",
  tagMatchMode: "any" | "all" = "any"
): Promise<{ id: number; similarity: number }[]> {
  // Build parameterised WHERE conditions using Drizzle's sql`` tag
  const conditions: ReturnType<typeof sql>[] = [];

  // Exclude specific anime IDs (seeds + watched)
  if (excludeIds.length > 0) {
    conditions.push(
      sql`ae.id NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`
    );
  }

  // Exclude anime with certain genres
  if (excludeGenreIds.length > 0) {
    conditions.push(
      sql`ae.id NOT IN (SELECT all_anime_id FROM anime_genres WHERE genre_id IN (${sql.join(excludeGenreIds.map((id) => sql`${id}`), sql`, `)}))`
    );
  }

  // Include anime with matching genres (ANY = at least one, ALL = every specified genre)
  if (includeGenreIds.length > 0) {
    if (genreMatchMode === "all") {
      // ALL mode: anime must have every specified genre
      conditions.push(
        sql`(SELECT COUNT(DISTINCT genre_id) FROM anime_genres WHERE all_anime_id = ae.id AND genre_id IN (${sql.join(includeGenreIds.map((id) => sql`${id}`), sql`, `)})) = ${includeGenreIds.length}`
      );
    } else {
      // ANY mode: anime must have at least one of the specified genres
      conditions.push(
        sql`ae.id IN (SELECT all_anime_id FROM anime_genres WHERE genre_id IN (${sql.join(includeGenreIds.map((id) => sql`${id}`), sql`, `)}))`
      );
    }
  }

  // Exclude anime with certain tags
  if (excludeTagIds.length > 0) {
    conditions.push(
      sql`ae.id NOT IN (SELECT anime_id FROM anime_tags WHERE tag_id IN (${sql.join(excludeTagIds.map((id) => sql`${id}`), sql`, `)}))`
    );
  }

  // Include anime with matching tags (ANY = at least one, ALL = every specified tag)
  if (includeTagIds.length > 0) {
    if (tagMatchMode === "all") {
      // ALL mode: anime must have every specified tag
      conditions.push(
        sql`(SELECT COUNT(DISTINCT tag_id) FROM anime_tags WHERE anime_id = ae.id AND tag_id IN (${sql.join(includeTagIds.map((id) => sql`${id}`), sql`, `)})) = ${includeTagIds.length}`
      );
    } else {
      // ANY mode: anime must have at least one of the specified tags
      conditions.push(
        sql`ae.id IN (SELECT anime_id FROM anime_tags WHERE tag_id IN (${sql.join(includeTagIds.map((id) => sql`${id}`), sql`, `)}))`
      );
    }
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  // Use cosine distance operator (<=>) for halfvec
  // 1 - cosine_distance = cosine_similarity
  const result = await db.execute(sql`
    SELECT
      ae.id,
      1 - (ae.embedding <=> ${queryVecStr}::halfvec(3920)) AS similarity
    FROM anime_embeddings ae
    ${whereClause}
    ORDER BY ae.embedding <=> ${queryVecStr}::halfvec(3920)
    LIMIT ${candidateK}
  `);

  return (result.rows as { id: number; similarity: number }[]).map((r) => ({
    id: Number(r.id),
    similarity: Number(r.similarity),
  }));
}

/* ------------------------------------------------------------------ */
/*  Helper: call DeepInfra reranker API                                 */
/* ------------------------------------------------------------------ */

async function callReranker(
  query: string,
  documents: string[],
  apiKey: string
): Promise<{ scores: number[] }> {
  const response = await fetch(
    `https://api.deepinfra.com/v1/inference/${RERANKER_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queries: [query],
        documents,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Reranker API error ${response.status}: ${errText}`);
  }

  return response.json();
}
