import {
  halfvec,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// User table already exists – do not duplicate
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  hashedPassword: text("hashed_password"),
  role: text("role").notNull().default("user"),
  userPicture: text("user_picture"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Session table – tracks active user sessions for multi-device awareness
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Role for user_rating_genre: PRIMARY or SECONDARY
export const genreRoleEnum = pgEnum("genre_role", ["PRIMARY", "SECONDARY"]);

export const animeStatusEnum = pgEnum("anime_status", ["COMPLETED", "ON_HOLD", "DROPPED", "PLANNING"]);

export const allAnime = pgTable("all_anime", {
  id: serial("id").primaryKey(),
  titleEnglish: text("title_english").notNull(),
  titleRomaji: text("title_romaji").notNull(),
  synopsis: text("synopsis").notNull(),
  franchiseId: integer("franchise_id").notNull(),
  anilistId: integer("anilist_id").notNull().unique(),
  coverImage: text("cover_image").notNull(),
  coverImageLarge: text("cover_image_large").notNull().default(""),
  avgScore: integer("avg_score").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  releaseYear: integer("release_year").notNull(),
});

export const animeEmbeddings = pgTable(
  "anime_embeddings",
  {
    id: integer("id")
      .primaryKey()
      .references(() => allAnime.id),
    embedding: halfvec("embedding", { dimensions: 3920 }).notNull(),
  },
  (table) => [
    index("anime_embeddings_hnsw_idx").using(
      "hnsw",
      table.embedding.op("halfvec_cosine_ops")
    ),
  ]
);

export const userRating = pgTable(
  "user_rating",
  {
    id: serial("id").primaryKey(),
    rating: numeric("rating", { precision: 3, scale: 1 }), // Nullable: no rating for DROPPED/PLANNING
    review: text("review").notNull(),
    status: animeStatusEnum("status").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    animeId: integer("anime_id")
      .notNull()
      .references(() => allAnime.id),
  },
  (table) => [
    unique("user_rating_user_anime_unique").on(table.userId, table.animeId),
  ]
);

export const genre = pgTable("genre", {
  id: serial("id").primaryKey(),
  genreName: text("genre_name").notNull(),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  tagName: text("tag_name").notNull(),
});

export const animeTags = pgTable(
  "anime_tags",
  {
    rank: integer("rank").notNull(),
    animeId: integer("anime_id")
      .notNull()
      .references(() => allAnime.id),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.animeId, table.tagId] }),
  ]
);

export const userRatingGenre = pgTable(
  "user_rating_genre",
  {
    role: genreRoleEnum("role").notNull(),
    userRatingId: integer("user_rating_id")
      .notNull()
      .references(() => userRating.id),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genre.id),
  },
  (table) => [
    primaryKey({ columns: [table.userRatingId, table.genreId] }),
  ]
);

export const animeGenres = pgTable(
  "anime_genres",
  {
    allAnimeId: integer("all_anime_id")
      .notNull()
      .references(() => allAnime.id),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genre.id),
  },
  (table) => [
    primaryKey({ columns: [table.allAnimeId, table.genreId] }),
  ]
);
