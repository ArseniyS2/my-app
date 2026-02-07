import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db, allAnime } from "./index";

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

interface CoverImageEntry {
  id: number;
  coverImage: {
    extraLarge: string;
  };
}

const BATCH_SIZE = 500;

async function importCoverImages() {
  console.log("Starting cover images import...");

  const jsonPath = join(process.cwd(), "raw_info", "anilist_cover_images.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const data: CoverImageEntry[] = JSON.parse(raw);
  console.log(`Loaded ${data.length} entries from JSON`);

  // Get all anilist_id values that exist in all_anime
  const rows = await db
    .select({ anilistId: allAnime.anilistId })
    .from(allAnime);
  const existingAnilistIds = new Set(rows.map((r) => r.anilistId));
  console.log(`Found ${existingAnilistIds.size} anime in all_anime table`);

  // Keep only entries that exist in the DB; use extraLarge for cover_image_large
  const toUpdate = data
    .filter((entry) => existingAnilistIds.has(entry.id))
    .map((entry) => ({
      anilistId: entry.id,
      coverImageLarge: entry.coverImage?.extraLarge ?? "",
    }))
    .filter(({ coverImageLarge }) => coverImageLarge !== "");

  const skipped = data.length - toUpdate.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} entries (not in all_anime or missing cover URL)`);
  }
  console.log(`Updating cover_image_large for ${toUpdate.length} anime...`);

  const totalBatches = Math.ceil(toUpdate.length / BATCH_SIZE);
  let updated = 0;

  for (let i = 0; i < totalBatches; i++) {
    const start = i * BATCH_SIZE;
    const batch = toUpdate.slice(start, start + BATCH_SIZE);
    console.log(`Batch ${i + 1}/${totalBatches} (${batch.length} rows)...`);

    for (const { anilistId, coverImageLarge } of batch) {
      await db
        .update(allAnime)
        .set({ coverImageLarge })
        .where(eq(allAnime.anilistId, anilistId));
      updated++;
    }
  }

  console.log(`\nDone. Updated cover_image_large for ${updated} anime.`);
  process.exit(0);
}

importCoverImages().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
