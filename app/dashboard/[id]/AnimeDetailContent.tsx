"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SignOutButton from "../SignOutButton";
import {
  setAnimeStatus,
  updateReview,
  updateScore,
  removeFromWatchlist,
  addUserGenre,
  removeUserGenre,
} from "./actions";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface AnimeData {
  id: number;
  titleEnglish: string;
  titleRomaji: string;
  synopsis: string;
  coverImage: string;
  coverImageLarge: string;
  avgScore: number;
  episodeNumber: number;
  releaseYear: number;
  franchiseId: number;
}

interface AvailableGenre {
  id: number;
  name: string;
}

interface UserRatingData {
  id: number;
  rating: number | null;
  review: string;
  status: string;
}

interface FranchiseAnime {
  id: number;
  titleEnglish: string;
  coverImage: string;
}

interface GenreInfo {
  id: number;
  name: string;
  role: "PRIMARY" | "SECONDARY" | null;
}

/* ------------------------------------------------------------------ */
/*  Status colour mapping                                               */
/* ------------------------------------------------------------------ */

type StatusKey = "COMPLETED" | "DROPPED" | "PLANNING" | "ON_HOLD" | "WATCHING";

const STATUS_STYLES: Record<StatusKey, { bg: string; text: string; border: string; dropdownBg: string }> = {
  WATCHING: {
    bg: "bg-[#132D1E]",
    text: "text-[#4ADE80]",
    border: "border-[#1E4A30]",
    dropdownBg: "hover:bg-[#132D1E]/60",
  },
  COMPLETED: {
    bg: "bg-[#132F3D]",
    text: "text-[#4ABED8]",
    border: "border-[#1E4A5A]",
    dropdownBg: "hover:bg-[#132F3D]/60",
  },
  DROPPED: {
    bg: "bg-[#3A1820]",
    text: "text-[#E06B7A]",
    border: "border-[#5A2832]",
    dropdownBg: "hover:bg-[#3A1820]/60",
  },
  PLANNING: {
    bg: "bg-[#241A3A]",
    text: "text-[#A78BFA]",
    border: "border-[#36285A]",
    dropdownBg: "hover:bg-[#241A3A]/60",
  },
  ON_HOLD: {
    bg: "bg-[#3A1A2E]",
    text: "text-[#E88FC4]",
    border: "border-[#5A2A4A]",
    dropdownBg: "hover:bg-[#3A1A2E]/60",
  },
};

const STATUS_LABELS: Record<StatusKey, string> = {
  WATCHING: "Watching",
  COMPLETED: "Completed",
  DROPPED: "Dropped",
  PLANNING: "Planning",
  ON_HOLD: "On Hold",
};

const ALL_STATUSES: StatusKey[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLANNING"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatScore(score: number): string {
  return score % 1 === 0 ? `${score}/10` : `${score.toFixed(1)}/10`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function AnimeDetailContent({
  anime,
  userRating: initialRating,
  franchise,
  tags,
  genres,
  defaultGenres,
  allGenres,
  username,
  userPicture,
}: {
  anime: AnimeData;
  userRating: UserRatingData | null;
  franchise: FranchiseAnime[];
  tags: string[];
  genres: GenreInfo[];
  defaultGenres: GenreInfo[];
  allGenres: AvailableGenre[];
  username: string;
  userPicture: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /* --- local state (optimistic UI) --- */
  const [currentRating, setCurrentRating] = useState(initialRating);
  const [currentGenres, setCurrentGenres] = useState(genres);
  const [statusOpen, setStatusOpen] = useState(false);
  const [genrePickerOpen, setGenrePickerOpen] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(initialRating?.review ?? "");
  const [scoreEditing, setScoreEditing] = useState(false);
  const [scoreDraft, setScoreDraft] = useState(
    initialRating?.rating?.toString() ?? ""
  );

  /* --- similar anime (fetched asynchronously) --- */
  const [similarAnime, setSimilarAnime] = useState<
    { id: number; titleEnglish: string; coverImage: string }[]
  >([]);
  const [similarLoading, setSimilarLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/anime/similar?id=${anime.id}&franchiseId=${anime.franchiseId}`
    )
      .then((res) => (res.ok ? res.json() : { similar: [] }))
      .then((data) => {
        if (!cancelled) setSimilarAnime(data.similar ?? []);
      })
      .catch(() => {
        if (!cancelled) setSimilarAnime([]);
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anime.id, anime.franchiseId]);

  /* sanitise HTML synopsis to prevent XSS */
  const sanitizedSynopsis = useMemo(
    () =>
      DOMPurify.sanitize(anime.synopsis, {
        ALLOWED_TAGS: ["br", "i", "b", "em", "strong", "a", "p", "span"],
        ALLOWED_ATTR: ["href", "target", "rel"],
      }),
    [anime.synopsis]
  );

  const statusRef = useRef<HTMLDivElement>(null);
  const scoreInputRef = useRef<HTMLInputElement>(null);
  const genrePickerRef = useRef<HTMLDivElement>(null);

  /* close status dropdown on outside click */
  useEffect(() => {
    if (!statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusOpen]);

  /* close genre picker on outside click */
  useEffect(() => {
    if (!genrePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        genrePickerRef.current &&
        !genrePickerRef.current.contains(e.target as Node)
      ) {
        setGenrePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [genrePickerOpen]);

  /* focus score input when editing */
  useEffect(() => {
    if (scoreEditing && scoreInputRef.current) {
      scoreInputRef.current.focus();
      scoreInputRef.current.select();
    }
  }, [scoreEditing]);

  /* ------ handlers ------ */

  const handleStatusChange = (status: StatusKey) => {
    setStatusOpen(false);
    const wasNew = !currentRating;
    startTransition(async () => {
      const ratingId = await setAnimeStatus(anime.id, status);
      setCurrentRating((prev) =>
        prev
          ? { ...prev, status }
          : { id: ratingId, rating: null, review: "", status }
      );
      /* When first adding to watchlist or switching to PLANNING, show default genres */
      if (wasNew || status === "PLANNING") setCurrentGenres(defaultGenres);
      router.refresh();
    });
  };

  const handleSaveReview = () => {
    startTransition(async () => {
      await updateReview(anime.id, reviewDraft);
      setCurrentRating((prev) =>
        prev ? { ...prev, review: reviewDraft } : prev
      );
      setReviewEditing(false);
      router.refresh();
    });
  };

  const handleSaveScore = () => {
    const parsed = parseFloat(scoreDraft);
    const score = isNaN(parsed)
      ? null
      : Math.round(Math.min(10, Math.max(0, parsed)) * 10) / 10;

    setScoreEditing(false);
    startTransition(async () => {
      await updateScore(anime.id, score);
      setCurrentRating((prev) => (prev ? { ...prev, rating: score } : prev));
      setScoreDraft(score?.toString() ?? "");
      router.refresh();
    });
  };

  const handleRemove = () => {
    setStatusOpen(false);
    startTransition(async () => {
      await removeFromWatchlist(anime.id);
      setCurrentRating(null);
      setCurrentGenres(defaultGenres); // revert to AniList genres
      setReviewDraft("");
      setScoreDraft("");
      router.refresh();
    });
  };

  const handleAddGenre = (genreId: number, role: "PRIMARY" | "SECONDARY") => {
    const found = allGenres.find((g) => g.id === genreId);
    if (!found) return;
    setGenrePickerOpen(false);

    /* optimistic update */
    setCurrentGenres((prev) => {
      const without = prev.filter((g) => g.id !== genreId);
      const entry: GenreInfo = { id: genreId, name: found.name, role };
      return [...without, entry].sort((a, b) =>
        a.role === "PRIMARY" && b.role !== "PRIMARY"
          ? -1
          : a.role !== "PRIMARY" && b.role === "PRIMARY"
            ? 1
            : 0
      );
    });

    startTransition(async () => {
      await addUserGenre(anime.id, genreId, role);
      router.refresh();
    });
  };

  const handleRemoveGenre = (genreId: number) => {
    setCurrentGenres((prev) => prev.filter((g) => g.id !== genreId));
    startTransition(async () => {
      await removeUserGenre(anime.id, genreId);
      router.refresh();
    });
  };

  /* genres available to add (not yet assigned) */
  const assignedGenreIds = new Set(currentGenres.map((g) => g.id));
  const unassignedGenres = allGenres.filter((g) => !assignedGenreIds.has(g.id));

  /* ------ derived ------ */
  const statusKey = currentRating?.status as StatusKey | undefined;
  const statusStyle = statusKey ? STATUS_STYLES[statusKey] : null;
  const isPlanning = statusKey === "PLANNING";

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-[#0D0B14] text-[#E8E0F0]">
      {/* ---- header ---- */}
      <header className="sticky top-0 z-30 border-b border-[#2A2440] bg-[#13111C]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight"
          >
            Kizuna
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/user" className="flex items-center gap-2 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userPicture || "/user_picture.png"}
                alt={username}
                className="h-8 w-8 rounded-full border border-[#2A2440] object-cover transition-all group-hover:border-[#E064D6]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/user_picture.png";
                }}
              />
              <span className="hidden sm:inline text-sm text-[#8B7FA0] transition-colors group-hover:text-[#E064D6]">
                {username}
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-[#8B7FA0] transition-colors hover:text-[#E8E0F0]"
        >
          &larr; Back to dashboard
        </Link>

        {/* ---- responsive grid ---- */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr_280px] gap-6 lg:gap-8">
          {/* ============ LEFT: cover + status ============ */}
          <div className="flex flex-col items-center gap-4 mx-auto md:mx-0">
            {/* cover (use large image when available) */}
            <div className="relative h-[260px] w-[180px] overflow-hidden rounded-xl bg-[#2A2440] shadow-lg">
              <Image
                src={anime.coverImageLarge || anime.coverImage}
                alt={anime.titleEnglish}
                fill
                sizes="180px"
                className="object-cover"
                priority
              />
            </div>

            {/* status / add-to-watchlist button */}
            <div ref={statusRef} className="relative w-[180px]">
              {currentRating ? (
                <button
                  onClick={() => setStatusOpen((o) => !o)}
                  disabled={isPending}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${statusStyle!.bg} ${statusStyle!.text} ${statusStyle!.border}`}
                >
                  {STATUS_LABELS[statusKey!]}
                  <svg
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${statusOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => setStatusOpen((o) => !o)}
                  disabled={isPending}
                  className="w-full rounded-lg bg-[#E064D6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_14px_rgba(224,100,214,0.35)] transition-all hover:bg-[#C850C0] hover:shadow-[0_0_20px_rgba(224,100,214,0.5)] disabled:opacity-50"
                >
                  Add to watchlist
                </button>
              )}

              {/* dropdown */}
              {statusOpen && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-[#2A2440] bg-[#1C1830] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  {ALL_STATUSES.map((s) => {
                    const sc = STATUS_STYLES[s];
                    const active = currentRating?.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={`block w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${sc.text} ${active ? sc.bg : sc.dropdownBg}`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    );
                  })}

                  {currentRating && (
                    <>
                      <div className="my-1 border-t border-[#2A2440]" />
                      <button
                        onClick={handleRemove}
                        className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[#6B6080] transition-colors hover:bg-[#28223E] hover:text-[#E06B7A]"
                      >
                        Remove from watchlist
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ============ CENTER: title, synopsis, review, franchise ============ */}
          <div className="min-w-0">
            {/* title + score */}
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                {anime.titleEnglish}
              </h1>

              {currentRating && !isPlanning && (
                <>
                  {scoreEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={scoreInputRef}
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={scoreDraft}
                        onChange={(e) => setScoreDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveScore();
                          if (e.key === "Escape") {
                            setScoreEditing(false);
                            setScoreDraft(
                              currentRating.rating?.toString() ?? ""
                            );
                          }
                        }}
                        onBlur={handleSaveScore}
                        className="w-16 rounded border border-[#2A2440] bg-[#1A1625] px-2 py-0.5 text-xl font-bold text-[#E8E0F0] outline-none focus:border-[#E064D6] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-xl font-bold text-[#6B6080]">
                        /10
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setScoreDraft(currentRating.rating?.toString() ?? "");
                        setScoreEditing(true);
                      }}
                      className="whitespace-nowrap text-xl font-bold text-[#8B7FA0] transition-colors hover:text-[#E064D6]"
                      title="Click to edit score"
                    >
                      {currentRating.rating !== null
                        ? formatScore(currentRating.rating)
                        : "— /10"}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* synopsis (may contain <br>, <i>, etc. from AniList — sanitised) */}
            <div
              className="mt-4 leading-relaxed text-[#B8AEC8] [&_i]:italic [&_b]:font-semibold [&_a]:text-[#E064D6] [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizedSynopsis }}
            />

            {/* ---- review section (only when in watchlist and not PLANNING) ---- */}
            {currentRating && !isPlanning && (
              <div className="mt-6">
                {/* show existing review */}
                {currentRating.review && !reviewEditing && (
                  <>
                    <h3 className="text-lg font-semibold">Review</h3>
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed text-[#B8AEC8]">
                      {currentRating.review}
                    </p>
                  </>
                )}

                {/* review editor */}
                {reviewEditing ? (
                  <div className="mt-2">
                    <h3 className="mb-2 text-lg font-semibold">
                      {currentRating.review ? "Update review" : "Add a review"}
                    </h3>
                    <textarea
                      value={reviewDraft}
                      onChange={(e) => setReviewDraft(e.target.value)}
                      rows={5}
                      className="w-full rounded-lg border border-[#2A2440] bg-[#1A1625] p-3 text-sm leading-relaxed text-[#E8E0F0] placeholder-[#6B6080] outline-none transition-colors focus:border-[#E064D6]"
                      placeholder="Write your review…"
                    />
                    <div className="mt-3 flex gap-3">
                      <button
                        onClick={handleSaveReview}
                        disabled={isPending}
                        className="rounded-lg bg-[#E064D6] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[#C850C0] disabled:opacity-50"
                      >
                        {isPending ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setReviewEditing(false);
                          setReviewDraft(currentRating.review);
                        }}
                        className="rounded-lg border border-[#2A2440] px-5 py-2 text-sm text-[#8B7FA0] transition-colors hover:border-[#3D3560] hover:text-[#E8E0F0]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setReviewDraft(currentRating.review);
                      setReviewEditing(true);
                    }}
                    className="mt-3 rounded-lg border border-[#2A2440] bg-[#1A1625] px-5 py-2 text-sm font-medium text-[#A78BFA] transition-all hover:border-[#36285A] hover:bg-[#241E3A] hover:text-[#C4B5FD]"
                  >
                    {currentRating.review ? "Change" : "Add a review"}
                  </button>
                )}
              </div>
            )}

          </div>

          {/* ============ RIGHT: info sidebar ============ */}
          <div className="h-fit rounded-xl border border-[#2A2440] bg-[#1A1625] p-5 md:col-span-2 lg:col-span-1 lg:row-start-1 lg:col-start-3">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#E064D6]">
                  Title in Romaji:
                </h4>
                <p className="mt-1 text-sm text-[#B8AEC8]">
                  {anime.titleRomaji}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-[#E064D6]">
                  Episode number
                </h4>
                <p className="mt-1 text-sm text-[#B8AEC8]">
                  {anime.episodeNumber}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-[#E064D6]">
                  Release year
                </h4>
                <p className="mt-1 text-sm text-[#B8AEC8]">
                  {anime.releaseYear}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-[#E064D6]">
                  Average Score
                </h4>
                <p className="mt-1 text-sm text-[#B8AEC8]">{anime.avgScore}</p>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-[#E064D6]">Genres</h4>
                  {/* "+" button – only when anime is in the watchlist and not PLANNING */}
                  {currentRating && !isPlanning && (
                    <div ref={genrePickerRef} className="relative">
                      <button
                        onClick={() => setGenrePickerOpen((o) => !o)}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-[#28223E] text-xs text-[#8B7FA0] transition-colors hover:bg-[#36285A] hover:text-[#E064D6]"
                        title="Add genre"
                      >
                        +
                      </button>

                      {genrePickerOpen && unassignedGenres.length > 0 && (
                        <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-56 overflow-y-auto rounded-lg border border-[#2A2440] bg-[#1C1830] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                          {unassignedGenres.map((g) => (
                            <div
                              key={g.id}
                              className="flex items-center justify-between px-3 py-1.5 text-sm text-[#C8BDD9] hover:bg-[#28223E]"
                            >
                              <span className="truncate">{g.name}</span>
                              <div className="ml-2 flex gap-1">
                                <button
                                  onClick={() =>
                                    handleAddGenre(g.id, "PRIMARY")
                                  }
                                  className="rounded bg-[#E064D6]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#E064D6] transition-colors hover:bg-[#E064D6]/40"
                                  title="Add as Primary"
                                >
                                  P
                                </button>
                                <button
                                  onClick={() =>
                                    handleAddGenre(g.id, "SECONDARY")
                                  }
                                  className="rounded bg-[#8B7FA0]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#8B7FA0] transition-colors hover:bg-[#8B7FA0]/40"
                                  title="Add as Secondary"
                                >
                                  S
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {genrePickerOpen && unassignedGenres.length === 0 && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-[#2A2440] bg-[#1C1830] px-3 py-2 text-xs text-[#6B6080] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                          All genres assigned
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* genre chips (removable when in watchlist) */}
                {currentGenres.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {currentGenres.map((g) => (
                      <span
                        key={g.id}
                        className={`group/chip inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
                          g.role === "PRIMARY"
                            ? "bg-[#E064D6]/15 font-bold text-[#E8E0F0]"
                            : "bg-[#28223E] text-[#B8AEC8]"
                        }`}
                      >
                        {g.name}
                        {currentRating && !isPlanning && g.role !== null && (
                          <button
                            onClick={() => handleRemoveGenre(g.id)}
                            className="ml-0.5 hidden h-5 w-5 items-center justify-center rounded-full text-sm leading-none text-[#6B6080] transition-colors hover:bg-[#3A1820]/60 hover:text-[#E06B7A] group-hover/chip:inline-flex"
                            title="Remove genre"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-[#6B6080]">—</p>
                )}
              </div>

              {tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-[#E064D6]">Tags</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-[#28223E] px-3 py-1 text-xs text-[#B8AEC8]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ---- similar anime section (loaded async, spans full grid width) ---- */}
          {(similarLoading || similarAnime.length > 0) && (
            <div className="col-span-full mt-4">
              <h3 className="text-lg font-bold">Similar anime you might like</h3>

              {similarLoading ? (
                /* skeleton placeholders */
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-4 sm:gap-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-[#2A2440]" />
                      <div className="h-3 w-3/4 animate-pulse rounded bg-[#2A2440]" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-4 sm:gap-5">
                  {similarAnime.map((s) => (
                    <Link
                      key={s.id}
                      href={`/dashboard/${s.id}`}
                      className="group flex flex-col items-center gap-2 min-w-0"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-[#2A2440]/60 bg-[#2A2440] shadow-md transition-all group-hover:border-[#E064D6]/50 group-hover:shadow-[0_4px_20px_rgba(224,100,214,0.18)]">
                        <Image
                          src={s.coverImage}
                          alt={s.titleEnglish}
                          fill
                          sizes="(max-width: 640px) 30vw, 180px"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <p className="w-full line-clamp-2 text-center text-xs sm:text-sm font-medium leading-tight text-[#B8AEC8] transition-colors group-hover:text-[#E064D6]">
                        {s.titleEnglish}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---- franchise section (spans full grid width) ---- */}
          {franchise.length > 0 && (
            <div className="col-span-full mt-4">
              <h3 className="text-lg font-bold">From the same franchise</h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {franchise.map((f) => (
                  <Link
                    key={f.id}
                    href={`/dashboard/${f.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-[#2A2440]/60 bg-[#1A1625] p-3 transition-all hover:border-[#E064D6]/40 hover:bg-[#241E3A] hover:shadow-[0_4px_24px_rgba(224,100,214,0.12)]"
                  >
                    <div className="relative h-[72px] w-[52px] flex-shrink-0 overflow-hidden rounded-lg bg-[#2A2440]">
                      <Image
                        src={f.coverImage}
                        alt={f.titleEnglish}
                        fill
                        sizes="52px"
                        className="object-cover"
                      />
                    </div>
                    <p className="text-sm font-medium transition-colors group-hover:text-[#E064D6]">
                      {f.titleEnglish}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
