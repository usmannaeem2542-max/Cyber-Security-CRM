import { Eye, ExternalLink, Lock, Plus, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatMoney } from '../lib/currency';
import type { Account, Contact } from '../types/crm';

export function AccountsContactsView({ defaultTab = 'accounts' }: { defaultTab?: 'accounts' | 'contacts' }) {
  const { user, currency, showToast } = useApp();
  const [tab, setTab] = useState<'accounts' | 'contacts'>(defaultTab);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [search, setSearch] = useState('');
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [activityNote, setActivityNote] = useState('');

  const [accForm, setAccForm] = useState({
    name: '',
    industry: 'Banking & Finance',
    size: 'ENTERPRISE' as Account['size'],
    country: 'UAE',
    complianceReqs: ['ISO 27001', 'NESA/UAE IA'],
    securityStack: '',
    vulnerabilityNotes: '',
    healthStatus: 'HEALTHY' as Account['healthStatus'],
  });

  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'CISO' as Contact['role'],
    jobTitle: '',
    isDecisionMaker: true,
    linkedinUrl: '',
    accountId: '',
  });

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const isReadOnly = user?.role === 'READ_ONLY';

  const load = useCallback(async () => {
    try {
      const [accRes, conRes] = await Promise.all([
        api<{ accounts: Account[] }>('/accounts'),
        api<{ contacts: Contact[] }>('/contacts'),
      ]);
      setAccounts(accRes.accounts);
      setContacts(conRes.contacts);
      if (accRes.accounts.length > 0 && !contactForm.accountId) {
        setContactForm((f) => ({ ...f, accountId: accRes.accounts[0].id }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load accounts', 'error');
    }
  }, [showToast, contactForm.accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAccountDetail = async (id: string, reveal = false) => {
    try {
      const res = await api<{ account: Account }>(`/accounts/${id}?reveal=${reveal}`);
      setSelectedAccount(res.account);
      if (reveal) {
        showToast('Sensitive vulnerability details unlocked & logged to Audit Trail', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load account detail', 'error');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/accounts', { method: 'POST', body: JSON.stringify(accForm) });
      showToast('Account created');
      setShowNewAccount(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create account failed', 'error');
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/contacts', { method: 'POST', body: JSON.stringify(contactForm) });
      showToast('Contact added');
      setShowNewContact(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create contact failed', 'error');
    }
  };

  const logAccountNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount || !activityNote.trim()) return;
    try {
      await api('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'NOTE',
          subject: activityNote.trim(),
          accountId: selectedAccount.id,
        }),
      });
      setActivityNote('');
      openAccountDetail(selectedAccount.id, !selectedAccount.sensitiveRedacted);
      showToast('Note logged to timeline');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log note', 'error');
    }
  };

  const q = search.toLowerCase().trim();
  const filteredAccounts = accounts.filter(
    (a) => !q || `${a.name} ${a.industry} ${a.country}`.toLowerCase().includes(q)
  );
  const filteredContacts = contacts.filter(
    (c) =>
      !q ||
      `${c.firstName} ${c.lastName} ${c.email} ${c.role} ${c.account?.name || ''}`
        .toLowerCase()
        .includes(q)
  );

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            onClick={() => setTab('accounts')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'accounts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setTab('contacts')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'contacts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Contacts ({contacts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'accounts' ? 'Search companies...' : 'Search contacts or CISOs...'}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-56"
          />
          {!isReadOnly && (
            <button
              onClick={() => (tab === 'accounts' ? setShowNewAccount(true) : setShowNewContact(true))}
              className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tab === 'accounts' ? 'New Account' : 'New Contact'}</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'accounts' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">Company</th>
                  <th className="py-2.5 px-4 text-start">Industry · Size</th>
                  <th className="py-2.5 px-4 text-start">Compliance Frameworks</th>
                  <th className="py-2.5 px-4 text-start">Security Stack</th>
                  <th className="py-2.5 px-4 text-start">Health</th>
                  <th className="py-2.5 px-4 text-end">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAccounts.map((acc) => {
                  const reqs: string[] = JSON.parse(acc.complianceReqs || '[]');
                  return (
                    <tr
                      key={acc.id}
                      onClick={() => openAccountDetail(acc.id, false)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {acc.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {acc.country} · Owner: {acc.owner?.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <div>{acc.industry}</div>
                        <div className="text-[11px] text-slate-400">{acc.size}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {reqs.join(' · ') || 'None specified'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {acc.securityStack || 'Pending discovery'}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        <span
                          className={
                            acc.healthStatus === 'HEALTHY'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : acc.healthStatus === 'AT_RISK'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {acc.healthStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-end font-mono tabular-nums text-slate-500">
                        {acc._count?.deals ?? 0}D · {acc._count?.contacts ?? 0}C ·{' '}
                        {acc._count?.contracts ?? 0}Ctr
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">Contact</th>
                  <th className="py-2.5 px-4 text-start">Account</th>
                  <th className="py-2.5 px-4 text-start">Role &amp; Authority</th>
                  <th className="py-2.5 px-4 text-start">Email &amp; Phone</th>
                  <th className="py-2.5 px-4 text-end">LinkedIn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredContacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="text-[11px] text-slate-400">{c.jobTitle}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-200">
                      {c.account?.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {c.role.replace(/_/g, ' ')}
                      </span>
                      {c.isDecisionMaker && (
                        <span className="text-blue-600 dark:text-blue-400"> · Decision Maker</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      <div>{c.email}</div>
                      <div className="text-slate-400">{c.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-end">
                      {c.linkedinUrl && (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>Profile</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Account 360 Drawer */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full overflow-y-auto p-6 border-s border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {selectedAccount.name}
                </h3>
                <div className="text-xs text-slate-500 mt-1">
                  {selectedAccount.industry} · {selectedAccount.size} · {selectedAccount.country} ·{' '}
                  <span className="font-semibold">{selectedAccount.healthStatus}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAccount(null)}
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-400 mb-1">Compliance Requirements</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {(JSON.parse(selectedAccount.complianceReqs || '[]') as string[]).join(', ')}
                </div>
              </div>
              <div>
                <div className="text-slate-400 mb-1">Current Security Stack</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {selectedAccount.securityStack || 'Not documented'}
                </div>
              </div>
            </div>

            {/* Field-Level Protected Vulnerability Section */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Protected Client Vulnerability &amp; Architecture Notes</span>
                </div>
                {selectedAccount.sensitiveRedacted &&
                  (user?.role === 'ADMIN' ||
                    user?.role === 'SALES_MANAGER' ||
                    (user?.role === 'SALES_REP' && selectedAccount.ownerId === user.id)) && (
                    <button
                      onClick={() => openAccountDetail(selectedAccount.id, true)}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Reveal Sensitive Data</span>
                    </button>
                  )}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                {selectedAccount.vulnerabilityNotes || 'No vulnerability notes recorded.'}
              </div>
            </div>

            {/* Stakeholders / Contacts */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">
                Stakeholders ({selectedAccount.contacts?.length || 0})
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(selectedAccount.contacts || []).map((c) => (
                  <div key={c.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {c.firstName} {c.lastName}
                      </span>{' '}
                      <span className="text-slate-400">
                        · {c.role} {c.isDecisionMaker ? '· Decision Maker' : ''}
                      </span>
                    </div>
                    <span className="font-mono text-slate-500">{c.email}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Deals & Contract History */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">
                Deals &amp; Contract History
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(selectedAccount.deals || []).map((d) => (
                  <div key={d.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium">{d.title}</div>
                      <div className="text-slate-400">{d.stage}</div>
                    </div>
                    <span className="font-mono tabular-nums">
                      {formatMoney(d.value, d.currency, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">Activity Timeline</h4>
              {!isReadOnly && (
                <form onSubmit={logAccountNote} className="flex gap-2 mb-3">
                  <input
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    placeholder="Log note or call summary..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                  >
                    Log Note
                  </button>
                </form>
              )}
              <div className="space-y-2">
                {(selectedAccount.activities || []).map((act) => (
                  <div
                    key={act.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold">
                        {act.type} · {act.subject}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {new Date(act.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {act.description && (
                      <div className="text-slate-500 mt-1">{act.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Account Modal */}
      {showNewAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAccount}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">New B2B Account</h3>
            <input
              required
              placeholder="Company Name"
              value={accForm.name}
              onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Industry"
                value={accForm.industry}
                onChange={(e) => setAccForm({ ...accForm, industry: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <input
                required
                placeholder="Country"
                value={accForm.country}
                onChange={(e) => setAccForm({ ...accForm, country: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <input
              placeholder="Current Security Stack (e.g. CrowdStrike, Splunk)"
              value={accForm.securityStack}
              onChange={(e) => setAccForm({ ...accForm, securityStack: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <textarea
              placeholder="Sensitive Vulnerability / Architecture Notes (Field-Level Protected)"
              value={accForm.vulnerabilityNotes}
              onChange={(e) => setAccForm({ ...accForm, vulnerabilityNotes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewAccount(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Save Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Contact Modal */}
      {showNewContact && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateContact}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Add Stakeholder Contact</h3>
            <select
              required
              value={contactForm.accountId}
              onChange={(e) => setContactForm({ ...contactForm, accountId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="First Name"
                value={contactForm.firstName}
                onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <input
                required
                placeholder="Last Name"
                value={contactForm.lastName}
                onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <select
                value={contactForm.role}
                onChange={(e) =>
                  setContactForm({ ...contactForm, role: e.target.value as Contact['role'] })
                }
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="CISO">CISO</option>
                <option value="IT_MANAGER">IT Manager</option>
                <option value="CFO">CFO</option>
                <option value="PROCUREMENT">Procurement</option>
                <option value="CTO">CTO</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={contactForm.isDecisionMaker}
                onChange={(e) =>
                  setContactForm({ ...contactForm, isDecisionMaker: e.target.checked })
                }
              />
              <span>Decision Maker</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewContact(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Save Contact
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
