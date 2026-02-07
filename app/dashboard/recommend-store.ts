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

interface RecommendStore {
  mode: "library" | "recommendations";
  results: RecommendedAnime[];
  loading: boolean;
  error: string | null;
  setResults: (results: RecommendedAnime[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearRecommendations: () => void;
}

export const useRecommendStore = create<RecommendStore>((set) => ({
  mode: "library",
  results: [],
  loading: false,
  error: null,
  setResults: (results) => set({ results, mode: "recommendations", loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
  clearRecommendations: () => set({ mode: "library", results: [], loading: false, error: null }),
}));
