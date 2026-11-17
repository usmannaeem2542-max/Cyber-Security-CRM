import { Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { AuditLog, User, UserRole } from '../types/crm';

export function SecurityAdminView() {
  const { user, refreshUser, showToast } = useApp();
  const [subTab, setSubTab] = useState<'my2fa' | 'audit' | 'users'>('my2fa');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [usersList, setUsersList] = useState<User[]>([]);

  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'SALES_REP' as UserRole,
    department: 'Enterprise Sales',
    teamAccessGranted: false,
  });

  const canManageUsers = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  const loadGovernance = useCallback(async () => {
    if (!canManageUsers) return;
    try {
      const [logRes, userRes] = await Promise.all([
        api<{ logs: AuditLog[] }>(`/audit-logs?action=${actionFilter}`),
        api<{ users: User[] }>('/auth/users'),
      ]);
      setAuditLogs(logRes.logs);
      setUsersList(userRes.users);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load governance data', 'error');
    }
  }, [canManageUsers, actionFilter, showToast]);

  useEffect(() => {
    loadGovernance();
  }, [loadGovernance]);

  const start2FASetup = async () => {
    try {
      const res = await api<{ secret: string; qrDataUrl: string }>('/auth/2fa/setup', {
        method: 'POST',
      });
      setQrDataUrl(res.qrDataUrl);
      setTotpSecret(res.secret);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '2FA setup failed', 'error');
    }
  };

  const confirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      setQrDataUrl(null);
      setTotpSecret(null);
      setVerifyCode('');
      await refreshUser();
      showToast('TOTP 2FA enabled on your account');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid TOTP code', 'error');
    }
  };

  const disable2FA = async () => {
    try {
      await api('/auth/2fa/disable', { method: 'POST' });
      await refreshUser();
      showToast('2FA disabled', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to disable 2FA', 'error');
    }
  };

  const toggleTeamAccess = async (target: User) => {
    try {
      await api(`/auth/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ teamAccessGranted: !target.teamAccessGranted }),
      });
      showToast(`Updated team visibility for ${target.name}`);
      loadGovernance();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const changeUserRole = async (targetId: string, role: UserRole) => {
    try {
      await api(`/auth/users/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      showToast('User role updated');
      loadGovernance();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Role update failed', 'error');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/users', { method: 'POST', body: JSON.stringify(newUser) });
      showToast('User provisioned');
      setShowNewUser(false);
      loadGovernance();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create user failed', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            onClick={() => setSubTab('my2fa')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'my2fa'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            My Account Security (2FA)
          </button>
          {canManageUsers && (
            <>
              <button
                onClick={() => setSubTab('audit')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  subTab === 'audit'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Audit Log ({auditLogs.length})
              </button>
              <button
                onClick={() => setSubTab('users')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  subTab === 'users'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Users &amp; RBAC ({usersList.length})
              </button>
            </>
          )}
        </div>

        {subTab === 'users' && isAdmin && (
          <button
            onClick={() => setShowNewUser(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Provision User</span>
          </button>
        )}
      </div>

      {subTab === 'my2fa' && (
        <div className="max-w-xl p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-bold">
                TOTP Two-Factor Authentication
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Protect CRM access with Google Authenticator, Microsoft Authenticator, or 1Password.
              </p>
            </div>
            <span
              className={`text-xs font-semibold ${
                user?.twoFactorEnabled
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {user?.twoFactorEnabled ? '2FA Enabled' : '2FA Inactive'}
            </span>
          </div>

          {user?.twoFactorEnabled ? (
            <button
              onClick={disable2FA}
              className="px-4 py-2 text-xs font-medium border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg inline-flex items-center gap-2"
            >
              <ShieldOff className="w-4 h-4" />
              <span>Disable TOTP 2FA</span>
            </button>
          ) : qrDataUrl ? (
            <form onSubmit={confirm2FA} className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={qrDataUrl}
                  alt="2FA QR Code"
                  className="w-36 h-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1.5"
                />
                <div className="text-xs space-y-2">
                  <div className="text-slate-500">
                    Scan the QR code or enter manual secret key:
                  </div>
                  <div className="font-mono p-2 rounded bg-slate-100 dark:bg-slate-800 select-all">
                    {totpSecret}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  required
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit code"
                  className="px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                >
                  Verify &amp; Activate
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={start2FASetup}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg inline-flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Configure Authenticator 2FA</span>
            </button>
          )}
        </div>
      )}

      {subTab === 'audit' && canManageUsers && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Action Filter:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            >
              <option value="ALL">All Events</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGIN_FAILED">LOGIN_FAILED</option>
              <option value="VIEW_SENSITIVE">VIEW_SENSITIVE</option>
              <option value="EXPORT">EXPORT</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="ROLE_CHANGE">ROLE_CHANGE</option>
            </select>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                    <th className="py-2.5 px-4 text-start">Timestamp</th>
                    <th className="py-2.5 px-4 text-start">Actor</th>
                    <th className="py-2.5 px-4 text-start">Action</th>
                    <th className="py-2.5 px-4 text-start">Entity</th>
                    <th className="py-2.5 px-4 text-start">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium">{log.userEmail}</div>
                        <div className="text-[11px] text-slate-400">{log.userRole}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{log.entityType}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'users' && canManageUsers && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">User</th>
                  <th className="py-2.5 px-4 text-start">Department</th>
                  <th className="py-2.5 px-4 text-start">Role</th>
                  <th className="py-2.5 px-4 text-start">2FA</th>
                  <th className="py-2.5 px-4 text-end">Team Record Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{u.department}</td>
                    <td className="py-2.5 px-4">
                      {isAdmin ? (
                        <select
                          value={u.role}
                          onChange={(e) => changeUserRole(u.id, e.target.value as UserRole)}
                          className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="SALES_MANAGER">SALES_MANAGER</option>
                          <option value="SALES_REP">SALES_REP</option>
                          <option value="MARKETING">MARKETING</option>
                          <option value="READ_ONLY">READ_ONLY</option>
                        </select>
                      ) : (
                        <span>{u.role}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      {u.twoFactorEnabled ? 'Enabled' : 'Off'}
                    </td>
                    <td className="py-2.5 px-4 text-end">
                      <button
                        onClick={() => toggleTeamAccess(u)}
                        className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                          u.teamAccessGranted
                            ? 'border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        {u.teamAccessGranted ? 'Team Access Granted' : 'Own Records Only'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Provision CRM User</h3>
            <input
              required
              placeholder="Full Name"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <input
              type="email"
              required
              placeholder="Work Email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Temporary Password (min 8 chars)"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="ADMIN">Admin</option>
                <option value="SALES_MANAGER">Sales Manager</option>
                <option value="SALES_REP">Sales Rep</option>
                <option value="MARKETING">Marketing</option>
                <option value="READ_ONLY">Read-Only</option>
              </select>
              <input
                placeholder="Department"
                value={newUser.department}
                onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewUser(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
