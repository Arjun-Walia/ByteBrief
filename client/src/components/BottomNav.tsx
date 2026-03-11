import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/discover', icon: 'explore', label: 'Discover' },
  { to: '/saved', icon: 'bookmarks', label: 'Saved' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-background-light/95 dark:bg-background-dark/95 px-4 pb-6 pt-3 backdrop-blur-lg">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 ${
              isActive
                ? 'text-primary'
                : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className="material-symbols-outlined"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
