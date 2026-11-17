import { Lock, Shield, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin1@sentinelshield.ae', detail: 'Full platform & audit access' },
  { label: 'Sales Manager', email: 'manager1@sentinelshield.ae', detail: 'Team pipeline & forecasting' },
  { label: 'Sales Rep (Own)', email: 'rep1@sentinelshield.ae', detail: 'Own records only' },
  { label: 'Sales Rep (Team)', email: 'rep3@sentinelshield.ae', detail: 'Granted team visibility' },
  { label: 'Marketing', email: 'mkt1@sentinelshield.ae', detail: 'Campaigns, segments & leads' },
  { label: 'Read-Only', email: 'readonly1@sentinelshield.ae', detail: 'Audit & view without edits' },
];

export function LoginView() {
  const { login, verify2FA } = useApp();
  const [email, setEmail] = useState('admin1@sentinelshield.ae');
  const [password, setPassword] = useState('Password123!');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tempToken) {
        await verify2FA(tempToken, totpCode.trim());
      } else {
        const res = await login(email, password);
        if (res.requires2FA && res.tempToken) {
          setTempToken(res.tempToken);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setError('');
    setLoading(true);
    try {
      const res = await login(demoEmail, 'Password123!');
      if (res.requires2FA && res.tempToken) {
        setTempToken(res.tempToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-4xl grid lg:grid-cols-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {/* Left Brand & Security Posture */}
        <div className="p-8 lg:p-10 bg-slate-900 text-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight">
                SentinelShield Cyber
              </span>
            </div>

            <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-white mb-4">
              Enterprise Sales, Delivery &amp; Marketing Operations
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-8">
              Purpose-built CRM for penetration testing, 24/7 Managed SOC/MDR, SIEM deployments,
              and regulatory compliance engagements across MENA &amp; global B2B markets.
            </p>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-6 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>Authentication</span>
              <span className="font-mono text-slate-200">JWT + HttpOnly Refresh + TOTP 2FA</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Access Control</span>
              <span className="font-mono text-slate-200">RBAC + Field-Level Redaction</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Compliance</span>
              <span className="font-mono text-slate-200">Full Immutable Audit Trail</span>
            </div>
          </div>
        </div>

        {/* Right Sign-In Form */}
        <div className="p-8 lg:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              {tempToken ? 'Two-Factor Verification' : 'Sign in to workspace'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {tempToken
                ? 'Enter the 6-digit code from your authenticator application.'
                : 'Authenticate with your corporate credentials.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!tempToken ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    placeholder="name@sentinelshield.ae"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 text-center font-mono text-lg tracking-widest bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  placeholder="000000"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {tempToken ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>{loading ? 'Authenticating...' : tempToken ? 'Verify Code' : 'Sign In'}</span>
            </button>
          </form>

          {!tempToken && (
            <div className="mt-7 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2.5">
                Quick Demo Role Sign-In (Password: <span className="font-mono">Password123!</span>)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => quickLogin(acc.email)}
                    disabled={loading}
                    className="text-start px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/60 transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {acc.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {acc.detail}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
