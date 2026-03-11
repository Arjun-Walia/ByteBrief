import { useState } from 'react';
import { useStore } from '../store';

export default function SettingsPage() {
  const { darkMode, toggleDarkMode, user, logout } = useStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 dark:bg-background-dark/80 px-4 py-4 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Settings
        </h1>
      </header>

      <main className="flex-1 px-4 py-6 pb-24">
        {/* Profile Section */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
            Account
          </h2>
          {user ? (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl">
                    person
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {user.displayName || user.email}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full py-2 text-red-500 font-medium border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-slate-400 text-2xl">
                  person
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 text-center">
                Sign in to sync your preferences and bookmarks
              </p>
              <button className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">
                Sign In
              </button>
            </div>
          )}
        </section>

        {/* Appearance Section */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
            Appearance
          </h2>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                  dark_mode
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Dark Mode
                </span>
              </div>
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  darkMode ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
            Notifications
          </h2>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                  notifications
                </span>
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100 block">
                    Daily Digest
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Get top stories at 8:00 AM
                  </span>
                </div>
              </div>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notificationsEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
            About
          </h2>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                  info
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Version
                </span>
              </div>
              <span className="text-slate-500 dark:text-slate-400">1.0.0</span>
            </div>
            <a
              href="https://github.com/yourusername/bytebrief"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                  code
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Source Code
                </span>
              </div>
              <span className="material-symbols-outlined text-slate-400">
                open_in_new
              </span>
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
