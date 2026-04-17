# Kizuna

**Your anime watchlist, together.**

A Next.js app for managing your anime library and getting personalized recommendations via vector similarity and reranking.
Experimential release for a new feature.

## Stack

- **Runtime & package manager:** [Bun](https://bun.sh)
- **Framework:** [Next.js](https://nextjs.org) 16 (App Router)
- **Database:** [Neon](https://neon.tech) (Postgres) with [Drizzle ORM](https://orm.drizzle.team)
- **Auth:** [NextAuth.js](https://next-auth.js.org) v4 (credentials; sessions stored in DB, validated on each request)
- **Vector search:** [pgvector](https://github.com/pgvector/pgvector) (halfvec, HNSW index)
- **Styling:** [Tailwind CSS](https://tailwindcss.com) v4
- **State:** [Zustand](https://zustand-demo.pmnd.rs) (dashboard filters, recommendation drawer and form params)

## Features

- **Auth:** Sign in with username/password; sessions stored in DB, validated on each request; view active sessions and log out everywhere from profile
- **Dashboard:** Browse anime, manage ratings and status (Completed, On hold, Dropped, Planning); filter state (genre, sort, your/library) persists when navigating to anime detail and back
- **User profile:** Edit profile picture and password; security: change password, view active sessions, log out everywhere
- **Recommendations:** Seed-based + genre/tag filters; vector similarity (K=200) then optional [Qwen3-Reranker-8B](https://deepinfra.com) rerank; see [RECOMMENDATION.md](./RECOMMENDATION.md) for the full pipeline and API

## Prerequisites

- [Bun](https://bun.sh) installed
- Neon (or any Postgres with pgvector) database
- Optional: [DeepInfra](https://deepinfra.com) API key for reranker (recommendations fall back to vector order if missing)

## Getting started

1. **Clone and install**

   ```bash
   bun install
   ```

2. **Environment variables**

   Create `.env.local` in the project root:

   ```env
   DATABASE_URL=postgresql://...   # Neon or Postgres connection string (required)
   NEXTAUTH_SECRET=...             # Random string for JWT signing (required)
   DEEPINFRA_API_KEY=...           # For recommendation reranker AND the weekly sync job (required for sync; optional for recs)
   CRON_SECRET=...                 # Random token that authenticates the Vercel Cron callback to /api/cron/sync
   ```

   For local dev, generate a secret with e.g. `openssl rand -base64 32`.

3. **Database**

   ```bash
   bun run db:generate   # Generate Drizzle migrations (if you change schema)
   bun run db:migrate    # Apply migrations (loads .env.local)
   bun run db:seed       # Create demo user
   ```

4. **Run the app**

   ```bash
   bun run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign in with **demo** / **demo1234** after seeding.

## Data import (optional)

To populate anime and recommendations you need to run import scripts in order (and have the source data):

| Script | Purpose |
|--------|--------|
| `bun run db:import-genres-tags` | Import genres and tags |
| `bun run db:import-anime` | Import anime catalog |
| `bun run db:import-cover-images` | Fetch and store cover image URLs |
| `bun run db:import-embeddings` | Import embeddings (Python; see `scripts/`) |
| `bun run db:import-user-ratings` | Import user ratings |
| `bun run db:import-watched-dates` | Import watched dates into user ratings |

See `scripts/` and `src/db/` for requirements and usage. Clear scripts: `db:clear-anime-data`, `db:clear-user-ratings`. Preprocessing: `scripts:match-ratings-to-anime` (match ratings JSON to anime IDs before import).

## Scripts

| Command | Description |
|--------|-------------|
| `bun run dev` | Start Next.js dev server |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Run migrations |
| `bun run db:push` | Push schema with Drizzle Kit |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:seed` | Seed demo user |
| `bun run db:import-watched-dates` | Import watched dates |
| `bun run scripts:match-ratings-to-anime` | Match ratings JSON to anime IDs |
| `bun run db:sync-new-anime` | Sync newly-FINISHED anime from AniList (see **Sync** section) |

## Project layout

- `app/` — Next.js App Router: pages, layouts, API routes (`/api/auth`, `/api/recommend`, `/api/user`, `/api/anime`)
- `app/dashboard/` — Dashboard UI; parallel route `@recommend` for the recommendation drawer; `dashboard-ui-store.ts`, `recommend-store.ts` (Zustand)
- `app/signin/`, `app/user/` — Sign-in and user profile
- `lib/` — Auth config (`auth.ts`), rate limiting (`rate-limit.ts`)
- `src/db/` — Drizzle schema, client, migrations runner, seed and import scripts
- `drizzle/` — SQL migrations and Drizzle Kit metadata
- `scripts/` — Python embedding import, rating-matching script
- `proxy.ts` — Route protection (dashboard, user, API) using NextAuth with DB session validation

## Sync (new-anime ingest)

Kizuna ships with a weekly sync that pulls newly-FINISHED anime from the AniList GraphQL API into the catalog.

### Pieces

| Piece | Purpose |
|-------|---------|
| `src/db/sync-new-anime.ts` | Shared core: AniList fetch, franchise-id assignment, Qwen3 embedding via DeepInfra, DB writes |
| `scripts/sync_new_anime.mjs` | Manual CLI (Bun). Reads/writes `scripts/sync_state.json` |
| `app/api/cron/sync/route.ts` | Vercel Cron handler; auth via `Authorization: Bearer $CRON_SECRET` |
| `vercel.json` | Schedules `/api/cron/sync` every Sunday at 03:00 UTC |

### Required environment variables

- `DEEPINFRA_API_KEY` — same key used by the reranker; the sync uses `Qwen/Qwen3-Embedding-8B` via the DeepInfra OpenAI-compatible embeddings endpoint.
- `CRON_SECRET` — a random token that Vercel injects on the `Authorization` header when it calls `/api/cron/sync`. Generate one with:

  ```bash
  openssl rand -base64 32
  ```

### Manual run

```bash
# First run (seed the lookback window)
bun run db:sync-new-anime -- --since 2025-01-01

# Dry run (no DB writes)
bun run db:sync-new-anime -- --dry-run

# Subsequent runs use scripts/sync_state.json automatically
bun run db:sync-new-anime
```

`scripts/sync_state.json` (git-ignored) holds `{ "lastSyncDate": "YYYY-MM-DD" }` and is rewritten on every successful non-dry-run.

### What it does

1. Fetches all `FINISHED` anime with `startDate > lastSyncDate` from AniList, paginating with a ~2100ms delay to respect the rate limit, retrying 429/5xx with backoff.
2. Filters out anime whose `anilist_id` is already in `all_anime` (idempotency).
3. Assigns `franchise_id` (Kizuna's own DB id, not AniList's):
   - Inherits from a PREQUEL/SEQUEL relative already in the DB.
   - On multi-franchise merges, picks the franchise whose root has the earliest start date (same `betterRoot` tiebreak used by the original import).
   - BFS's across the new batch so siblings in the same new cohort share an id.
   - Standalone cohorts become their own franchise rooted at the earliest-start member.
4. Tags are filtered to `rank >= 65`. Unknown genres/tags discovered in the batch are inserted into `genre` / `tags` before use.
5. Generates embeddings via DeepInfra (`Qwen/Qwen3-Embedding-8B`), truncated/normalized to `halfvec(3920)`.
6. Inserts `all_anime`, genre/tag relations, embeddings, and applies franchise-id updates to affected existing rows.

### Cron behavior

Because Vercel's serverless filesystem is ephemeral, `/api/cron/sync` does not read `sync_state.json`. It derives a conservative lookback from the max `release_year` in the DB (padded by 30 days). Re-fetched rows are filtered out by the `anilist_id` unique constraint, so overlap is safe.

## Recommendation system

Recommendations use a multi-stage pipeline: seed selection → user preference vector → pgvector similarity (K=200) → optional DeepInfra rerank → post-filtering.  
Full description, UX flow, filter behavior, and **POST /api/recommend** (and **GET /api/recommend/options**) are documented in [RECOMMENDATION.md](./RECOMMENDATION.md).

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM](https://orm.drizzle.team)
- [NextAuth.js](https://next-auth.js.org)
- [Bun](https://bun.sh/docs)
