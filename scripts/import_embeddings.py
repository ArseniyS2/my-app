#!/usr/bin/env python3
"""
Import anime embeddings from NumPy files into Neon Postgres.

Loads:
- raw_info/qwen3_8b_dim3920.npy (float16, shape [N, 3920])
- raw_info/qwen3_8b_dim3920_ids.npy (int32, shape [N]) - these are anilist_ids

Then batch inserts into anime_embeddings table, mapping anilist_id -> all_anime.id
"""

import os
import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(".env.local")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

BATCH_SIZE = 100


def load_npy_files():
    """Load embeddings and ids from .npy files."""
    vectors_path = "raw_info/qwen3_8b_dim3920.npy"
    ids_path = "raw_info/qwen3_8b_dim3920_ids.npy"

    print(f"Loading vectors from {vectors_path}...")
    vectors = np.load(vectors_path)
    print(f"  Shape: {vectors.shape}, dtype: {vectors.dtype}")

    print(f"Loading ids from {ids_path}...")
    ids = np.load(ids_path)
    print(f"  Shape: {ids.shape}, dtype: {ids.dtype}")

    assert len(vectors) == len(ids), "Vectors and ids must have same length"
    print(f"Loaded {len(vectors)} embeddings")

    return vectors, ids


def get_anilist_to_id_mapping(conn):
    """Fetch mapping of anilist_id -> id from all_anime table."""
    print("Fetching anilist_id -> id mapping from all_anime...")
    with conn.cursor() as cur:
        cur.execute("SELECT id, anilist_id FROM all_anime")
        rows = cur.fetchall()

    mapping = {anilist_id: id for id, anilist_id in rows}
    print(f"  Found {len(mapping)} anime in database")
    return mapping


def format_halfvec(embedding):
    """Format embedding as halfvec string for pgvector."""
    # Convert to list and format as pgvector expects
    values = embedding.astype(np.float32).tolist()
    return "[" + ",".join(str(v) for v in values) + "]"


def import_embeddings(conn, vectors, anilist_ids, anilist_to_id):
    """Import embeddings into anime_embeddings table using batching."""
    print("Preparing embeddings for import...")

    # Build list of (id, embedding) tuples
    data = []
    skipped = 0
    for i, anilist_id in enumerate(anilist_ids):
        anilist_id = int(anilist_id)
        if anilist_id not in anilist_to_id:
            skipped += 1
            continue

        anime_id = anilist_to_id[anilist_id]
        embedding = vectors[i]
        data.append((anime_id, format_halfvec(embedding)))

    print(f"  Prepared {len(data)} embeddings ({skipped} skipped - not in database)")

    if not data:
        print("No embeddings to import!")
        return

    # Batch insert using upsert
    print(f"Inserting embeddings in batches of {BATCH_SIZE}...")
    with conn.cursor() as cur:
        # Clear existing embeddings first (optional - comment out if you want upsert only)
        # cur.execute("TRUNCATE anime_embeddings")

        total_inserted = 0
        for i in range(0, len(data), BATCH_SIZE):
            batch = data[i : i + BATCH_SIZE]

            # Use INSERT ... ON CONFLICT for upsert
            execute_values(
                cur,
                """
                INSERT INTO anime_embeddings (id, embedding)
                VALUES %s
                ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding
                """,
                batch,
                template="(%s, %s::halfvec)",
            )

            total_inserted += len(batch)
            if total_inserted % 1000 == 0 or total_inserted == len(data):
                print(f"  Progress: {total_inserted}/{len(data)}")

        conn.commit()
        print(f"Successfully imported {total_inserted} embeddings!")


def main():
    # Load NumPy files
    vectors, anilist_ids = load_npy_files()

    # Connect to database
    print(f"Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)

    try:
        # Get anilist_id -> id mapping
        anilist_to_id = get_anilist_to_id_mapping(conn)

        # Import embeddings
        import_embeddings(conn, vectors, anilist_ids, anilist_to_id)

    finally:
        conn.close()
        print("Database connection closed.")


if __name__ == "__main__":
    main()
