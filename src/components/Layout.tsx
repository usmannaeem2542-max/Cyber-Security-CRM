import {
  Activity as ActivityIcon,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Search,
  Shield,
  ShieldAlert,
  Sun,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { type NavModule, useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { t } from '../lib/i18n';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  module: NavModule;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    user,
    activeModule,
    setActiveModule,
    currency,
    setCurrency,
    language,
    setLanguage,
    theme,
    setTheme,
    logout,
  } = useApp();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ results: SearchResult[] }>(
          `/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setSearchResults(res.results);
        setSearchOpen(true);
      } catch {
        // ignore search errors
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const navGroups: Array<{
    label: string;
    items: Array<{ id: NavModule; labelKey: string; icon: React.ComponentType<{ className?: string }> }>;
  }> = [
    {
      label: language === 'ar' ? 'نظرة عامة' : 'Overview',
      items: [
        { id: 'dashboard', labelKey: 'navDashboard', icon: LayoutDashboard },
        { id: 'reports', labelKey: 'navReports', icon: BarChart3 },
      ],
    },
    {
      label: language === 'ar' ? 'المبيعات والعملاء' : 'Sales & Pipeline',
      items: [
        { id: 'leads', labelKey: 'navLeads', icon: ActivityIcon },
        { id: 'accounts', labelKey: 'navAccounts', icon: Building2 },
        { id: 'contacts', labelKey: 'navContacts', icon: Users },
        { id: 'deals', labelKey: 'navDeals', icon: Briefcase },
      ],
    },
    {
      label: language === 'ar' ? 'العروض والتسليم' : 'Commercial & Delivery',
      items: [
        { id: 'catalog', labelKey: 'navCatalog', icon: Layers },
        { id: 'quotes', labelKey: 'navQuotes', icon: FileText },
        { id: 'contracts', labelKey: 'navContracts', icon: FileSpreadsheet },
        { id: 'engagements', labelKey: 'navEngagements', icon: Shield },
      ],
    },
    {
      label: language === 'ar' ? 'التسويق والعمليات' : 'Marketing & Operations',
      items: [
        { id: 'marketing', labelKey: 'navMarketing', icon: Megaphone },
        { id: 'activities', labelKey: 'navActivities', icon: CalendarDays },
        { id: 'tickets', labelKey: 'navTickets', icon: LifeBuoy },
      ],
    },
    {
      label: language === 'ar' ? 'الحوكمة والأمن' : 'Security & Governance',
      items: [{ id: 'security', labelKey: 'navSecurity', icon: ShieldAlert }],
    },
  ];

  const activeNavItem = navGroups.flatMap((g) => g.items).find((i) => i.id === activeModule);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {t(language, 'brand')}
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t(language, item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {user && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <div className="px-2 py-1.5">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {user.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user.role.replace(/_/g, ' ')} · {user.department}
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t(language, 'signOut')}</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div
            className="flex-1 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeNavItem ? t(language, activeNavItem.labelKey) : t(language, 'navDashboard')}
            </div>
          </div>

          {/* Global Search */}
          <div ref={searchRef} className="relative flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                placeholder={t(language, 'searchPlaceholder')}
                className="w-full ps-9 pe-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full mt-1.5 inset-x-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => {
                      setActiveModule(r.module);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-start px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {r.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {r.subtitle}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-blue-600 dark:text-blue-400 shrink-0">
                      {r.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preferences Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setCurrency('AED')}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                  currency === 'AED'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                AED
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                  currency === 'USD'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                USD
              </button>
            </div>

            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              title="Toggle English / Arabic RTL"
            >
              {language === 'en' ? 'العربية' : 'EN'}
            </button>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {user?.role === 'READ_ONLY' && (
          <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900 px-6 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            {t(language, 'readOnlyBanner')}
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
