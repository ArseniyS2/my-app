import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  allAnime,
  animeGenres,
  animeTags,
  genre as genreTable,
  tags as tagsTable,
} from "./index";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ANILIST_API = "https://graphql.anilist.co";
const DEEPINFRA_EMBED_URL = "https://api.deepinfra.com/v1/openai/embeddings";
const EMBED_MODEL = "Qwen/Qwen3-Embedding-8B";
const EMBED_DIM = 3920;
const EMBED_FULL_DIM = 4096;

const PER_PAGE = 50;
const ANILIST_DELAY_MS = 2100; // ~30 req/min
const ANILIST_RETRIES = 5;
const EMBED_BATCH_SIZE = 16;
const EMBED_DELAY_MS = 1000;
const DB_INSERT_BATCH = 500;
const MIN_TAG_RANK = 65;
const BLOCKED_GENRES = new Set(["Hentai"]);

const ALLOWED_RELATIONS = new Set(["PREQUEL", "SEQUEL"]);
const FORMAT_PRIORITY = new Map<string, number>([
  ["TV", 0],
  ["MOVIE", 1],
  ["ONA", 2],
  ["OVA", 3],
  ["SPECIAL", 4],
  ["MUSIC", 5],
]);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StartDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface AnilistTag {
  rank: number;
  name: string;
}

interface AnilistRelationNode {
  id: number;
  startDate: StartDate | null;
}

interface AnilistRelationEdge {
  relationType: string;
  node: AnilistRelationNode;
}

export interface AnilistMedia {
  id: number;
  title: { romaji: string; english: string | null };
  episodes: number | null;
  genres: string[];
  tags: AnilistTag[];
  averageScore: number | null;
  coverImage: { extraLarge: string | null };
  description: string | null;
  startDate: StartDate;
  format: string | null;
  relations: { edges: AnilistRelationEdge[] };
}

export interface SyncOptions {
  /** ISO date string (YYYY-MM-DD) — only fetch anime with endDate_greater than this */
  lastSyncDate: string;
  /** If true, log planned actions but do not write to DB */
  dryRun?: boolean;
  /** Optional logger (defaults to console.log) */
  log?: (msg: string) => void;
}

export interface SyncResult {
  pagesFetched: number;
  fetchedTotal: number;
  newAnimeCount: number;
  insertedAnime: number;
  insertedEmbeddings: number;
  skippedNoEmbedding: number;
  dryRun: boolean;
}

/* ------------------------------------------------------------------ */
/*  AniList GraphQL                                                    */
/* ------------------------------------------------------------------ */

const ANILIST_QUERY = `
query ($page: Int!, $perPage: Int!, $endDateGreater: FuzzyDateInt) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage }
    media(
      type: ANIME,
      sort: ID,
      status: FINISHED,
      endDate_greater: $endDateGreater
    ) {
      id
      title { romaji english }
      episodes
      genres
      tags { rank name }
      averageScore
      coverImage { extraLarge }
      description
      startDate { year month day }
      format
      relations {
        edges {
          relationType
          node { id startDate { year month day } }
        }
      }
    }
  }
}
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Convert YYYY-MM-DD to AniList FuzzyDateInt YYYYMMDD (number) */
function dateStringToFuzzyInt(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date string: ${date}`);
  return y * 10000 + m * 100 + d;
}

async function anilistRequest(
  variables: Record<string, unknown>,
  retriesLeft = ANILIST_RETRIES,
  attempt = 1,
): Promise<{ Page: { pageInfo: { currentPage: number; hasNextPage: boolean }; media: AnilistMedia[] } }> {
  const res = await fetch(ANILIST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || "60");
    console.warn(`AniList 429 — sleeping ${retryAfter}s…`);
    await sleep(retryAfter * 1000);
    return anilistRequest(variables, retriesLeft, attempt);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (retriesLeft > 0 && res.status >= 500) {
      const backoffMs = attempt * 2000;
      console.warn(`AniList HTTP ${res.status} — retrying in ${backoffMs}ms…`);
      await sleep(backoffMs);
      return anilistRequest(variables, retriesLeft - 1, attempt + 1);
    }
    throw new Error(`AniList HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    data?: { Page: { pageInfo: { currentPage: number; hasNextPage: boolean }; media: AnilistMedia[] } };
    errors?: unknown[];
  };
  if (json.errors?.length) {
    throw new Error(`AniList GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) throw new Error("AniList response missing data");
  return json.data;
}

async function fetchAllFinishedSince(
  lastSyncDate: string,
  log: (m: string) => void,
): Promise<{ media: AnilistMedia[]; pagesFetched: number }> {
  const endDateGreater = dateStringToFuzzyInt(lastSyncDate);
  log(`Fetching FINISHED anime with endDate > ${lastSyncDate} (${endDateGreater})…`);

  const collected: AnilistMedia[] = [];
  let page = 1;
  let hasNextPage = true;
  let pagesFetched = 0;

  while (hasNextPage) {
    const data = await anilistRequest({ page, perPage: PER_PAGE, endDateGreater });
    pagesFetched++;
    const { media, pageInfo } = data.Page;
    collected.push(...media);
    log(`  page ${pageInfo.currentPage}: +${media.length} (running total ${collected.length})`);
    hasNextPage = pageInfo.hasNextPage;
    page++;
    if (hasNextPage) await sleep(ANILIST_DELAY_MS);
  }

  log(`Finished fetch: ${collected.length} anime across ${pagesFetched} pages.`);
  return { media: collected, pagesFetched };
}

/* ------------------------------------------------------------------ */
/*  Franchise assignment                                               */
/* ------------------------------------------------------------------ */

function dateKey(sd: StartDate | null | undefined): number {
  const y = sd?.year ?? 0;
  const m = sd?.month ?? 0;
  const d = sd?.day ?? 0;
  if (!y) return Number.POSITIVE_INFINITY;
  return y * 10000 + (m || 12) * 100 + (d || 31);
}

/** Compare two AniList media — returns true if `candidate` is a better franchise root than `current`. */
function betterRoot(current: AnilistMedia | null, candidate: AnilistMedia): boolean {
  if (!current) return true;
  const ak = dateKey(current.startDate);
  const bk = dateKey(candidate.startDate);
  if (bk < ak) return true;
  if (bk > ak) return false;
  const af = FORMAT_PRIORITY.get(current.format ?? "") ?? 999;
  const bf = FORMAT_PRIORITY.get(candidate.format ?? "") ?? 999;
  if (bf < af) return true;
  if (bf > af) return false;
  return candidate.id < current.id;
}

interface ExistingRow {
  id: number;
  anilistId: number;
  franchiseId: number;
}

/**
 * Assign franchise_id (AniList ID of the franchise root) to each new anime.
 *
 * Rules:
 *  - New anime with a PREQUEL/SEQUEL relative already in DB → inherit that relative's franchise_id.
 *  - New anime linked only to other *new* anime (same batch) → BFS across the batch component,
 *    then inherit if any member touches a DB relative; otherwise use the earliest-start member's
 *    own AniList ID as franchise_id.
 *  - If a component somehow touches multiple different existing franchise_ids (very unlikely),
 *    log a warning and pick the smallest value. Existing rows are NEVER modified.
 *
 * Returns a map of anilist_id → franchise_id for every item in newMedia.
 */
async function computeFranchiseIds(
  newMedia: AnilistMedia[],
  log: (m: string) => void,
): Promise<Map<number, number>> {
  const newByAnilist = new Map(newMedia.map((m) => [m.id, m]));

  // Collect every external (non-batch) anilist_id referenced by a PREQUEL/SEQUEL edge.
  const externalIds = new Set<number>();
  for (const m of newMedia) {
    for (const e of m.relations?.edges ?? []) {
      const rel = String(e.relationType || "").toUpperCase();
      if (!ALLOWED_RELATIONS.has(rel)) continue;
      const nid = e.node?.id;
      if (typeof nid === "number" && !newByAnilist.has(nid)) externalIds.add(nid);
    }
  }

  log(`Looking up ${externalIds.size} external relative(s) in DB…`);

  // Fetch only the anilist_id → franchise_id mapping for those relatives.
  const existingRows: ExistingRow[] = externalIds.size > 0
    ? await fetchExistingByAnilistIds([...externalIds])
    : [];
  const existingByAnilist = new Map(existingRows.map((r) => [r.anilistId, r]));

  // Build adjacency for within-batch PREQUEL/SEQUEL edges.
  const adj = new Map<number, Set<number>>();
  function addEdge(a: number, b: number) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  for (const m of newMedia) {
    for (const e of m.relations?.edges ?? []) {
      const rel = String(e.relationType || "").toUpperCase();
      if (!ALLOWED_RELATIONS.has(rel)) continue;
      const nid = e.node?.id;
      if (typeof nid === "number" && newByAnilist.has(nid)) addEdge(m.id, nid);
    }
  }

  // Return all distinct existing franchise_ids reachable from a given new anime's edges.
  function dbFranchiseIds(anilistId: number): Set<number> {
    const fids = new Set<number>();
    const m = newByAnilist.get(anilistId);
    if (!m) return fids;
    for (const e of m.relations?.edges ?? []) {
      const rel = String(e.relationType || "").toUpperCase();
      if (!ALLOWED_RELATIONS.has(rel)) continue;
      const nid = e.node?.id;
      if (typeof nid !== "number") continue;
      const existing = existingByAnilist.get(nid);
      if (existing) fids.add(existing.franchiseId);
    }
    return fids;
  }

  const result = new Map<number, number>();
  const visited = new Set<number>();

  for (const m of newMedia) {
    if (visited.has(m.id)) continue;

    // BFS to collect the full connected component within this batch.
    const queue = [m.id];
    visited.add(m.id);
    const component: AnilistMedia[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      const cur = newByAnilist.get(id);
      if (!cur) continue;
      component.push(cur);
      for (const nx of adj.get(id) ?? []) {
        if (!visited.has(nx)) { visited.add(nx); queue.push(nx); }
      }
    }

    // Gather every DB franchise_id touched by any member of this component.
    const touched = new Set<number>();
    for (const c of component) for (const f of dbFranchiseIds(c.id)) touched.add(f);

    let franchiseId: number;

    if (touched.size === 0) {
      // Purely standalone batch: use the earliest-start member's AniList ID.
      let root: AnilistMedia | null = null;
      for (const c of component) if (betterRoot(root, c)) root = c;
      franchiseId = root!.id;
    } else if (touched.size === 1) {
      // Normal case: one existing franchise — inherit it.
      franchiseId = [...touched][0];
    } else {
      // Edge case: component touches multiple existing franchises (shouldn't happen in practice).
      // Pick the smallest franchise_id and leave existing rows untouched.
      franchiseId = Math.min(...touched);
      log(
        `WARNING: new anime [${component.map((c) => c.id).join(", ")}] touches multiple ` +
        `existing franchise_ids [${[...touched].sort((a, b) => a - b).join(", ")}]. ` +
        `Using ${franchiseId}. Existing rows are not modified.`,
      );
    }

    for (const c of component) result.set(c.id, franchiseId);
  }

  log(`Franchise assignment complete for ${result.size} new anime.`);
  return result;
}

async function fetchExistingByAnilistIds(anilistIds: number[]): Promise<ExistingRow[]> {
  const out: ExistingRow[] = [];
  for (let i = 0; i < anilistIds.length; i += 1000) {
    const chunk = anilistIds.slice(i, i + 1000);
    const rows = await db
      .select({ id: allAnime.id, anilistId: allAnime.anilistId, franchiseId: allAnime.franchiseId })
      .from(allAnime)
      .where(inArray(allAnime.anilistId, chunk));
    out.push(...rows);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Embedding generation                                               */
/* ------------------------------------------------------------------ */

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build the text input used to generate the embedding.
 * Format mirrors the document format used at query time by the Qwen3 reranker
 * (see app/api/recommend/route.ts) so that embeddings and rerank candidate text
 * live in the same representational space.
 *
 * NOTE: The original corpus was embedded out-of-band (raw_info/qwen3_8b_dim3920.npy).
 * If the exact original input format differs, update this function to match.
 */
export function buildEmbeddingInput(m: AnilistMedia): string {
  const title = m.title.english || m.title.romaji;
  const genres = m.genres.join(", ");
  const filteredTags = m.tags.filter((t) => (t.rank ?? 0) >= MIN_TAG_RANK);
  const tagList = filteredTags.slice(0, 10).map((t) => t.name).join(", ");
  const synopsis = stripHtml(m.description ?? "").slice(0, 512);
  return `${title}. Genres: ${genres}. Tags: ${tagList}. ${synopsis}`;
}

/** L2-normalize a float array in place and return it. */
function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

async function embedBatch(inputs: string[], apiKey: string): Promise<number[][]> {
  // Use DeepInfra's OpenAI-compatible endpoint.
  // `dimensions` triggers MRL truncation server-side when supported; if the server returns
  // full 4096-dim anyway we truncate client-side and re-normalize.
  const res = await fetch(DEEPINFRA_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: inputs,
      dimensions: EMBED_DIM,
      encoding_format: "float",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepInfra embed ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };

  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => {
    const raw = d.embedding;
    if (raw.length === EMBED_DIM) return raw;
    if (raw.length === EMBED_FULL_DIM) return l2Normalize(raw.slice(0, EMBED_DIM));
    throw new Error(
      `Unexpected embedding dim ${raw.length} (expected ${EMBED_DIM} or ${EMBED_FULL_DIM})`,
    );
  });
}

async function generateEmbeddings(
  media: AnilistMedia[],
  apiKey: string,
  log: (m: string) => void,
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  log(`Generating embeddings for ${media.length} anime (batch size ${EMBED_BATCH_SIZE})…`);
  for (let i = 0; i < media.length; i += EMBED_BATCH_SIZE) {
    const chunk = media.slice(i, i + EMBED_BATCH_SIZE);
    const inputs = chunk.map(buildEmbeddingInput);
    const vecs = await embedBatch(inputs, apiKey);
    for (let j = 0; j < chunk.length; j++) out.set(chunk[j].id, vecs[j]);
    log(`  embedded ${Math.min(i + chunk.length, media.length)}/${media.length}`);
    if (i + EMBED_BATCH_SIZE < media.length) await sleep(EMBED_DELAY_MS);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  DB writes                                                          */
/* ------------------------------------------------------------------ */

function filterTags(media: AnilistMedia): AnilistTag[] {
  return media.tags.filter((t) => (t?.rank ?? 0) >= MIN_TAG_RANK);
}

async function getGenreTagMaps(): Promise<{
  genreMap: Map<string, number>;
  tagMap: Map<string, number>;
}> {
  const [genres, tagsRows] = await Promise.all([db.select().from(genreTable), db.select().from(tagsTable)]);
  const genreMap = new Map(genres.map((g) => [g.genreName, g.id]));
  const tagMap = new Map(tagsRows.map((t) => [t.tagName, t.id]));
  return { genreMap, tagMap };
}

/** Insert any missing genre/tag names discovered in the new anime. Returns updated maps. */
async function upsertGenresAndTags(
  media: AnilistMedia[],
  log: (m: string) => void,
): Promise<{ genreMap: Map<string, number>; tagMap: Map<string, number> }> {
  const { genreMap, tagMap } = await getGenreTagMaps();

  const missingGenres = new Set<string>();
  const missingTags = new Set<string>();
  for (const m of media) {
    for (const g of m.genres) if (!BLOCKED_GENRES.has(g) && !genreMap.has(g)) missingGenres.add(g);
    for (const t of filterTags(m)) if (!tagMap.has(t.name)) missingTags.add(t.name);
  }

  if (missingGenres.size > 0) {
    log(`  inserting ${missingGenres.size} new genre(s): ${[...missingGenres].join(", ")}`);
    const inserted = await db
      .insert(genreTable)
      .values([...missingGenres].map((genreName) => ({ genreName })))
      .returning({ id: genreTable.id, name: genreTable.genreName });
    for (const r of inserted) genreMap.set(r.name, r.id);
  }
  if (missingTags.size > 0) {
    log(`  inserting ${missingTags.size} new tag(s)`);
    const inserted = await db
      .insert(tagsTable)
      .values([...missingTags].map((tagName) => ({ tagName })))
      .returning({ id: tagsTable.id, name: tagsTable.tagName });
    for (const r of inserted) tagMap.set(r.name, r.id);
  }

  return { genreMap, tagMap };
}

function toHalfvecString(v: number[]): string {
  return "[" + v.join(",") + "]";
}

/* ------------------------------------------------------------------ */
/*  Orchestration                                                      */
/* ------------------------------------------------------------------ */

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const dryRun = Boolean(opts.dryRun);

  if (!opts.lastSyncDate) throw new Error("runSync: lastSyncDate is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey && !dryRun) {
    throw new Error("DEEPINFRA_API_KEY is not set (required for embedding generation)");
  }

  // 1. Fetch
  const { media: fetched, pagesFetched } = await fetchAllFinishedSince(opts.lastSyncDate, log);

  // 2. Filter: drop Hentai and anime whose anilist_id is already in DB
  const nonHentai = fetched.filter((m) => !m.genres.some((g) => BLOCKED_GENRES.has(g)));
  const hentaiCount = fetched.length - nonHentai.length;
  if (hentaiCount > 0) log(`Filtered out ${hentaiCount} blocked-genre anime (Hentai).`);

  // Drop anime already present in DB
  const fetchedAnilistIds = nonHentai.map((m) => m.id);
  const alreadyPresentAnilistIds = new Set<number>();
  for (let i = 0; i < fetchedAnilistIds.length; i += 1000) {
    const chunk = fetchedAnilistIds.slice(i, i + 1000);
    if (chunk.length === 0) continue;
    const existing = await db
      .select({ anilistId: allAnime.anilistId })
      .from(allAnime)
      .where(inArray(allAnime.anilistId, chunk));
    for (const r of existing) alreadyPresentAnilistIds.add(r.anilistId);
  }
  const newMedia = nonHentai.filter((m) => !alreadyPresentAnilistIds.has(m.id));
  log(`Filter: ${fetched.length} fetched, ${hentaiCount} blocked, ${alreadyPresentAnilistIds.size} already in DB, ${newMedia.length} new.`);

  if (newMedia.length === 0) {
    return {
      pagesFetched,
      fetchedTotal: fetched.length,
      newAnimeCount: 0,
      insertedAnime: 0,
      insertedEmbeddings: 0,
      skippedNoEmbedding: 0,
      dryRun,
    };
  }

  // 3. Franchise assignment
  const newAnimeFranchiseByAnilistId = await computeFranchiseIds(newMedia, log);

  // 4. Embeddings
  const embeddings = apiKey
    ? await generateEmbeddings(newMedia, apiKey, log)
    : new Map<number, number[]>();
  if (!apiKey) log("DRY RUN: skipping embedding generation (no DEEPINFRA_API_KEY).");

  // 5. Dry run: log summary and exit
  if (dryRun) {
    log("DRY RUN summary:");
    log(`  would insert ${newMedia.length} new anime rows`);
    log(`  would insert ${embeddings.size} embeddings`);
    for (const m of newMedia.slice(0, 10)) {
      log(
        `    • anilist_id=${m.id} "${m.title.english || m.title.romaji}" ` +
          `franchise_id(placeholder)=${newAnimeFranchiseByAnilistId.get(m.id)}`,
      );
    }
    if (newMedia.length > 10) log(`    …and ${newMedia.length - 10} more.`);
    return {
      pagesFetched,
      fetchedTotal: fetched.length,
      newAnimeCount: newMedia.length,
      insertedAnime: 0,
      insertedEmbeddings: 0,
      skippedNoEmbedding: 0,
      dryRun,
    };
  }

  // 6. Upsert unknown genres/tags
  const { genreMap, tagMap } = await upsertGenresAndTags(newMedia, log);

  // 7. Insert allAnime rows, get back DB ids
  log(`Inserting ${newMedia.length} new anime row(s)…`);
  const animeRecords = newMedia.map((m) => {
    const title = m.title.english || m.title.romaji;
    return {
      titleEnglish: title,
      titleRomaji: m.title.romaji,
      synopsis: m.description ?? "No synopsis available.",
      franchiseId: newAnimeFranchiseByAnilistId.get(m.id)!, // placeholder for standalone roots
      anilistId: m.id,
      coverImage: m.coverImage.extraLarge ?? "",
      coverImageLarge: m.coverImage.extraLarge ?? "",
      avgScore: m.averageScore ?? 0,
      episodeNumber: m.episodes ?? 0,
      releaseYear: m.startDate.year ?? 0,
    };
  });

  const anilistToDbId = new Map<number, number>();
  let insertedAnime = 0;
  for (let i = 0; i < animeRecords.length; i += DB_INSERT_BATCH) {
    const chunk = animeRecords.slice(i, i + DB_INSERT_BATCH);
    const rows = await db
      .insert(allAnime)
      .values(chunk)
      .onConflictDoNothing({ target: allAnime.anilistId })
      .returning({ id: allAnime.id, anilistId: allAnime.anilistId });
    for (const r of rows) anilistToDbId.set(r.anilistId, r.id);
    insertedAnime += rows.length;
    log(`  anime batch ${Math.floor(i / DB_INSERT_BATCH) + 1}: inserted ${rows.length}`);
  }

  // 8. Genre/tag relations
  const genreRels: { allAnimeId: number; genreId: number }[] = [];
  const tagRels: { animeId: number; tagId: number; rank: number }[] = [];
  for (const m of newMedia) {
    const dbId = anilistToDbId.get(m.id);
    if (!dbId) continue;
    for (const g of m.genres) {
      if (BLOCKED_GENRES.has(g)) continue;
      const gid = genreMap.get(g);
      if (gid) genreRels.push({ allAnimeId: dbId, genreId: gid });
    }
    for (const t of filterTags(m)) {
      const tid = tagMap.get(t.name);
      if (tid) tagRels.push({ animeId: dbId, tagId: tid, rank: t.rank });
    }
  }
  if (genreRels.length > 0) {
    log(`Inserting ${genreRels.length} anime-genre relations…`);
    for (let i = 0; i < genreRels.length; i += DB_INSERT_BATCH) {
      await db
        .insert(animeGenres)
        .values(genreRels.slice(i, i + DB_INSERT_BATCH))
        .onConflictDoNothing();
    }
  }
  if (tagRels.length > 0) {
    log(`Inserting ${tagRels.length} anime-tag relations…`);
    for (let i = 0; i < tagRels.length; i += DB_INSERT_BATCH) {
      await db
        .insert(animeTags)
        .values(tagRels.slice(i, i + DB_INSERT_BATCH))
        .onConflictDoNothing();
    }
  }

  // 10. Embeddings
  let insertedEmbeddings = 0;
  let skippedNoEmbedding = 0;
  const embeddingRows: { id: number; embedding: string }[] = [];
  for (const m of newMedia) {
    const dbId = anilistToDbId.get(m.id);
    if (!dbId) continue;
    const vec = embeddings.get(m.id);
    if (!vec) {
      skippedNoEmbedding++;
      continue;
    }
    embeddingRows.push({ id: dbId, embedding: toHalfvecString(vec) });
  }
  if (embeddingRows.length > 0) {
    log(`Inserting ${embeddingRows.length} embedding row(s)…`);
    // Use raw SQL to cast the string literal to halfvec — safer across Drizzle versions
    // for halfvec insertion than relying on driver param inference.
    const EMBED_DB_BATCH = 50;
    for (let i = 0; i < embeddingRows.length; i += EMBED_DB_BATCH) {
      const chunk = embeddingRows.slice(i, i + EMBED_DB_BATCH);
      const valuesSql = sql.join(
        chunk.map((r) => sql`(${r.id}, ${r.embedding}::halfvec(3920))`),
        sql`, `,
      );
      await db.execute(sql`
        INSERT INTO anime_embeddings (id, embedding)
        VALUES ${valuesSql}
        ON CONFLICT (id) DO NOTHING
      `);
      insertedEmbeddings += chunk.length;
      log(`  embeddings batch: inserted ${Math.min(i + chunk.length, embeddingRows.length)}/${embeddingRows.length}`);
    }
  }

  log("Sync complete.");
  return {
    pagesFetched,
    fetchedTotal: fetched.length,
    newAnimeCount: newMedia.length,
    insertedAnime,
    insertedEmbeddings,
    skippedNoEmbedding,
    dryRun,
  };
}
