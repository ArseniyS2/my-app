"use client";

import { create } from "zustand";

type SortOrder = "rating_desc" | "rating_asc" | "watched_desc" | "watched_asc";

interface DashboardUiStore {
  selectedGenre: string;
  searchQuery: string;
  source: "user" | "all";
  sortOrder: SortOrder;
  statusFilter: string;

  setSelectedGenre: (genre: string) => void;
  setSearchQuery: (query: string) => void;
  setSource: (source: "user" | "all") => void;
  setSortOrder: (order: SortOrder) => void;
  setStatusFilter: (status: string) => void;
}

export const useDashboardUi = create<DashboardUiStore>((set) => ({
  selectedGenre: "Overall",
  searchQuery: "",
  source: "user",
  sortOrder: "rating_desc",
  statusFilter: "ALL",

  setSelectedGenre: (selectedGenre) => set({ selectedGenre }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSource: (source) =>
    set((s) => ({
      source,
      statusFilter: source === "all" ? "ALL" : s.statusFilter,
      sortOrder:
        source === "all" && s.sortOrder.startsWith("watched")
          ? "rating_desc"
          : s.sortOrder,
    })),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));
