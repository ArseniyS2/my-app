import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { db, genre, tags } from "./index";

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

interface GenreJson {
  name: string;
}

interface TagJson {
  name: string;
}

async function importGenresAndTags() {
  console.log("Starting genres and tags import...");

  // Load JSON files
  const genresPath = join(process.cwd(), "raw_info", "genres.json");
  const tagsPath = join(process.cwd(), "raw_info", "tags.json");

  const genresData: GenreJson[] = JSON.parse(readFileSync(genresPath, "utf-8"));
  const tagsData: TagJson[] = JSON.parse(readFileSync(tagsPath, "utf-8"));

  console.log(`Found ${genresData.length} genres and ${tagsData.length} tags`);

  // Import genres
  console.log("Importing genres...");
  const genreValues = genresData.map((g) => ({
    genreName: g.name,
  }));

  await db.insert(genre).values(genreValues);
  console.log(`Successfully imported ${genreValues.length} genres`);

  // Import tags
  console.log("Importing tags...");
  const tagValues = tagsData.map((t) => ({
    tagName: t.name,
  }));

  await db.insert(tags).values(tagValues);
  console.log(`Successfully imported ${tagValues.length} tags`);

  console.log("Genres and tags import complete!");
  process.exit(0);
}

importGenresAndTags().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
