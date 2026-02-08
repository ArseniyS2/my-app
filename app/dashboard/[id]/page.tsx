import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/src/db";
import {
  allAnime,
  userRating,
  userRatingGenre,
  genre,
  animeGenres,
  animeTags,
  tags,
  users,
} from "@/src/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import AnimeDetailContent from "./AnimeDetailContent";

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  const { id } = await params;
  const animeId = parseInt(id, 10);
  if (isNaN(animeId)) redirect("/dashboard");

  /* ---------------------------------------------------------------- */
  /*  1. Anime basic data                                              */
  /* ---------------------------------------------------------------- */

  const [anime] = await db
    .select()
    .from(allAnime)
    .where(eq(allAnime.id, animeId));

  if (!anime) redirect("/dashboard");

  /* ---------------------------------------------------------------- */
  /*  2. Franchise siblings (same franchise_id, different id)          */
  /* ---------------------------------------------------------------- */

  const allFranchise = await db
    .select({
      id: allAnime.id,
      titleEnglish: allAnime.titleEnglish,
      coverImage: allAnime.coverImage,
    })
    .from(allAnime)
    .where(eq(allAnime.franchiseId, anime.franchiseId));

  const franchiseAnime = allFranchise.filter((a) => a.id !== animeId);

  /* ---------------------------------------------------------------- */
  /*  3. Tags                                                          */
  /* ---------------------------------------------------------------- */

  const tagRows = await db
    .select({ tagName: tags.tagName })
    .from(animeTags)
    .innerJoin(tags, eq(animeTags.tagId, tags.id))
    .where(eq(animeTags.animeId, animeId))
    .orderBy(asc(animeTags.rank));

  /* ---------------------------------------------------------------- */
  /*  4. User rating (franchise-level: any anime in franchise)         */
  /* ---------------------------------------------------------------- */

  const franchiseIds = allFranchise.map((a) => a.id);

  const [userRatingRow] = await db
    .select()
    .from(userRating)
    .where(
      and(
        eq(userRating.userId, session.user.id),
        inArray(userRating.animeId, franchiseIds)
      )
    )
    .limit(1);

  /* ---------------------------------------------------------------- */
  /*  5. Genres                                                        */
  /*     – watchlist → user_rating_genre (PRIMARY in bold)             */
  /*     – otherwise → anime_genres                                    */
  /* ---------------------------------------------------------------- */

  /* All available genres (for the genre-picker dropdown) */
  const allGenresRows = await db.select().from(genre);
  const allGenres = allGenresRows.map((g) => ({ id: g.id, name: g.genreName }));

  /* Always fetch the default anime_genres (AniList data) */
  const defaultGenreRows = await db
    .select({ genreId: animeGenres.genreId, genreName: genre.genreName })
    .from(animeGenres)
    .innerJoin(genre, eq(animeGenres.genreId, genre.id))
    .where(eq(animeGenres.allAnimeId, animeId));

  const defaultGenres = defaultGenreRows.map((g) => ({
    id: g.genreId,
    name: g.genreName,
    role: null as "PRIMARY" | "SECONDARY" | null,
  }));

  /* Active genres: user_rating_genre when in watchlist, anime_genres otherwise */
  let genres: { id: number; name: string; role: "PRIMARY" | "SECONDARY" | null }[];

  if (userRatingRow) {
    const rows = await db
      .select({
        genreId: userRatingGenre.genreId,
        genreName: genre.genreName,
        role: userRatingGenre.role,
      })
      .from(userRatingGenre)
      .innerJoin(genre, eq(userRatingGenre.genreId, genre.id))
      .where(eq(userRatingGenre.userRatingId, userRatingRow.id));

    genres = rows
      .map((g) => ({ id: g.genreId, name: g.genreName, role: g.role }))
      .sort((a, b) =>
        a.role === "PRIMARY" && b.role !== "PRIMARY"
          ? -1
          : a.role !== "PRIMARY" && b.role === "PRIMARY"
            ? 1
            : 0
      );
  } else {
    genres = defaultGenres;
  }

  /* ---------------------------------------------------------------- */
  /*  6. User picture                                                  */
  /* ---------------------------------------------------------------- */

  const [userRow] = await db
    .select({ userPicture: users.userPicture })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  /* ---------------------------------------------------------------- */
  /*  Serialise & render                                               */
  /* ---------------------------------------------------------------- */

  const animeData = {
    id: anime.id,
    titleEnglish: anime.titleEnglish,
    titleRomaji: anime.titleRomaji,
    synopsis: anime.synopsis,
    coverImage: anime.coverImage,
    coverImageLarge: anime.coverImageLarge,
    avgScore: anime.avgScore,
    episodeNumber: anime.episodeNumber,
    releaseYear: anime.releaseYear,
    franchiseId: anime.franchiseId,
  };

  const userRatingData = userRatingRow
    ? {
        id: userRatingRow.id,
        rating: userRatingRow.rating
          ? parseFloat(String(userRatingRow.rating))
          : null,
        review: userRatingRow.review,
        status: userRatingRow.status,
      }
    : null;

  return (
    <AnimeDetailContent
      key={anime.id}
      anime={animeData}
      userRating={userRatingData}
      franchise={franchiseAnime}
      tags={tagRows.map((t) => t.tagName)}
      genres={genres}
      defaultGenres={defaultGenres}
      allGenres={allGenres}
      username={session.user.username}
      userPicture={userRow?.userPicture ?? null}
    />
  );
}
