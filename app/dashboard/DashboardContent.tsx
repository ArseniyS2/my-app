"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import SignOutButton from "./SignOutButton";

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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardContent({
  username,
}: {
  username: string;
}) {
  const router = useRouter();

  /* ---------- filter state ---------- */
  const [selectedGenre, setSelectedGenre] = useState("Overall");
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState<"user" | "all">("user");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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

  return (
    <div className="min-h-screen bg-[#0D0B14] text-[#E8E0F0]">
      {/* ---- header ---- */}
      <header className="sticky top-0 z-30 border-b border-[#2A2440] bg-[#13111C]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-lg font-semibold tracking-tight">
            Kizuna
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#8B7FA0]">{username}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
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
          <div className="relative">
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "user" | "all")
              }
              className="cursor-pointer appearance-none rounded-lg border border-[#2A2440] bg-[#1A1625] py-2 pl-3 pr-8 text-sm text-[#E8E0F0] outline-none transition-colors focus:border-[#E064D6]"
            >
              <option value="user">Your anime</option>
              <option value="all">All anime</option>
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B7FA0]"
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
          </div>

          {/* sort dropdown */}
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value as "asc" | "desc")
              }
              className="cursor-pointer appearance-none rounded-lg border border-[#2A2440] bg-[#1A1625] py-2 pl-3 pr-8 text-sm text-[#E8E0F0] outline-none transition-colors focus:border-[#E064D6]"
            >
              <option value="asc">Sort by: Rating ASC</option>
              <option value="desc">Sort by: Rating DESC</option>
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B7FA0]"
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
          </div>
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
            {displayedItems.map((anime) => (
              <div
                key={`${anime.id}-${displayStart}`}
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
      </main>
    </div>
  );
}
