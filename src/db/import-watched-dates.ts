/**
 * Import watched dates into user_rating.watched_date from anime_watched_dates_with_ids.json
 *
 * Expected JSON format (array):
 * [
 *   { "id": 123, "date": "2024-01-15" }, // id = all_anime.id
 *   ...
 * ]
 *
 * Run: bun run src/db/import-watched-dates.ts
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { and, eq } from "drizzle-orm";
import { db, userRating } from "./index";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Set it in .env or run: source .env.local && bun run ...");
  process.exit(1);
}

interface WatchedDateEntry {
  id: number; // all_anime.id
  // JSON may use either "date" or "watched_date"
  date?: string;
  watched_date?: string;
}

// NOTE: This script assumes watched dates belong to this user.
// If you have multiple users, adjust USER_ID or extend the JSON format.
const USER_ID = "0ef61a79-3c0f-4036-b213-201bb1d11639"; // User "ars"

async function importWatchedDates() {
  console.log("Starting watched dates import...");

  const jsonPath = join(
    process.cwd(),
    "raw_info",
    "anime_watched_dates_with_ids.json",
  );

  if (!existsSync(jsonPath)) {
    console.error(
      `JSON file not found at ${jsonPath}. Place anime_watched_dates_with_ids.json under raw_info/.`,
    );
    process.exit(1);
  }

  const raw = readFileSync(jsonPath, "utf-8");
  const entries: WatchedDateEntry[] = JSON.parse(raw);
  console.log(`Loaded ${entries.length} watched-date entries from JSON`);

  let updated = 0;
  let skippedNoRating = 0;
  let skippedNoDate = 0;

  for (const entry of entries) {
    const date = entry.date ?? entry.watched_date;
    if (!date) {
      skippedNoDate++;
      continue;
    }

    // Basic validation: expect YYYY-MM-DD (10 chars, has dashes)
    if (date.length !== 10 || date[4] !== "-" || date[7] !== "-") {
      console.warn(
        `Skipping id=${entry.id} due to unexpected date format: "${date}"`,
      );
      skippedNoDate++;
      continue;
    }

    const result = await db
      .update(userRating)
      .set({ watchedDate: date })
      .where(and(eq(userRating.userId, USER_ID), eq(userRating.animeId, entry.id)))
      .returning({ id: userRating.id });

    if (result.length === 0) {
      skippedNoRating++;
      continue;
    }

    updated++;
    if (updated % 25 === 0) {
      console.log(`Progress: updated ${updated} rows so far`);
    }
  }

  console.log("\nWatched dates import finished.");
  console.log(`  Updated rows: ${updated}`);
  console.log(`  Skipped (no matching user_rating row): ${skippedNoRating}`);
  console.log(`  Skipped (missing/invalid date): ${skippedNoDate}`);

  process.exit(0);
}

importWatchedDates().catch((error) => {
  console.error("Watched dates import failed:", error);
  process.exit(1);
});

