ALTER TABLE "user_rating" DROP CONSTRAINT "user_rating_user_id_unique";--> statement-breakpoint
ALTER TABLE "user_rating" DROP CONSTRAINT "user_rating_anime_id_unique";--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_user_anime_unique" UNIQUE("user_id","anime_id");