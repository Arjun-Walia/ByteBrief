import { useEffect, useState } from 'react';
import Header from '../components/Header';
import ArticleCard from '../components/ArticleCard';
import { articlesApi } from '../services/api';
import type { Article } from '../types';

export default function HomePage() {
  const [topArticles, setTopArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const articles = await articlesApi.getTopArticles(10);
        setTopArticles(articles);
      } catch (error) {
        console.error('Failed to fetch articles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []);

  const featuredArticle = topArticles[0];
  const otherArticles = topArticles.slice(1);

  return (
    <>
      <Header />
      <main className="flex-1 pb-24">
        <section className="px-4 pt-6 pb-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Top Headlines
          </h1>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {featuredArticle && (
              <div className="p-4">
                <ArticleCard article={featuredArticle} variant="featured" />
              </div>
            )}

            <div className="flex flex-col gap-6 px-4">
              {otherArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
