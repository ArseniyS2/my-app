ALTER TABLE "all_anime" RENAME COLUMN "title" TO "title_english";--> statement-breakpoint
ALTER TABLE "all_anime" ADD COLUMN "title_romaji" text NOT NULL;--> statement-breakpoint
ALTER TABLE "all_anime" ADD COLUMN "release_year" integer NOT NULL;