import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import CategoryTabs from '../components/CategoryTabs';
import ArticleCard from '../components/ArticleCard';
import { articlesApi, categoriesApi } from '../services/api';
import type { Article, Category } from '../types';

export default function DiscoverPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoriesApi.getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchArticles = async () => {
      setLoading(true);
      try {
        if (query) {
          const result = await articlesApi.searchArticles(query);
          setArticles(result.data);
        } else if (slug) {
          const result = await articlesApi.getArticlesByCategory(slug);
          setArticles(result.data);
        } else {
          const result = await articlesApi.getArticles();
          setArticles(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch articles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, [slug, query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    } else {
      setSearchParams({});
    }
  };

  const currentCategory = slug
    ? categories.find((c) => c.slug === slug)
    : null;

  return (
    <>
      <header className="sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
              menu
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              ByteBrief
            </h1>
          </div>
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search..."
              className="bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                search
              </span>
            </button>
          </form>
        </div>
        <CategoryTabs categories={categories} />
      </header>

      <main className="flex-1 px-6 py-8 pb-24 max-w-2xl mx-auto w-full">
        {query && (
          <div className="mb-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Search results for "{query}"
            </p>
          </div>
        )}

        {currentCategory && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {currentCategory.name}
            </h2>
            {currentCategory.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {currentCategory.description}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2">
              article
            </span>
            <p>No articles found</p>
          </div>
        ) : (
          <div className="space-y-12">
            {articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                variant={index === 0 && !query ? 'compact' : 'compact'}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
