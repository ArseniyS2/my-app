"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/src/db";
import { allAnime, userRating, userRatingGenre } from "@/src/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Return IDs of every anime sharing the same franchise_id. */
async function getFranchiseAnimeIds(animeId: number): Promise<number[]> {
  const [anime] = await db
    .select({ franchiseId: allAnime.franchiseId })
    .from(allAnime)
    .where(eq(allAnime.id, animeId));
  if (!anime) return [];

  const rows = await db
    .select({ id: allAnime.id })
    .from(allAnime)
    .where(eq(allAnime.franchiseId, anime.franchiseId));
  return rows.map((r) => r.id);
}

/**
 * Find the single user_rating row that covers this franchise.
 * Because one review/score/status is shared across the franchise,
 * any anime in the franchise may hold the row.
 */
async function getFranchiseRating(animeId: number, userId: string) {
  const ids = await getFranchiseAnimeIds(animeId);
  if (ids.length === 0) return null;

  const [rating] = await db
    .select()
    .from(userRating)
    .where(and(eq(userRating.userId, userId), inArray(userRating.animeId, ids)))
    .limit(1);

  return rating ?? null;
}

/* ------------------------------------------------------------------ */
/*  Public server actions                                               */
/* ------------------------------------------------------------------ */

export async function setAnimeStatus(
  animeId: number,
  status: "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLANNING"
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await getFranchiseRating(animeId, session.user.id);

  let ratingId: number;

  if (existing) {
    /* Update status on the existing franchise-level row */
    await db
      .update(userRating)
      .set({ status })
      .where(
        and(
          eq(userRating.id, existing.id),
          eq(userRating.userId, session.user.id) // ownership check
        )
      );
    ratingId = existing.id;
  } else {
    /* Create a new rating row for this anime */
    const [row] = await db
      .insert(userRating)
      .values({
        rating: null,
        review: "",
        status,
        userId: session.user.id,
        animeId,
      })
      .returning();
    ratingId = row.id;
  }

  revalidatePath(`/dashboard/${animeId}`);
  return ratingId;
}

export async function updateReview(animeId: number, review: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await getFranchiseRating(animeId, session.user.id);
  if (!existing) throw new Error("Rating not found");

  await db
    .update(userRating)
    .set({ review })
    .where(
      and(
        eq(userRating.id, existing.id),
        eq(userRating.userId, session.user.id)
      )
    );

  revalidatePath(`/dashboard/${animeId}`);
}

export async function updateScore(animeId: number, score: number | null) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await getFranchiseRating(animeId, session.user.id);
  if (!existing) throw new Error("Rating not found");

  await db
    .update(userRating)
    .set({ rating: score !== null ? String(score) : null })
    .where(
      and(
        eq(userRating.id, existing.id),
        eq(userRating.userId, session.user.id)
      )
    );

  revalidatePath(`/dashboard/${animeId}`);
}

export async function removeFromWatchlist(animeId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await getFranchiseRating(animeId, session.user.id);
  if (!existing) throw new Error("Rating not found");

  /* Delete child rows (user_rating_genre) first to avoid FK violation */
  await db
    .delete(userRatingGenre)
    .where(eq(userRatingGenre.userRatingId, existing.id));

  await db
    .delete(userRating)
    .where(
      and(
        eq(userRating.id, existing.id),
        eq(userRating.userId, session.user.id)
      )
    );

  revalidatePath(`/dashboard/${animeId}`);
}

export async function addUserGenre(
  animeId: number,
  genreId: number,
  role: "PRIMARY" | "SECONDARY"
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await getFranchiseRating(animeId, session.user.id);
  if (!existing) throw new Error("Rating not found");

  await db
    .insert(userRatingGenre)
    .values({
      userRatingId: existing.id,
      genreId,
      role,
    })
    .onConflictDoUpdate({
      target: [userRatingGenre.userRatingId, userRatingGenre.genreId],
      set: { role },
    });

  revalidatePath(`/dashboard/${animeId}`);
}

export async function removeUserGenre(animeId: number, genreId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await getFranchiseRating(animeId, session.user.id);
  if (!existing) throw new Error("Rating not found");

  await db
    .delete(userRatingGenre)
    .where(
      and(
        eq(userRatingGenre.userRatingId, existing.id),
        eq(userRatingGenre.genreId, genreId)
      )
    );

  revalidatePath(`/dashboard/${animeId}`);
}
