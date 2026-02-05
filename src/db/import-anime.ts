import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { db, allAnime, genre, tags, animeGenres, animeTags } from "./index";

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

interface AnimeTag {
  rank: number;
  name: string;
}

interface AnimeJson {
  id: number; // This maps to anilist_id
  status: string;
  title: {
    romaji: string;
    english: string | null;
  };
  episodes: number | null;
  genres: string[];
  tags: AnimeTag[];
  averageScore: number | null;
  coverImage: {
    medium: string;
  };
  description: string | null;
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  franchise_id: number;
}

const BATCH_SIZE = 500;

async function importAnime() {
  console.log("Starting anime import...");

  // Load anime JSON
  const animePath = join(process.cwd(), "raw_info", "all_anime_info.json");
  const animeData: AnimeJson[] = JSON.parse(readFileSync(animePath, "utf-8"));
  console.log(`Found ${animeData.length} anime to import`);

  // Fetch genre and tag lookup maps from DB
  console.log("Building genre and tag lookup maps...");
  const genresFromDb = await db.select().from(genre);
  const tagsFromDb = await db.select().from(tags);

  const genreMap = new Map<string, number>();
  for (const g of genresFromDb) {
    genreMap.set(g.genreName, g.id);
  }

  const tagMap = new Map<string, number>();
  for (const t of tagsFromDb) {
    tagMap.set(t.tagName, t.id);
  }

  console.log(`Loaded ${genreMap.size} genres and ${tagMap.size} tags from DB`);

  // Process anime in batches
  const totalBatches = Math.ceil(animeData.length / BATCH_SIZE);
  
  // We need to track the auto-incremented IDs
  // Since we're inserting in order, we can calculate the ID based on position
  let currentAnimeId = 1;

  // Store all genre and tag relations to insert after all anime are inserted
  const allGenreRelations: { allAnimeId: number; genreId: number }[] = [];
  const allTagRelations: { animeId: number; tagId: number; rank: number }[] = [];

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const start = batchNum * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, animeData.length);
    const batch = animeData.slice(start, end);

    console.log(`Processing batch ${batchNum + 1}/${totalBatches} (anime ${start + 1}-${end})...`);

    // Prepare anime records for this batch
    const animeRecords = batch.map((anime) => ({
      titleEnglish: anime.title.english || anime.title.romaji, // Fallback to romaji if no English title
      titleRomaji: anime.title.romaji,
      synopsis: anime.description || "No synopsis available.",
      franchiseId: anime.franchise_id,
      anilistId: anime.id,
      coverImage: anime.coverImage.medium,
      avgScore: anime.averageScore || 0,
      episodeNumber: anime.episodes || 0,
      releaseYear: anime.startDate.year || 0,
    }));

    // Insert anime batch
    await db.insert(allAnime).values(animeRecords);

    // Collect genre and tag relations for this batch
    for (let i = 0; i < batch.length; i++) {
      const anime = batch[i];
      const animeId = currentAnimeId + i;

      // Genre relations
      for (const genreName of anime.genres) {
        const genreId = genreMap.get(genreName);
        if (genreId) {
          allGenreRelations.push({ allAnimeId: animeId, genreId });
        } else {
          console.warn(`Genre not found in DB: "${genreName}" (anime: ${anime.title.romaji})`);
        }
      }

      // Tag relations
      for (const tag of anime.tags) {
        const tagId = tagMap.get(tag.name);
        if (tagId) {
          allTagRelations.push({ animeId, tagId, rank: tag.rank });
        } else {
          console.warn(`Tag not found in DB: "${tag.name}" (anime: ${anime.title.romaji})`);
        }
      }
    }

    currentAnimeId += batch.length;
    console.log(`Batch ${batchNum + 1} anime inserted.`);
  }

  console.log(`\nAll ${animeData.length} anime inserted!`);
  console.log(`Now inserting ${allGenreRelations.length} anime-genre relations...`);

  // Insert genre relations in batches
  const genreBatches = Math.ceil(allGenreRelations.length / BATCH_SIZE);
  for (let i = 0; i < genreBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, allGenreRelations.length);
    await db.insert(animeGenres).values(allGenreRelations.slice(start, end));
    console.log(`Genre relations batch ${i + 1}/${genreBatches} inserted.`);
  }

  console.log(`Now inserting ${allTagRelations.length} anime-tag relations...`);

  // Insert tag relations in batches
  const tagBatches = Math.ceil(allTagRelations.length / BATCH_SIZE);
  for (let i = 0; i < tagBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, allTagRelations.length);
    await db.insert(animeTags).values(allTagRelations.slice(start, end));
    console.log(`Tag relations batch ${i + 1}/${tagBatches} inserted.`);
  }

  console.log("\nAnime import complete!");
  console.log(`Summary:`);
  console.log(`  - ${animeData.length} anime records`);
  console.log(`  - ${allGenreRelations.length} anime-genre relations`);
  console.log(`  - ${allTagRelations.length} anime-tag relations`);

  process.exit(0);
}

importAnime().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
