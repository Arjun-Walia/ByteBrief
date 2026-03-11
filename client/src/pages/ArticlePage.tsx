import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { articlesApi, usersApi } from '../services/api';
import { useStore } from '../store';
import type { Article } from '../types';

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const { isBookmarked, addBookmark, removeBookmark, token } = useStore();

  const bookmarked = id ? isBookmarked(id) : false;

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) return;
      try {
        const data = await articlesApi.getArticleById(id);
        setArticle(data);
      } catch (error) {
        console.error('Failed to fetch article:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  const handleBookmark = async () => {
    if (!id) return;

    if (bookmarked) {
      removeBookmark(id);
      if (token) {
        try {
          await usersApi.removeBookmark(id);
        } catch (error) {
          console.error('Failed to remove bookmark:', error);
        }
      }
    } else {
      addBookmark(id);
      if (token) {
        try {
          await usersApi.addBookmark(id);
        } catch (error) {
          console.error('Failed to add bookmark:', error);
        }
      }
    }
  };

  const handleShare = async () => {
    if (article) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url: article.sourceUrl,
        });
      } catch {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(article.sourceUrl);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-slate-500">Article not found</p>
        <button
          onClick={() => navigate('/')}
          className="text-primary font-medium"
        >
          Go back home
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 dark:bg-background-dark/80 px-4 py-4 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            <span className="material-symbols-outlined">share</span>
          </button>
          <button
            onClick={handleBookmark}
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              bookmarked
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={bookmarked ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              bookmark
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24">
        {article.imageUrl && (
          <div className="mt-4">
            <div
              className="w-full overflow-hidden rounded-xl aspect-video bg-slate-200 dark:bg-slate-800"
              style={{
                backgroundImage: `url("${article.imageUrl}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              {article.category}
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              {article.readTime} min read
            </span>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
            {article.title}
          </h1>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                rss_feed
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {article.sourceName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {format(new Date(article.publishedAt), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {/* AI Summary Section */}
          <section className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex items-center gap-2 mb-3 text-primary">
              <span className="material-symbols-outlined text-xl">auto_awesome</span>
              <h2 className="text-lg font-bold">AI Summary</h2>
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
              {article.summary}
            </p>
          </section>

          {/* Content */}
          {article.content && (
            <section className="space-y-4">
              <div
                className="text-slate-700 dark:text-slate-300 leading-relaxed prose prose-slate dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            </section>
          )}

          {/* Read full article link */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between text-primary font-semibold hover:underline"
            >
              <span>Read full story on {article.sourceName}</span>
              <span className="material-symbols-outlined">open_in_new</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
