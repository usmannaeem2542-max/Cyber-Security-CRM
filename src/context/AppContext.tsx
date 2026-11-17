import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setTokens } from '../lib/api';
import type { CurrencyCode, LanguageCode, ThemeMode, User } from '../types/crm';

export type NavModule =
  | 'dashboard'
  | 'leads'
  | 'accounts'
  | 'contacts'
  | 'deals'
  | 'catalog'
  | 'quotes'
  | 'contracts'
  | 'engagements'
  | 'marketing'
  | 'activities'
  | 'tickets'
  | 'reports'
  | 'security';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextValue {
  user: User | null;
  authLoading: boolean;
  activeModule: NavModule;
  setActiveModule: (m: NavModule) => void;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  language: LanguageCode;
  setLanguage: (l: LanguageCode) => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  login: (email: string, password: string) => Promise<{ requires2FA: boolean; tempToken?: string }>;
  verify2FA: (tempToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<NavModule>('dashboard');
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    return (localStorage.getItem('crm_currency') as CurrencyCode) || 'AED';
  });
  const [language, setLanguage] = useState<LanguageCode>(() => {
    return (localStorage.getItem('crm_lang') as LanguageCode) || 'en';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('crm_theme') as ThemeMode) || 'dark';
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  // Sync theme on <html>
  useEffect(() => {
    localStorage.setItem('crm_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Sync language & RTL direction on <html>
  useEffect(() => {
    localStorage.setItem('crm_lang', language);
    const root = document.documentElement;
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    localStorage.setItem('crm_currency', currency);
  }, [currency]);

  // Restore session via httpOnly refresh cookie on mount
  useEffect(() => {
    refreshSession()
      .then((data) => {
        if (data?.user) {
          setUser(data.user as unknown as User);
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{
      requires2FA: boolean;
      tempToken?: string;
      accessToken?: string;
      csrfToken?: string;
      user?: User;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (data.requires2FA) {
      return { requires2FA: true, tempToken: data.tempToken };
    }

    if (data.accessToken && data.user) {
      setTokens(data.accessToken, data.csrfToken);
      setUser(data.user);
      showToast(`Signed in as ${data.user.name}`);
    }
    return { requires2FA: false };
  };

  const verify2FA = async (tempToken: string, code: string) => {
    const data = await api<{ accessToken: string; csrfToken: string; user: User }>(
      '/auth/2fa/verify-login',
      {
        method: 'POST',
        body: JSON.stringify({ tempToken, code }),
      }
    );
    setTokens(data.accessToken, data.csrfToken);
    setUser(data.user);
    showToast(`2FA verified. Welcome, ${data.user.name}`);
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setTokens(null, null);
    setUser(null);
    setActiveModule('dashboard');
  };

  const refreshUser = async () => {
    try {
      const data = await api<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch {
      // ignore
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        activeModule,
        setActiveModule,
        currency,
        setCurrency,
        language,
        setLanguage,
        theme,
        setTheme,
        login,
        verify2FA,
        logout,
        refreshUser,
        toasts,
        showToast,
      }}
    >
      {children}
      {/* Toast Notifications */}
      <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`px-4 py-3 rounded-lg border text-sm font-medium shadow-lg transition-all ${
              toast.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/90 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
                : toast.type === 'info'
                  ? 'bg-blue-50 dark:bg-blue-950/90 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200'
                  : 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
