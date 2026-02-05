/**
 * Clear all user ratings from the database
 * 
 * Run: bun run src/db/clear-user-ratings.ts
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "./index";
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

async function clearUserRatings() {
  console.log("Clearing user ratings...");

  // Delete from user_rating_genre first (foreign key constraint)
  console.log("Deleting user_rating_genre...");
  await db.execute(sql`DELETE FROM user_rating_genre`);

  // Delete from user_rating
  console.log("Deleting user_rating...");
  await db.execute(sql`DELETE FROM user_rating`);

  // Reset sequences
  console.log("Resetting sequences...");
  await db.execute(sql`ALTER SEQUENCE user_rating_id_seq RESTART WITH 1`);

  console.log("Done! All user ratings cleared.");
}

clearUserRatings().catch((error) => {
  console.error("Failed to clear user ratings:", error);
  process.exit(1);
});
