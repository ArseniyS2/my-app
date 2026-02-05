DROP INDEX "anime_embeddings_hnsw_idx";--> statement-breakpoint
ALTER TABLE "anime_embeddings" ALTER COLUMN "embedding" SET DATA TYPE halfvec(3920);--> statement-breakpoint
CREATE INDEX "anime_embeddings_hnsw_idx" ON "anime_embeddings" USING hnsw ("embedding" halfvec_cosine_ops);