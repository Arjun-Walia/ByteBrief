import { Link } from 'react-router-dom';
import { format } from 'date-fns';

interface HeaderProps {
  showSearch?: boolean;
  showProfile?: boolean;
}

export default function Header({ showSearch = true, showProfile = true }: HeaderProps) {
  const today = format(new Date(), 'EEEE, MMM d');

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-background-light/80 dark:bg-background-dark/80 px-4 py-4 backdrop-blur-md">
      <div className="flex flex-col">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          ByteBrief
        </span>
        <h2 className="text-lg font-bold leading-tight tracking-tight">{today}</h2>
      </div>
      <div className="flex gap-2">
        {showSearch && (
          <Link
            to="/discover"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <span className="material-symbols-outlined text-[22px]">search</span>
          </Link>
        )}
        {showProfile && (
          <Link
            to="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <span className="material-symbols-outlined text-[22px]">account_circle</span>
          </Link>
        )}
      </div>
    </header>
  );
}
