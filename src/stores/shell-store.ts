import { create } from "zustand";

type ShellState = {
  query: string;
  setQuery: (query: string) => void;
};

export const useShellStore = create<ShellState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
