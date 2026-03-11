import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ArticleCard from '../components/ArticleCard';
import { usersApi } from '../services/api';
import { useStore } from '../store';
import type { Article } from '../types';

export default function SavedPage() {
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const { token, bookmarkedIds } = useStore();

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (token) {
        try {
          const articles = await usersApi.getBookmarks();
          setSavedArticles(articles);
        } catch (error) {
          console.error('Failed to fetch bookmarks:', error);
        }
      }
      setLoading(false);
    };

    fetchBookmarks();
  }, [token]);

  // Merge local bookmarks with server bookmarks
  const localBookmarkCount = bookmarkedIds.size;

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 dark:bg-background-dark/80 px-4 py-4 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Saved Articles
        </h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {token ? savedArticles.length : localBookmarkCount} saved
        </span>
      </header>

      <main className="flex-1 px-4 py-6 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !token ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-700 mb-4">
              bookmark
            </span>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Sign in to sync your bookmarks
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
              Your bookmarks are saved locally. Sign in to access them across devices.
            </p>
            <Link
              to="/settings"
              className="bg-primary text-white px-6 py-2 rounded-full font-medium"
            >
              Sign In
            </Link>
            {localBookmarkCount > 0 && (
              <p className="mt-4 text-sm text-slate-500">
                You have {localBookmarkCount} locally saved article{localBookmarkCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : savedArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-700 mb-4">
              bookmark_border
            </span>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              No saved articles yet
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
              Bookmark articles you want to read later by tapping the bookmark icon.
            </p>
            <Link
              to="/"
              className="bg-primary text-white px-6 py-2 rounded-full font-medium"
            >
              Browse Articles
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {savedArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
