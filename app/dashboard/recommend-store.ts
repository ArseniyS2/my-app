"use client";

import { create } from "zustand";

/** The direct hit anime that the reranker actually matched */
export interface DirectHit {
  id: number;
  title: string;
}

export interface RecommendedAnime {
  /** franchise_id (= season 1 id) */
  id: number;
  /** franchise title (season 1 title) */
  title: string;
  /** franchise cover (season 1 cover) */
  coverUrl: string;
  /** reranker score of the best hit in this franchise */
  score: number;
  /** the specific anime the reranker matched */
  directHit: DirectHit;
  genres: string[];
  tags: string[];
}

export interface SeedAnime {
  id: number;
  title: string;
  coverImage: string;
  rating: number | null;
}

export interface RecommendRequestParams {
  useTopRated: boolean;
  selectedSeeds: SeedAnime[];
  includeGenres: string[];
  excludeGenres: string[];
  includeTags: string[];
  excludeTags: string[];
  genreMatchMode: "any" | "all";
  tagMatchMode: "any" | "all";
  excludeWatched: boolean;
  freeText: string;
}

const DEFAULT_REQUEST_PARAMS: RecommendRequestParams = {
  useTopRated: true,
  selectedSeeds: [],
  includeGenres: [],
  excludeGenres: [],
  includeTags: [],
  excludeTags: [],
  genreMatchMode: "any",
  tagMatchMode: "any",
  excludeWatched: true,
  freeText: "",
};

interface RecommendStore {
  mode: "library" | "recommendations";
  results: RecommendedAnime[];
  loading: boolean;
  error: string | null;
  requestParams: RecommendRequestParams;

  setResults: (results: RecommendedAnime[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setRequestParams: (params: RecommendRequestParams) => void;
  clearRecommendations: () => void;
}

export const useRecommendStore = create<RecommendStore>((set) => ({
  mode: "library",
  results: [],
  loading: false,
  error: null,
  requestParams: { ...DEFAULT_REQUEST_PARAMS },

  setResults: (results) => set({ results, mode: "recommendations", loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
  setRequestParams: (requestParams) => set({ requestParams }),
  clearRecommendations: () =>
    set({
      mode: "library",
      results: [],
      loading: false,
      error: null,
      requestParams: { ...DEFAULT_REQUEST_PARAMS },
    }),
}));
