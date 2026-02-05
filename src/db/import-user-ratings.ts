/**
 * Import user ratings from anime_user_ratings_import_with_ids.json
 * 
 * Run: bun run src/db/import-user-ratings.ts
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { db, userRating, genre, userRatingGenre } from "./index";

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

interface RatingEntry {
  title: string;
  rating: number | null;
  status: "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLANNING";
  review: string;
  genres: {
    name: string;
    type: "primary" | "secondary";
  }[];
  all_anime_id: number;
  matched_title?: string;
  match_score?: number;
}

const USER_ID = "0ef61a79-3c0f-4036-b213-201bb1d11639"; // User "ars"

async function importUserRatings() {
  console.log("Starting user ratings import...");

  // Load JSON
  const ratingsPath = join(process.cwd(), "raw_info", "anime_user_ratings_import_with_ids.json");
  const ratings: RatingEntry[] = JSON.parse(readFileSync(ratingsPath, "utf-8"));
  console.log(`Found ${ratings.length} ratings to import`);

  // Build genre lookup map
  console.log("Loading genres from DB...");
  const genresFromDb = await db.select().from(genre);
  const genreMap = new Map<string, number>();
  for (const g of genresFromDb) {
    genreMap.set(g.genreName.toLowerCase(), g.id);
  }
  console.log(`Loaded ${genreMap.size} genres`);

  // Import ratings
  let imported = 0;
  let skipped = 0;

  for (const entry of ratings) {
    if (!entry.all_anime_id) {
      console.log(`Skipping "${entry.title}" - no all_anime_id`);
      skipped++;
      continue;
    }

    try {
      // Insert user_rating
      const [insertedRating] = await db
        .insert(userRating)
        .values({
          rating: entry.rating !== null ? entry.rating.toString() : null, // numeric is stored as string in drizzle
          review: entry.review,
          status: entry.status,
          userId: USER_ID,
          animeId: entry.all_anime_id,
        })
        .returning({ id: userRating.id });

      const userRatingId = insertedRating.id;

      // Insert user_rating_genre entries
      for (const genreEntry of entry.genres) {
        const genreName = genreEntry.name.toLowerCase();
        const genreId = genreMap.get(genreName);

        if (!genreId) {
          console.warn(`Genre "${genreEntry.name}" not found in DB, skipping for "${entry.title}"`);
          continue;
        }

        const roleUpperCase = genreEntry.type.toUpperCase() as "PRIMARY" | "SECONDARY";

        await db.insert(userRatingGenre).values({
          role: roleUpperCase,
          userRatingId,
          genreId,
        });
      }

      imported++;
      if (imported % 10 === 0) {
        console.log(`Progress: ${imported}/${ratings.length}`);
      }
    } catch (error) {
      console.error(`Error importing "${entry.title}":`, error);
      throw error;
    }
  }

  console.log(`\nImport complete!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped: ${skipped}`);
}

importUserRatings().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
