#!/usr/bin/env bun
/**
 * scripts/sync_new_anime.mjs
 *
 * CLI entrypoint for syncing newly-finished anime from AniList into the Kizuna DB.
 *
 * Usage:
 *   bun run scripts/sync_new_anime.mjs              # uses scripts/sync_state.json
 *   bun run scripts/sync_new_anime.mjs --since 2025-01-01
 *   bun run scripts/sync_new_anime.mjs --dry-run
 *
 * On success, writes today's date (UTC) back to scripts/sync_state.json as `lastSyncDate`.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "sync_state.json");
const PROJECT_ROOT = join(__dirname, "..");

// Load .env.local so DATABASE_URL / DEEPINFRA_API_KEY are available
const envLocal = join(PROJECT_ROOT, ".env.local");
if (existsSync(envLocal)) {
  const content = readFileSync(envLocal, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

/* ------------------------------------------------------------------ */
/*  CLI arg parsing                                                    */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") out.since = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else console.warn(`Unknown arg: ${a}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage: bun run scripts/sync_new_anime.mjs [options]

Options:
  --since YYYY-MM-DD   Override lastSyncDate (used if sync_state.json is absent)
  --dry-run            Log what would be done without writing to DB
  -h, --help           Show this help`);
}

/* ------------------------------------------------------------------ */
/*  State file helpers                                                 */
/* ------------------------------------------------------------------ */

function readState() {
  if (!existsSync(STATE_FILE)) return null;
  const raw = readFileSync(STATE_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${STATE_FILE}: ${err.message}`);
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function validateIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const state = readState();
  let lastSyncDate = state?.lastSyncDate;
  if (!lastSyncDate) {
    if (!args.since) {
      console.error(
        `ERROR: ${STATE_FILE} does not exist and --since flag was not provided.\n` +
          `On first run, provide --since YYYY-MM-DD to seed the sync window.`,
      );
      process.exit(1);
    }
    if (!validateIsoDate(args.since)) {
      console.error(`ERROR: --since must be YYYY-MM-DD (got "${args.since}")`);
      process.exit(1);
    }
    lastSyncDate = args.since;
  }

  if (!validateIsoDate(lastSyncDate)) {
    console.error(`ERROR: lastSyncDate must be YYYY-MM-DD (got "${lastSyncDate}")`);
    process.exit(1);
  }

  console.log(`== Kizuna sync_new_anime ==`);
  console.log(`lastSyncDate : ${lastSyncDate}`);
  console.log(`dry-run      : ${args.dryRun}`);
  console.log("");

  // Defer importing the sync core until after --help is handled and env vars
  // are loaded, since importing drizzle eagerly requires DATABASE_URL.
  const { runSync } = await import("../src/db/sync-new-anime.ts");

  const result = await runSync({
    lastSyncDate,
    dryRun: args.dryRun,
  });

  console.log("\n== Result ==");
  console.log(JSON.stringify(result, null, 2));

  if (!args.dryRun) {
    const newState = { lastSyncDate: todayIsoDate() };
    writeState(newState);
    console.log(`\nWrote ${STATE_FILE}: ${JSON.stringify(newState)}`);
  } else {
    console.log("\nDry run: sync_state.json not updated.");
  }
}

main().catch((err) => {
  console.error("Sync failed:", err?.stack || err);
  process.exit(1);
});
