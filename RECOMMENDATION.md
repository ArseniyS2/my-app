# Recommendation System

## Overview

The recommendation system suggests anime based on the user's tastes via a multi-stage pipeline: seed selection → user vector construction → vector similarity retrieval → reranking → post-filtering.

## UX Flow

1. Click **"Recommend me"** button in the dashboard header.
2. A right-side drawer opens (via App Router Parallel Routes + Intercepting Routes).
3. Configure seeds, filters, and optional free text description.
4. Click **"Generate Recommendations"** — results appear in the main dashboard area.
5. Use **"Edit request"** to reopen the drawer, or **"Back to library"** to return to the normal list.

## Pipeline Stages

### A) Seed Selection

- **Default:** "Use my top-rated" toggle ON — fetches user ratings >= 8.5, limited to top 20 by rating.
- **Manual:** Toggle OFF, search and pick specific anime as seeds.

### B) User Preference Vector

- Fetches `halfvec(3920)` embeddings for each seed anime from `anime_embeddings`.
- Computes a **weighted average** of seed embeddings, weighted by the user's rating for each seed (default weight 7.0 if no rating).
- The resulting vector is **L2-normalized** to unit length for cosine similarity search.

### C) Vector Similarity Retrieval (K = 200)

- Uses `pgvector` cosine distance operator (`<=>`) on `halfvec_cosine_ops` HNSW index.
- Retrieves top **K = 200** candidates, applying filters **early** in SQL:
  - **Exclude IDs:** seed anime + all watched anime (if `excludeWatched` is ON).
  - **Exclude genres/tags:** candidates with any excluded genre/tag are removed via subquery.
  - **Include genres/tags:** candidates must have **at least one** matching genre/tag from the include set.
- The "at least one" include behavior means: if you include "Action" and "Comedy", candidates that have either genre will pass.

### D) Reranking (Qwen3-Reranker-8B via DeepInfra)

- Constructs a **query string** from:
  - Seed anime titles (up to 10)
  - Included genre preferences
  - User's free text description (if provided)
- For each candidate, constructs a **document string** from:
  - Title, genres, tags (top 10), and a truncated synopsis (200 chars).
- Passes an instruction: "Rank these anime by relevance to the user's stated preferences and seed anime."
- Calls DeepInfra's `Qwen/Qwen3-Reranker-8B` reranker API, which returns relevance scores.
- Candidates are re-sorted by reranker score (descending).
- Falls back to vector similarity order if the reranker API call fails.

### E) Post-Processing

- Final pass ensures no excluded genres/tags slipped through (defense in depth).
- Re-validates include genre/tag filters.
- Returns top `limit` results (default 15).

## Filter Behavior

| Filter | Behavior |
|--------|----------|
| Include Genres | Candidate must have **at least one** genre from the set |
| Exclude Genres | Candidate must have **none** of the genres in the set |
| Include Tags | Candidate must have **at least one** tag from the set |
| Exclude Tags | Candidate must have **none** of the tags in the set |
| Exclude Watched | Removes all anime the user has in their `user_rating` table |

## Default Thresholds

| Parameter | Default Value |
|-----------|---------------|
| Top-rated threshold | 8.5 |
| Max seeds | 20 |
| Candidate K | 200 |
| Result limit | 15 |
| Default seed weight (no rating) | 7.0 |

## API

### POST /api/recommend

**Request body:**
```json
{
  "seedAnimeIds": [1, 2, 3],
  "useTopRated": true,
  "includeGenres": ["Action", "Drama"],
  "excludeGenres": ["Romance"],
  "includeTags": ["Dark Fantasy"],
  "excludeTags": ["Ecchi"],
  "excludeWatched": true,
  "freeText": "dark tone, complex characters",
  "limit": 15
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "id": 42,
      "title": "Anime Title",
      "coverUrl": "https://...",
      "score": 0.85,
      "genres": ["Action", "Drama"],
      "tags": ["Dark Fantasy", "Revenge"]
    }
  ]
}
```

### GET /api/recommend/options

Returns available genres and tags for the filter autocomplete.

## Architecture

- **Parallel Route:** `app/dashboard/@recommend/` slot renders alongside `children`
- **Intercepting Route:** `app/dashboard/@recommend/(.)recommend/page.tsx` intercepts `/dashboard/recommend`
- **State:** Zustand store (`recommend-store.ts`) holds mode (library/recommendations) and results
- **Drawer:** `RecommendDrawer.tsx` — client component with seed picker, filters, and generate button
