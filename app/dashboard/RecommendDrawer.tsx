"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRecommendStore } from "./recommend-store";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface AnimeSearchResult {
  id: number;
  titleEnglish: string;
  coverImage: string;
  rating: number | null;
}

interface SeedAnime {
  id: number;
  title: string;
  coverImage: string;
  rating: number | null;
}

/* ------------------------------------------------------------------ */
/*  Multi-select chip input with autocomplete                          */
/* ------------------------------------------------------------------ */

function ChipInput({
  label,
  options,
  selected,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  options: string[];
  selected: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter(
    (o) => !selected.includes(o) && o.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-[#8B7FA0] uppercase tracking-wider">{label}</span>
      {/* chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-[#28223E] px-2.5 py-0.5 text-xs text-[#C8BDD9]"
            >
              {s}
              <button
                onClick={() => onRemove(s)}
                className="ml-0.5 text-[10px] text-[#6B6080] hover:text-[#E06B7A]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* input */}
      <div ref={ref} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#2A2440] bg-[#1A1625] px-3 py-1.5 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none focus:border-[#E064D6]"
        />
        {open && filtered.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-36 w-full overflow-y-auto rounded-lg border border-[#2A2440] bg-[#1C1830] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            {filtered.slice(0, 20).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onAdd(o);
                  setQuery("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-[#C8BDD9] hover:bg-[#28223E] hover:text-[#E8E0F0]"
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Drawer Component                                               */
/* ------------------------------------------------------------------ */

export default function RecommendDrawer() {
  const router = useRouter();
  const { setResults, setLoading, setError } = useRecommendStore();

  /* ---- Seed selection state ---- */
  const [useTopRated, setUseTopRated] = useState(true);
  const [seedSearch, setSeedSearch] = useState("");
  const [seedResults, setSeedResults] = useState<AnimeSearchResult[]>([]);
  const [selectedSeeds, setSelectedSeeds] = useState<SeedAnime[]>([]);
  const [seedSearching, setSeedSearching] = useState(false);

  /* ---- Filter state ---- */
  const [includeGenres, setIncludeGenres] = useState<string[]>([]);
  const [excludeGenres, setExcludeGenres] = useState<string[]>([]);
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [excludeWatched, setExcludeWatched] = useState(true);
  const [freeText, setFreeText] = useState("");

  /* ---- Available options ---- */
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  /* ---- UI state ---- */
  const [generating, setGenerating] = useState(false);
  const [visible, setVisible] = useState(false);
  const seedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* animate in on mount */
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  /* fetch available genres and tags on mount */
  useEffect(() => {
    fetch("/api/recommend/options")
      .then((r) => r.json())
      .then((data: { genres: string[]; tags: string[] }) => {
        setAllGenres(data.genres);
        setAllTags(data.tags);
      })
      .catch(() => {});
  }, []);

  /* debounced seed search */
  useEffect(() => {
    if (useTopRated) return;
    if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
    if (!seedSearch.trim()) {
      setSeedResults([]);
      return;
    }
    seedTimerRef.current = setTimeout(async () => {
      setSeedSearching(true);
      try {
        const res = await fetch(
          `/api/anime?source=all&genre=Overall&sort=desc&offset=0&limit=10&search=${encodeURIComponent(seedSearch)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSeedResults(
            data.items.map((item: AnimeSearchResult) => ({
              id: item.id,
              titleEnglish: item.titleEnglish,
              coverImage: item.coverImage,
              rating: item.rating,
            }))
          );
        }
      } catch {
        /* ignore */
      } finally {
        setSeedSearching(false);
      }
    }, 300);
    return () => {
      if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
    };
  }, [seedSearch, useTopRated]);

  const addSeed = (anime: AnimeSearchResult) => {
    if (selectedSeeds.some((s) => s.id === anime.id)) return;
    setSelectedSeeds((prev) => [
      ...prev,
      { id: anime.id, title: anime.titleEnglish, coverImage: anime.coverImage, rating: anime.rating },
    ]);
    setSeedSearch("");
    setSeedResults([]);
  };

  const removeSeed = (id: number) => {
    setSelectedSeeds((prev) => prev.filter((s) => s.id !== id));
  };

  /* ---- close drawer ---- */
  const closeDrawer = useCallback(() => {
    setVisible(false);
    setTimeout(() => router.back(), 300);
  }, [router]);

  /* ---- generate recommendations ---- */
  const handleGenerate = async () => {
    setGenerating(true);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        useTopRated,
        excludeWatched,
        limit: 15,
      };

      if (!useTopRated && selectedSeeds.length > 0) {
        body.seedAnimeIds = selectedSeeds.map((s) => s.id);
        body.useTopRated = false;
      }
      if (includeGenres.length > 0) body.includeGenres = includeGenres;
      if (excludeGenres.length > 0) body.excludeGenres = excludeGenres;
      if (includeTags.length > 0) body.includeTags = includeTags;
      if (excludeTags.length > 0) body.excludeTags = excludeTags;
      if (freeText.trim()) body.freeText = freeText.trim();

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setError(err.error || "Failed to generate recommendations");
        setGenerating(false);
        return;
      }

      const data = await res.json();
      setResults(data.recommendations);
      setGenerating(false);
      // Close drawer after successful generation
      setVisible(false);
      setTimeout(() => router.back(), 300);
    } catch {
      setError("Network error");
      setGenerating(false);
    }
  };

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeDrawer}
      />

      {/* drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[#2A2440] bg-[#13111C] shadow-2xl transition-transform duration-300 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-[#2A2440] px-5 py-4">
          <h2 className="text-lg font-bold">Recommend me</h2>
          <button
            onClick={closeDrawer}
            className="rounded-lg p-1.5 text-[#8B7FA0] transition-colors hover:bg-[#1A1625] hover:text-[#E8E0F0]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* ============ A) Seed Selection ============ */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-[#E064D6]">Seed Anime</h3>

            {/* toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={useTopRated}
                onClick={() => setUseTopRated(!useTopRated)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  useTopRated ? "bg-[#E064D6]" : "bg-[#2A2440]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    useTopRated ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-[#C8BDD9]">Use my top-rated anime</span>
            </label>

            {/* manual seed picker */}
            {!useTopRated && (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={seedSearch}
                    onChange={(e) => setSeedSearch(e.target.value)}
                    placeholder="Search anime to add as seed…"
                    className="w-full rounded-lg border border-[#2A2440] bg-[#1A1625] px-3 py-2 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none focus:border-[#E064D6]"
                  />
                  {seedSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
                    </div>
                  )}
                  {/* search results dropdown */}
                  {seedResults.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[#2A2440] bg-[#1C1830] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
                      {seedResults.map((anime) => (
                        <button
                          key={anime.id}
                          type="button"
                          onClick={() => addSeed(anime)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#28223E]"
                        >
                          <div className="relative h-10 w-7 flex-shrink-0 overflow-hidden rounded bg-[#2A2440]">
                            {anime.coverImage && (
                              <Image src={anime.coverImage} alt="" fill sizes="28px" className="object-cover" />
                            )}
                          </div>
                          <span className="flex-1 truncate text-sm text-[#C8BDD9]">{anime.titleEnglish}</span>
                          {anime.rating !== null && (
                            <span className="text-xs text-[#8B7FA0]">{anime.rating}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* selected seed chips */}
                {selectedSeeds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedSeeds.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 rounded-lg bg-[#1A1625] border border-[#2A2440] px-2 py-1"
                      >
                        <div className="relative h-6 w-4 flex-shrink-0 overflow-hidden rounded bg-[#2A2440]">
                          {s.coverImage && (
                            <Image src={s.coverImage} alt="" fill sizes="16px" className="object-cover" />
                          )}
                        </div>
                        <span className="text-xs text-[#C8BDD9] max-w-[120px] truncate">{s.title}</span>
                        <button
                          onClick={() => removeSeed(s.id)}
                          className="text-[10px] text-[#6B6080] hover:text-[#E06B7A]"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ============ B) Filters ============ */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-[#E064D6]">Filters</h3>

            <ChipInput
              label="Include Genres"
              options={allGenres}
              selected={includeGenres}
              onAdd={(v) => setIncludeGenres((p) => [...p, v])}
              onRemove={(v) => setIncludeGenres((p) => p.filter((x) => x !== v))}
              placeholder="Add genre to include…"
            />

            <ChipInput
              label="Exclude Genres"
              options={allGenres}
              selected={excludeGenres}
              onAdd={(v) => setExcludeGenres((p) => [...p, v])}
              onRemove={(v) => setExcludeGenres((p) => p.filter((x) => x !== v))}
              placeholder="Add genre to exclude…"
            />

            <ChipInput
              label="Include Tags"
              options={allTags}
              selected={includeTags}
              onAdd={(v) => setIncludeTags((p) => [...p, v])}
              onRemove={(v) => setIncludeTags((p) => p.filter((x) => x !== v))}
              placeholder="Add tag to include…"
            />

            <ChipInput
              label="Exclude Tags"
              options={allTags}
              selected={excludeTags}
              onAdd={(v) => setExcludeTags((p) => [...p, v])}
              onRemove={(v) => setExcludeTags((p) => p.filter((x) => x !== v))}
              placeholder="Add tag to exclude…"
            />

            {/* exclude watched */}
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={excludeWatched}
                onClick={() => setExcludeWatched(!excludeWatched)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  excludeWatched ? "bg-[#E064D6]" : "bg-[#2A2440]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    excludeWatched ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-[#C8BDD9]">Exclude already watched</span>
            </label>
          </section>

          {/* ============ C) Free Text ============ */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-[#E064D6]">Describe what you want</h3>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="e.g. sword fights vs demons, dark tone, complex characters…"
              className="w-full rounded-lg border border-[#2A2440] bg-[#1A1625] px-3 py-2 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none focus:border-[#E064D6] resize-none"
            />
          </section>
        </div>

        {/* footer */}
        <div className="border-t border-[#2A2440] px-5 py-4">
          <button
            onClick={handleGenerate}
            disabled={generating || (!useTopRated && selectedSeeds.length === 0)}
            className="w-full rounded-lg bg-[#E064D6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_14px_rgba(224,100,214,0.35)] transition-all hover:bg-[#C850C0] hover:shadow-[0_0_20px_rgba(224,100,214,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating…
              </span>
            ) : (
              "Generate Recommendations"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
