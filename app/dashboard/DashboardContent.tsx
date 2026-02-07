"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SignOutButton from "./SignOutButton";
import { useRecommendStore, type RecommendedAnime } from "./recommend-store";

/* ------------------------------------------------------------------ */
/*  Constants & types                                                  */
/* ------------------------------------------------------------------ */

const GENRES = [
  "Overall",
  "Action",
  "Adventure",
  "Comedy",
  "Psychological",
  "Romance",
  "Suspense",
  "Drama",
  "Tragedy",
] as const;

const PAGE_SIZE = 20;
const MAX_DISPLAY = 40;
const ESTIMATED_ROW_H = 112; // px – for top spacer estimation

interface GenreInfo {
  name: string;
  role: "PRIMARY" | "SECONDARY" | null;
}

interface AnimeItem {
  id: number;
  titleEnglish: string;
  coverImage: string;
  rating: number | null;
  genres: GenreInfo[];
  status: string | null;
}

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

/* ------------------------------------------------------------------ */
/*  Custom dropdown (dark theme)                                       */
/* ------------------------------------------------------------------ */

function CustomDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-lg border bg-[#1A1625] py-2 pl-3 pr-8 text-sm text-[#E8E0F0] outline-none transition-colors ${
          open
            ? "border-[#E064D6]"
            : "border-[#2A2440] hover:border-[#3D3560]"
        }`}
      >
        {selected?.label}
        <svg
          className={`pointer-events-none absolute right-2 h-4 w-4 text-[#8B7FA0] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-[#2A2440] bg-[#1C1830] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`block w-full whitespace-nowrap px-4 py-2 text-left text-sm transition-colors ${
                opt.value === value
                  ? "bg-[#E064D6]/15 text-[#E064D6]"
                  : "text-[#C8BDD9] hover:bg-[#28223E] hover:text-[#E8E0F0]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardContent({
  username,
  userPicture,
}: {
  username: string;
  userPicture: string | null;
}) {
  const router = useRouter();

  /* ---------- filter state ---------- */
  const [selectedGenre, setSelectedGenre] = useState("Overall");
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState<"user" | "all">("user");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  /* ---------- data state ---------- */
  const [allItems, setAllItems] = useState<AnimeItem[]>([]);
  const [displayStart, setDisplayStart] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  /* ---------- refs (latest values for async callbacks) ---------- */
  const allItemsRef = useRef<AnimeItem[]>([]);
  const displayStartRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const generationRef = useRef(0);

  /* ---------- DOM refs ---------- */
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  /* ---------- helpers to keep ref + state in sync ---------- */
  const setLoadingSync = (v: boolean) => {
    loadingRef.current = v;
    setLoading(v);
  };
  const setHasMoreSync = (v: boolean) => {
    hasMoreRef.current = v;
    setHasMore(v);
  };

  /* ---------- debounced search ---------- */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => setDebouncedSearch(searchQuery),
      200
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchQuery]);

  /* ---------- fetch items from API ---------- */
  const fetchItems = useCallback(
    async (offset: number, limit: number, signal?: AbortSignal) => {
      const params = new URLSearchParams({
        source,
        genre: selectedGenre,
        sort: sortOrder,
        offset: String(offset),
        limit: String(limit),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/anime?${params}`, { signal });
      if (!res.ok) throw new Error("fetch failed");
      return (await res.json()) as { items: AnimeItem[]; hasMore: boolean };
    },
    [source, selectedGenre, debouncedSearch, sortOrder]
  );

  /* ---------- reset on filter change ---------- */
  useEffect(() => {
    const gen = ++generationRef.current;
    const ac = new AbortController();

    allItemsRef.current = [];
    displayStartRef.current = 0;
    setAllItems([]);
    setDisplayStart(0);
    setHasMoreSync(true);
    setLoadingSync(true);
    setInitialLoad(true);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });

    fetchItems(0, PAGE_SIZE, ac.signal)
      .then((data) => {
        if (gen !== generationRef.current) return;
        allItemsRef.current = data.items;
        setAllItems(data.items);
        setHasMoreSync(data.hasMore);
        setInitialLoad(false);
        setLoadingSync(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (gen !== generationRef.current) return;
        setInitialLoad(false);
        setLoadingSync(false);
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchItems]);

  /* ---------- load more / shift window forward ---------- */
  const loadMore = useCallback(async () => {
    const displayEnd = displayStartRef.current + MAX_DISPLAY;

    /* cached items beyond current window? just shift forward */
    if (displayEnd < allItemsRef.current.length) {
      const newStart = displayStartRef.current + PAGE_SIZE;
      displayStartRef.current = newStart;
      setDisplayStart(newStart);
      return;
    }

    /* otherwise fetch new items from API */
    if (loadingRef.current || !hasMoreRef.current) return;

    const gen = generationRef.current;
    setLoadingSync(true);

    try {
      const data = await fetchItems(
        allItemsRef.current.length,
        PAGE_SIZE
      );
      if (gen !== generationRef.current) return;

      const newAll = [...allItemsRef.current, ...data.items];
      allItemsRef.current = newAll;
      setAllItems(newAll);
      setHasMoreSync(data.hasMore);

      /* auto-shift if the visible window now exceeds MAX_DISPLAY */
      const ds = displayStartRef.current;
      if (newAll.length - ds > MAX_DISPLAY) {
        const newStart = ds + PAGE_SIZE;
        displayStartRef.current = newStart;
        setDisplayStart(newStart);
      }

      setLoadingSync(false);
    } catch {
      if (gen !== generationRef.current) return;
      setLoadingSync(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchItems]);

  /* ---------- scroll backward ---------- */
  const scrollBack = useCallback(() => {
    const ds = displayStartRef.current;
    if (ds <= 0) return;
    const newStart = Math.max(0, ds - PAGE_SIZE);
    displayStartRef.current = newStart;
    setDisplayStart(newStart);
  }, []);

  /* ---------- scroll-based loading ---------- */
  useEffect(() => {
    const handleScroll = () => {
      const scrollBottom = window.scrollY + window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      /* near bottom → load more */
      if (docHeight - scrollBottom < 500) {
        loadMore();
      }

      /* near top & hidden items above → scroll back */
      if (window.scrollY < 400 && displayStartRef.current > 0) {
        scrollBack();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMore, scrollBack]);

  /* also check after initial load (in case content doesn't fill viewport) */
  useEffect(() => {
    if (!initialLoad && !loading && hasMore) {
      const docHeight = document.documentElement.scrollHeight;
      const viewportH = window.innerHeight;
      if (docHeight <= viewportH + 500) {
        loadMore();
      }
    }
  }, [initialLoad, loading, hasMore, loadMore]);

  /* ---------- computed display ---------- */
  const displayedItems = allItems.slice(
    displayStart,
    displayStart + MAX_DISPLAY
  );
  const topSpacerH = displayStart * ESTIMATED_ROW_H;

  /* ---------- formatting helpers ---------- */
  const statusLabel = (s: string | null) => {
    switch (s) {
      case "COMPLETED":
        return "C";
      case "DROPPED":
        return "D";
      case "PLANNING":
        return "P";
      case "ON_HOLD":
        return "H";
      default:
        return "";
    }
  };

  const fmtRating = (r: number | null) => {
    if (r === null || r === undefined) return "—";
    if (source === "all") return `${(r / 10).toFixed(1)}/10`;
    return `${r}/10`;
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  /* ---------- recommendation store ---------- */
  const { mode, results: recommendations, loading: recLoading, error: recError, clearRecommendations } =
    useRecommendStore();

  return (
    <div className="min-h-screen bg-[#0D0B14] text-[#E8E0F0]">
      {/* ---- header ---- */}
      <header className="sticky top-0 z-30 border-b border-[#2A2440] bg-[#13111C]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-lg font-semibold tracking-tight">
            Kizuna
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/recommend"
              className="rounded-full border border-[#E064D6] px-4 py-1.5 text-sm font-medium text-[#E064D6] transition-all hover:bg-[#E064D6] hover:text-white hover:shadow-[0_0_14px_rgba(224,100,214,0.35)]"
            >
              Recommend me
            </Link>
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
              <span className="text-sm text-[#8B7FA0] transition-colors group-hover:text-[#E064D6]">
                {username}
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* ============ Recommendation Results ============ */}
        {mode === "recommendations" && (
          <RecommendationResults
            recommendations={recommendations}
            loading={recLoading}
            error={recError}
            onClear={clearRecommendations}
            router={router}
          />
        )}

        {/* ============ Library Mode ============ */}
        {mode === "library" && (
        <>
        {/* ---- genre chips ---- */}
        <div className="mb-5 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGenre(g)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                selectedGenre === g
                  ? "bg-[#E064D6] text-white shadow-[0_0_14px_rgba(224,100,214,0.35)]"
                  : "bg-[#1A1625] text-[#8B7FA0] hover:bg-[#241E3A] hover:text-[#C8BDD9]"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* ---- search bar + dropdowns ---- */}
        <div className="mb-6 flex flex-wrap gap-3">
          {/* search */}
          <div className="relative min-w-[200px] flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B7FA0]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-[#2A2440] bg-[#1A1625] py-2 pl-10 pr-4 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none transition-colors focus:border-[#E064D6]"
            />
          </div>

          {/* source dropdown */}
          <CustomDropdown
            value={source}
            options={[
              { value: "user", label: "Your anime" },
              { value: "all", label: "All anime" },
            ]}
            onChange={setSource}
          />

          {/* sort dropdown */}
          <CustomDropdown
            value={sortOrder}
            options={[
              { value: "desc", label: "Sort by: Rating DESC" },
              { value: "asc", label: "Sort by: Rating ASC" },
            ]}
            onChange={setSortOrder}
          />
        </div>

        {/* ---- initial loading ---- */}
        {initialLoad && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
          </div>
        )}

        {/* ---- empty state ---- */}
        {!initialLoad && displayedItems.length === 0 && !loading && (
          <p className="py-16 text-center text-[#8B7FA0]">
            No anime found.
          </p>
        )}

        {/* ---- anime list ---- */}
        {!initialLoad && displayedItems.length > 0 && (
          <div>
            {/* top spacer for deloaded items */}
            {topSpacerH > 0 && (
              <div style={{ height: topSpacerH }} aria-hidden />
            )}

            {/* top sentinel */}
            {displayStart > 0 && (
              <div ref={topRef} className="h-px" />
            )}

            {/* anime rows */}
            {displayedItems.map((anime, idx) => (
              <div
                key={`${displayStart + idx}-${anime.id}`}
                onClick={() =>
                  router.push(`/dashboard/${anime.id}`)
                }
                className="group mb-2 flex cursor-pointer items-center gap-4 rounded-xl border border-[#2A2440]/60 bg-[#1A1625] p-3 transition-all duration-200 hover:scale-[1.015] hover:border-[#E064D6]/40 hover:bg-[#241E3A] hover:shadow-[0_4px_24px_rgba(224,100,214,0.12)]"
              >
                {/* cover image */}
                <div className="relative h-[88px] w-16 flex-shrink-0 overflow-hidden rounded-lg bg-[#2A2440]">
                  {anime.coverImage && (
                    <Image
                      src={anime.coverImage}
                      alt={anime.titleEnglish}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </div>

                {/* title */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium transition-colors group-hover:text-[#E064D6]">
                    {anime.titleEnglish}
                  </p>
                </div>

                {/* rating */}
                <p className="w-20 flex-shrink-0 text-center text-lg font-bold">
                  {fmtRating(anime.rating)}
                </p>

                {/* genres + status */}
                <div className="w-56 flex-shrink-0 text-right text-sm leading-snug">
                  <span>
                    {anime.genres.map((g, i) => (
                      <span key={`${g.name}-${i}`}>
                        {i > 0 && ", "}
                        {g.role === "PRIMARY" ? (
                          <span className="font-bold">
                            {g.name}
                          </span>
                        ) : (
                          <span className="text-[#8B7FA0]">
                            {g.name}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                  {anime.status && (
                    <span className="ml-2 text-xs font-semibold text-[#E064D6]">
                      {statusLabel(anime.status)}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* bottom sentinel */}
            <div ref={bottomRef} className="h-px" />

            {/* loading spinner */}
            {loading && !initialLoad && (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
              </div>
            )}

            {/* end of list */}
            {!hasMore && !loading && (
              <p className="py-6 text-center text-sm text-[#6B6080]">
                You&apos;ve reached the end.
              </p>
            )}
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recommendation Results Component                                    */
/* ------------------------------------------------------------------ */

function RecommendationResults({
  recommendations,
  loading,
  error,
  onClear,
  router,
}: {
  recommendations: RecommendedAnime[];
  loading: boolean;
  error: string | null;
  onClear: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div>
      {/* header bar */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Recommendations</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/recommend"
            className="rounded-lg border border-[#2A2440] px-3 py-1.5 text-sm text-[#8B7FA0] transition-colors hover:border-[#3D3560] hover:text-[#E8E0F0]"
          >
            Edit request
          </Link>
          <button
            onClick={onClear}
            className="rounded-lg border border-[#2A2440] px-3 py-1.5 text-sm text-[#8B7FA0] transition-colors hover:border-[#3D3560] hover:text-[#E8E0F0]"
          >
            Back to library
          </button>
        </div>
      </div>

      {/* loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
          <p className="text-sm text-[#8B7FA0]">Finding anime for you…</p>
        </div>
      )}

      {/* error state */}
      {error && (
        <div className="rounded-xl border border-[#5A2832] bg-[#3A1820]/40 p-4 text-sm text-[#E06B7A]">
          {error}
        </div>
      )}

      {/* results */}
      {!loading && !error && recommendations.length === 0 && (
        <p className="py-16 text-center text-[#8B7FA0]">
          No recommendations found. Try adjusting your filters.
        </p>
      )}

      {!loading && recommendations.length > 0 && (
        <div>
          {recommendations.map((anime, idx) => (
            <div
              key={anime.id}
              onClick={() => router.push(`/dashboard/${anime.id}`)}
              className="group mb-2 flex cursor-pointer items-center gap-4 rounded-xl border border-[#2A2440]/60 bg-[#1A1625] p-3 transition-all duration-200 hover:scale-[1.015] hover:border-[#E064D6]/40 hover:bg-[#241E3A] hover:shadow-[0_4px_24px_rgba(224,100,214,0.12)]"
            >
              {/* rank */}
              <span className="w-6 flex-shrink-0 text-center text-sm font-bold text-[#8B7FA0]">
                {idx + 1}
              </span>

              {/* cover image */}
              <div className="relative h-[88px] w-16 flex-shrink-0 overflow-hidden rounded-lg bg-[#2A2440]">
                {anime.coverUrl && (
                  <Image
                    src={anime.coverUrl}
                    alt={anime.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                )}
              </div>

              {/* title + direct hit */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium transition-colors group-hover:text-[#E064D6]">
                  {anime.title}
                </p>
                {/* direct hit indicator (when the reranker matched a different season) */}
                {anime.directHit.title && (
                  <p className="mt-0.5 truncate text-xs text-[#A78BFA]">
                    ↳ matched: {anime.directHit.title}
                  </p>
                )}
                {/* tags preview */}
                {anime.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {anime.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[#28223E] px-2 py-0.5 text-[10px] text-[#8B7FA0]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* score */}
              <p className="w-16 flex-shrink-0 text-center text-sm font-semibold text-[#E064D6]">
                {(anime.score * 100).toFixed(0)}%
              </p>

              {/* genres */}
              <div className="w-44 flex-shrink-0 text-right text-sm leading-snug">
                <span className="text-[#8B7FA0]">
                  {anime.genres.slice(0, 3).join(", ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
