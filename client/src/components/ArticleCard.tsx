import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import type { Article } from '../types';

interface ArticleCardProps {
  article: Article;
  variant?: 'featured' | 'default' | 'compact';
}

export default function ArticleCard({ article, variant = 'default' }: ArticleCardProps) {
  const timeAgo = formatDistanceToNow(new Date(article.publishedAt), { addSuffix: false });

  if (variant === 'featured') {
    return (
      <Link to={`/article/${article.id}`} className="block">
        <div className="group relative flex flex-col gap-4 overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-900/50 p-1 border border-transparent hover:border-primary/30 transition-all">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
            {article.imageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ backgroundImage: `url("${article.imageUrl}")` }}
              />
            )}
            <div className="absolute top-3 left-3">
              <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                Featured
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <h3 className="text-xl font-bold leading-snug tracking-tight text-slate-900 dark:text-white">
              {article.title}
            </h3>
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {article.summary}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px]">rss_feed</span>
                </div>
                <span className="text-xs font-semibold text-primary">{article.sourceName}</span>
              </div>
              <span className="text-[10px] font-medium text-slate-500">{timeAgo} ago</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link to={`/article/${article.id}`} className="block">
        <article className="group cursor-pointer">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>{article.category}</span>
              <span className="w-1 h-1 rounded-full bg-slate-400"></span>
              <span className="text-slate-500 dark:text-slate-400">{timeAgo} ago</span>
            </div>
            <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-50 group-hover:text-primary transition-colors">
              {article.title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
              {article.summary}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {article.sourceName}
              </span>
              <span className="text-sm text-slate-500">{article.readTime} min read</span>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  // Default variant
  return (
    <Link to={`/article/${article.id}`} className="block">
      <div className="flex flex-col gap-4 py-2 border-b border-slate-200 dark:border-slate-800/50">
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {article.category}
            </span>
            <h3 className="text-lg font-bold leading-tight text-slate-900 dark:text-white">
              {article.title}
            </h3>
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {article.summary}
            </p>
          </div>
          {article.imageUrl && (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-800">
              <div
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url("${article.imageUrl}")` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {article.sourceName}
          </span>
          <span className="text-[10px] text-slate-500">• {timeAgo} ago</span>
        </div>
      </div>
    </Link>
  );
}
