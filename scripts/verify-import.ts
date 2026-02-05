/**
 * Verify user ratings import
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db, userRating, userRatingGenre } from "../src/db";
import { sql } from "drizzle-orm";

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

async function verify() {
  const ratingsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(userRating);
  
  const genresCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(userRatingGenre);
  
  console.log(`user_rating: ${ratingsCount[0].count} records`);
  console.log(`user_rating_genre: ${genresCount[0].count} records`);
  
  // Show first few ratings
  const sample = await db.select().from(userRating).limit(3);
  console.log("\nSample ratings:");
  for (const rating of sample) {
    console.log(`- ID ${rating.id}: anime_id=${rating.animeId}, rating=${rating.rating}, status=${rating.status}`);
  }
}

verify().catch(console.error);
