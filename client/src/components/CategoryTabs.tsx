import { NavLink } from 'react-router-dom';
import type { Category } from '../types';

interface CategoryTabsProps {
  categories: Category[];
  showAll?: boolean;
}

export default function CategoryTabs({ categories, showAll = true }: CategoryTabsProps) {
  return (
    <nav className="px-6 flex gap-8 overflow-x-auto hide-scrollbar border-b border-slate-200 dark:border-slate-800">
      {showAll && (
        <NavLink
          to="/discover"
          end
          className={({ isActive }) =>
            `flex flex-col items-center pt-4 pb-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
              isActive
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`
          }
        >
          All
        </NavLink>
      )}
      {categories.map((category) => (
        <NavLink
          key={category.slug}
          to={`/category/${category.slug}`}
          className={({ isActive }) =>
            `flex flex-col items-center pt-4 pb-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
              isActive
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`
          }
        >
          {category.name}
        </NavLink>
      ))}
    </nav>
  );
}
