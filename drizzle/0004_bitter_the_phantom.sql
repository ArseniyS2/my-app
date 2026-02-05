CREATE TABLE "anime_embeddings" (
	"id" integer PRIMARY KEY NOT NULL,
	"embedding" vector(1920) NOT NULL
);
--> statement-breakpoint
DROP INDEX "embedding_hnsw_idx";--> statement-breakpoint
ALTER TABLE "anime_embeddings" ADD CONSTRAINT "anime_embeddings_id_all_anime_id_fk" FOREIGN KEY ("id") REFERENCES "public"."all_anime"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_embeddings_hnsw_idx" ON "anime_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "all_anime" DROP COLUMN "embedding";