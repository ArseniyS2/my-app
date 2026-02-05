import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { migrate } from "drizzle-orm/neon-http/migrator";
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

async function run() {
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  console.log("Migrations complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
