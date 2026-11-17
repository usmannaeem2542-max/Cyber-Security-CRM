import { CheckCircle2, Plus } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatMoney } from '../lib/currency';
import type { Account, Contract, Deal, Engagement } from '../types/crm';

export function ContractsEngagementsView({
  defaultTab = 'contracts',
}: {
  defaultTab?: 'contracts' | 'engagements';
}) {
  const { user, currency, showToast } = useApp();
  const [tab, setTab] = useState<'contracts' | 'engagements'>(defaultTab);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [renewalWindow, setRenewalWindow] = useState<'ALL' | '30' | '60' | '90'>('ALL');

  const [showNewContract, setShowNewContract] = useState(false);
  const [showNewEngagement, setShowNewEngagement] = useState(false);

  const [contractForm, setContractForm] = useState({
    title: '',
    accountId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    totalValue: 240000,
    currency: 'AED' as 'AED' | 'USD',
    autoRenew: true,
    billingCycle: 'ANNUAL',
  });

  const [engForm, setEngForm] = useState({
    title: '',
    accountId: '',
    dealId: '',
    scope: '',
    assignedConsultants: 'Samir Al-Khatib (Lead OSCP)',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const isReadOnly = user?.role === 'READ_ONLY';

  const load = useCallback(async () => {
    try {
      const [cRes, eRes, aRes, dRes] = await Promise.all([
        api<{ contracts: Contract[] }>('/contracts'),
        api<{ engagements: Engagement[] }>('/engagements'),
        api<{ accounts: Account[] }>('/accounts'),
        api<{ deals: Deal[] }>('/deals'),
      ]);
      setContracts(cRes.contracts);
      setEngagements(eRes.engagements);
      setAccounts(aRes.accounts);
      setDeals(dRes.deals.filter((d) => d.stage === 'CLOSED_WON'));
      if (aRes.accounts.length > 0 && !contractForm.accountId) {
        setContractForm((f) => ({ ...f, accountId: aRes.accounts[0].id }));
        setEngForm((f) => ({ ...f, accountId: aRes.accounts[0].id }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load data', 'error');
    }
  }, [showToast, contractForm.accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const daysUntil = (endDate: string) =>
    Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);

  const filteredContracts = contracts.filter((c) => {
    if (renewalWindow === 'ALL') return true;
    const days = daysUntil(c.endDate);
    return days >= 0 && days <= Number(renewalWindow);
  });

  const totalMrr = contracts
    .filter((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON')
    .reduce((sum, c) => sum + c.mrr, 0);
  const totalArr = contracts
    .filter((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON')
    .reduce((sum, c) => sum + c.arr, 0);

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/contracts', { method: 'POST', body: JSON.stringify(contractForm) });
      showToast('Contract created');
      setShowNewContract(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create contract failed', 'error');
    }
  };

  const handleCreateEngagement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/engagements', {
        method: 'POST',
        body: JSON.stringify({
          ...engForm,
          dealId: engForm.dealId || null,
          assignedConsultants: engForm.assignedConsultants.split(',').map((s) => s.trim()),
        }),
      });
      showToast('Delivery engagement created');
      setShowNewEngagement(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create engagement failed', 'error');
    }
  };

  const updateEngagement = async (
    id: string,
    patch: { status?: Engagement['status']; reportDelivered?: boolean }
  ) => {
    if (isReadOnly) return;
    try {
      await api(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      showToast('Engagement updated');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            onClick={() => setTab('contracts')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'contracts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Contracts &amp; Renewals ({contracts.length})
          </button>
          <button
            onClick={() => setTab('engagements')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'engagements'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Delivery Engagements ({engagements.length})
          </button>
        </div>

        {!isReadOnly && (
          <button
            onClick={() =>
              tab === 'contracts' ? setShowNewContract(true) : setShowNewEngagement(true)
            }
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{tab === 'contracts' ? 'New Contract' : 'New Engagement'}</span>
          </button>
        )}
      </div>

      {tab === 'contracts' ? (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Active MRR</div>
              <div className="text-xl font-mono font-bold tabular-nums mt-1">
                {formatMoney(totalMrr, 'AED', currency)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Active ARR</div>
              <div className="text-xl font-mono font-bold tabular-nums mt-1">
                {formatMoney(totalArr, 'AED', currency)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Renewal Alert Filter</div>
                <div className="mt-1.5 flex gap-1">
                  {(['ALL', '30', '60', '90'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setRenewalWindow(w)}
                      className={`px-2 py-1 text-xs rounded ${
                        renewalWindow === w
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {w === 'ALL' ? 'All' : `${w}d`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                    <th className="py-2.5 px-4 text-start">Contract</th>
                    <th className="py-2.5 px-4 text-start">Account</th>
                    <th className="py-2.5 px-4 text-end">MRR</th>
                    <th className="py-2.5 px-4 text-end">ARR</th>
                    <th className="py-2.5 px-4 text-start">Renewal Window</th>
                    <th className="py-2.5 px-4 text-start">Auto-Renew</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredContracts.map((c) => {
                    const days = daysUntil(c.endDate);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold">{c.contractNumber}</div>
                          <div className="text-[11px] text-slate-400">{c.title}</div>
                        </td>
                        <td className="py-3 px-4 font-medium">{c.account?.name}</td>
                        <td className="py-3 px-4 text-end font-mono tabular-nums">
                          {formatMoney(c.mrr, c.currency, currency)}
                        </td>
                        <td className="py-3 px-4 text-end font-mono tabular-nums">
                          {formatMoney(c.arr, c.currency, currency)}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span
                            className={
                              days <= 30
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : days <= 60
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {days}d ({new Date(c.endDate).toLocaleDateString()})
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {c.autoRenew ? 'Enabled' : 'Manual Review'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">Engagement &amp; Scope</th>
                  <th className="py-2.5 px-4 text-start">Account &amp; Linked Deal</th>
                  <th className="py-2.5 px-4 text-start">Consultants</th>
                  <th className="py-2.5 px-4 text-start">Delivery Status</th>
                  <th className="py-2.5 px-4 text-end">Report Delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {engagements.map((eng) => {
                  const consultants: string[] = JSON.parse(eng.assignedConsultants || '[]');
                  return (
                    <tr key={eng.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {eng.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{eng.scope}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{eng.account?.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {eng.deal?.title || 'Direct SOW'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {consultants.join(', ')}
                      </td>
                      <td className="py-3 px-4">
                        {!isReadOnly ? (
                          <select
                            value={eng.status}
                            onChange={(e) =>
                              updateEngagement(eng.id, {
                                status: e.target.value as Engagement['status'],
                              })
                            }
                            className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                          >
                            <option value="KICKOFF">Kickoff</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="REPORTING">Reporting</option>
                            <option value="DELIVERED">Delivered</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                        ) : (
                          <span>{eng.status}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-end">
                        <button
                          disabled={isReadOnly}
                          onClick={() =>
                            updateEngagement(eng.id, { reportDelivered: !eng.reportDelivered })
                          }
                          className={`inline-flex items-center gap-1 font-medium ${
                            eng.reportDelivered
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 hover:text-blue-600'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{eng.reportDelivered ? 'Delivered' : 'Mark Delivered'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Contract Modal */}
      {showNewContract && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateContract}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Register Service Contract</h3>
            <input
              required
              placeholder="Contract Title"
              value={contractForm.title}
              onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <select
              required
              value={contractForm.accountId}
              onChange={(e) => setContractForm({ ...contractForm, accountId: e.target.value })}
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
                type="date"
                required
                value={contractForm.startDate}
                onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
              <input
                type="date"
                required
                value={contractForm.endDate}
                onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <input
              type="number"
              required
              placeholder="Annual / Total Value"
              value={contractForm.totalValue}
              onChange={(e) =>
                setContractForm({ ...contractForm, totalValue: Number(e.target.value) })
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewContract(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Save Contract
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Engagement Modal */}
      {showNewEngagement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEngagement}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Launch Delivery Engagement</h3>
            <input
              required
              placeholder="Engagement Title"
              value={engForm.title}
              onChange={(e) => setEngForm({ ...engForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <select
              required
              value={engForm.accountId}
              onChange={(e) => setEngForm({ ...engForm, accountId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={engForm.dealId}
              onChange={(e) => setEngForm({ ...engForm, dealId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="">Link to Won Deal (Optional)...</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <textarea
              required
              placeholder="Delivery Scope"
              value={engForm.scope}
              onChange={(e) => setEngForm({ ...engForm, scope: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <input
              placeholder="Assigned Consultants (comma-separated)"
              value={engForm.assignedConsultants}
              onChange={(e) => setEngForm({ ...engForm, assignedConsultants: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewEngagement(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Create Engagement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
