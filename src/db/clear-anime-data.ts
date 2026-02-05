import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { db } from "./index";

// Load .env.local so DATABASE_URL is available
const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  const content = readFileSync(envLocal, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match)
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function clearAnimeData() {
  console.log("Clearing anime data from database...");

  // Delete in order respecting foreign key constraints
  console.log("Deleting anime_tags...");
  await db.execute(sql`DELETE FROM anime_tags`);

  console.log("Deleting anime_genres...");
  await db.execute(sql`DELETE FROM anime_genres`);

  console.log("Deleting all_anime...");
  await db.execute(sql`DELETE FROM all_anime`);

  console.log("Deleting tags...");
  await db.execute(sql`DELETE FROM tags`);

  console.log("Deleting genre...");
  await db.execute(sql`DELETE FROM genre`);

  // Reset sequences to start from 1
  console.log("Resetting ID sequences...");
  await db.execute(sql`ALTER SEQUENCE all_anime_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE genre_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE tags_id_seq RESTART WITH 1`);

  console.log("All anime data cleared and sequences reset!");
  process.exit(0);
}

clearAnimeData().catch((err) => {
  console.error("Clear failed:", err);
  process.exit(1);
});
