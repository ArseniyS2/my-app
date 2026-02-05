CREATE TYPE "public"."genre_role" AS ENUM('PRIMARY', 'SECONDARY');--> statement-breakpoint
CREATE TABLE "all_anime" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"synopsis" text NOT NULL,
	"franchise_id" integer NOT NULL,
	"embedding" vector(1920) NOT NULL,
	"anilist_id" integer NOT NULL,
	"cover_image" text NOT NULL,
	"avg_score" integer NOT NULL,
	"episode_number" integer NOT NULL,
	CONSTRAINT "all_anime_anilist_id_unique" UNIQUE("anilist_id")
);
--> statement-breakpoint
CREATE TABLE "anime_genres" (
	"all_anime_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "anime_genres_all_anime_id_genre_id_pk" PRIMARY KEY("all_anime_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "anime_tags" (
	"rank" integer NOT NULL,
	"anime_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "anime_tags_anime_id_tag_id_pk" PRIMARY KEY("anime_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "genre" (
	"id" serial PRIMARY KEY NOT NULL,
	"genre_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_rating" (
	"id" serial PRIMARY KEY NOT NULL,
	"rating" real NOT NULL,
	"review" text NOT NULL,
	"user_id" uuid NOT NULL,
	"anime_id" integer NOT NULL,
	CONSTRAINT "user_rating_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_rating_anime_id_unique" UNIQUE("anime_id")
);
--> statement-breakpoint
CREATE TABLE "user_rating_genre" (
	"role" "genre_role" NOT NULL,
	"user_rating_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "user_rating_genre_user_rating_id_genre_id_pk" PRIMARY KEY("user_rating_id","genre_id")
);
--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_all_anime_id_all_anime_id_fk" FOREIGN KEY ("all_anime_id") REFERENCES "public"."all_anime"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_genre_id_genre_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_tags" ADD CONSTRAINT "anime_tags_anime_id_all_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."all_anime"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_tags" ADD CONSTRAINT "anime_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_anime_id_all_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."all_anime"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating_genre" ADD CONSTRAINT "user_rating_genre_user_rating_id_user_rating_id_fk" FOREIGN KEY ("user_rating_id") REFERENCES "public"."user_rating"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating_genre" ADD CONSTRAINT "user_rating_genre_genre_id_genre_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedding_hnsw_idx" ON "all_anime" USING hnsw ("embedding" vector_cosine_ops);