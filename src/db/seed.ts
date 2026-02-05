import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db, users } from "./index";

// Load .env.local so DATABASE_URL is available when running bun run db:seed
const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  const content = readFileSync(envLocal, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match)
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function seed() {
  const hashedPassword = await Bun.password.hash("demo1234", {
    algorithm: "argon2id",
  });

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, "demo"))
    .limit(1);

  if (existing.length > 0) {
    console.log("Seed user 'demo' already exists. Skipping.");
    process.exit(0);
  }

  await db.insert(users).values({
    username: "demo",
    email: "demo@example.com",
    hashedPassword,
    role: "user",
  });

  console.log("Seed complete. Demo user: demo / demo1234");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
