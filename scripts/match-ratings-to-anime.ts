/**
 * Adds all_anime.id to each entry in anime_user_ratings_import.json
 * by matching entry.title to the closest titleEnglish in all_anime.
 *
 * Run: bun run scripts/match-ratings-to-anime.ts
 * (Ensure .env.local has DATABASE_URL and you've run db:import-anime so all_anime is populated)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { db, allAnime } from "../src/db";

// Load .env.local
const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  const content = readFileSync(envLocal, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match)
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Dice coefficient (bigrams). Returns 0..1.
 */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;

  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const sa = bigrams(na);
  const sb = bigrams(nb);
  let hits = 0;
  for (const b of sa) if (sb.has(b)) hits++;
  return (2 * hits) / (sa.size + sb.size);
}

interface RatingEntry {
  title: string;
  rating: number;
  status: string;
  review: string;
  genres: { name: string; type: string }[];
}

interface RatingEntryWithId extends RatingEntry {
  all_anime_id: number | null;
  matched_title?: string;
  match_score?: number;
}

async function main() {
  const ratingsPath = join(process.cwd(), "raw_info", "anime_user_ratings_import.json");
  const outPath = join(process.cwd(), "raw_info", "anime_user_ratings_import2.json");

  console.log("Loading ratings from", ratingsPath);
  const ratings: RatingEntry[] = JSON.parse(readFileSync(ratingsPath, "utf-8"));
  console.log("Loading all_anime (id, title_english) from DB...");
  const animeRows = await db.select({ id: allAnime.id, titleEnglish: allAnime.titleEnglish }).from(allAnime);
  const titles = animeRows.map((r) => ({ id: r.id, title: r.titleEnglish }));

  console.log(`Matching ${ratings.length} ratings against ${titles.length} anime...`);

  const result: RatingEntryWithId[] = ratings.map((entry) => {
    let bestId: number | null = null;
    let bestTitle: string | null = null;
    let bestScore = 0;

    for (const { id, title } of titles) {
      const score = similarity(entry.title, title);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
        bestTitle = title;
      }
    }

    const out: RatingEntryWithId = {
      ...entry,
      all_anime_id: bestId,
      matched_title: bestTitle ?? undefined,
      match_score: bestScore,
    };
    return out;
  });

  console.log("Writing updated JSON to", outPath);
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

  // Summary
  const withMatch = result.filter((r) => r.all_anime_id != null);
  const lowScore = result.filter((r) => (r.match_score ?? 0) < 0.5);
  console.log(`Done. Matched: ${withMatch.length}/${result.length}`);
  if (lowScore.length) console.log(`Low similarity (<0.5): ${lowScore.length}. Check: ${lowScore.map((r) => r.title).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
