import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Article, Category } from '../types';

interface AppState {
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;

  // User
  user: User | null;
  token: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;

  // Articles
  articles: Article[];
  topArticles: Article[];
  setArticles: (articles: Article[]) => void;
  setTopArticles: (articles: Article[]) => void;

  // Categories
  categories: Category[];
  selectedCategory: string | null;
  setCategories: (categories: Category[]) => void;
  setSelectedCategory: (slug: string | null) => void;

  // Bookmarks (local)
  bookmarkedIds: Set<string>;
  addBookmark: (id: string) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (id: string) => boolean;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      darkMode: true,
      toggleDarkMode: () => {
        set((state) => ({ darkMode: !state.darkMode }));
        document.documentElement.classList.toggle('dark');
      },

      // User
      user: null,
      token: null,
      setUser: (user) => set({ user }),
      setToken: (token) => {
        set({ token });
        if (token) {
          localStorage.setItem('token', token);
        } else {
          localStorage.removeItem('token');
        }
      },
      logout: () => {
        set({ user: null, token: null });
        localStorage.removeItem('token');
      },

      // Articles
      articles: [],
      topArticles: [],
      setArticles: (articles) => set({ articles }),
      setTopArticles: (topArticles) => set({ topArticles }),

      // Categories
      categories: [],
      selectedCategory: null,
      setCategories: (categories) => set({ categories }),
      setSelectedCategory: (slug) => set({ selectedCategory: slug }),

      // Bookmarks
      bookmarkedIds: new Set(),
      addBookmark: (id) =>
        set((state) => ({
          bookmarkedIds: new Set(state.bookmarkedIds).add(id),
        })),
      removeBookmark: (id) =>
        set((state) => {
          const newSet = new Set(state.bookmarkedIds);
          newSet.delete(id);
          return { bookmarkedIds: newSet };
        }),
      isBookmarked: (id) => get().bookmarkedIds.has(id),
    }),
    {
      name: 'bytebrief-storage',
      partialize: (state) => ({
        darkMode: state.darkMode,
        token: state.token,
        bookmarkedIds: Array.from(state.bookmarkedIds),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert array back to Set
          if (Array.isArray(state.bookmarkedIds)) {
            state.bookmarkedIds = new Set(state.bookmarkedIds as unknown as string[]);
          }
          // Apply dark mode
          if (state.darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
    }
  )
);

export default useStore;
