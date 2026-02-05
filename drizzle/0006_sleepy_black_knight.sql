CREATE TYPE "public"."anime_status" AS ENUM('COMPLETED', 'ON_HOLD', 'DROPPED', 'PLANNING');--> statement-breakpoint
ALTER TABLE "user_rating" ALTER COLUMN "rating" SET DATA TYPE numeric(3, 1);--> statement-breakpoint
ALTER TABLE "user_rating" ALTER COLUMN "rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_rating" ADD COLUMN "status" "anime_status" NOT NULL;