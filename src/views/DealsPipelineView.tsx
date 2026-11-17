import { Plus, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatCompactMoney, formatMoney } from '../lib/currency';
import { t } from '../lib/i18n';
import type { Account, Deal, DealStage } from '../types/crm';

const STAGES: Array<{ id: DealStage; label: string }> = [
  { id: 'PROSPECTING', label: 'Prospecting' },
  { id: 'DISCOVERY', label: 'Discovery' },
  { id: 'SCOPING', label: 'Scoping' },
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'NEGOTIATION', label: 'Negotiation' },
  { id: 'CLOSED_WON', label: 'Closed Won' },
  { id: 'CLOSED_LOST', label: 'Closed Lost' },
];

export function DealsPipelineView() {
  const { user, currency, language, showToast } = useApp();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [lostPrompt, setLostPrompt] = useState<{ dealId: string; reason: string } | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const [form, setForm] = useState({
    title: '',
    accountId: '',
    serviceType: 'Managed SOC/MDR',
    value: 180000,
    currency: 'AED' as 'AED' | 'USD',
    stage: 'PROSPECTING' as DealStage,
    probability: 20,
    expectedCloseDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
    competitors: '',
    internalMargin: 38,
  });

  const isReadOnly = user?.role === 'READ_ONLY';

  const load = useCallback(async () => {
    try {
      const [dealRes, accRes] = await Promise.all([
        api<{ deals: Deal[] }>('/deals'),
        api<{ accounts: Account[] }>('/accounts'),
      ]);
      setDeals(dealRes.deals);
      setAccounts(accRes.accounts);
      if (accRes.accounts.length > 0 && !form.accountId) {
        setForm((f) => ({ ...f, accountId: accRes.accounts[0].id }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load pipeline', 'error');
    }
  }, [showToast, form.accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const moveDealToStage = async (dealId: string, nextStage: DealStage, lostReason?: string) => {
    if (isReadOnly) return;
    if (nextStage === 'CLOSED_LOST' && !lostReason) {
      setLostPrompt({ dealId, reason: '' });
      return;
    }
    try {
      await api(`/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: nextStage, ...(lostReason ? { lostReason } : {}) }),
      });
      showToast(`Deal moved to ${nextStage.replace(/_/g, ' ')}`);
      load();
      if (selectedDeal?.id === dealId) {
        const res = await api<{ deal: Deal }>(`/deals/${dealId}`);
        setSelectedDeal(res.deal);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update stage', 'error');
    }
  };

  const openDealDetail = async (id: string) => {
    try {
      const res = await api<{ deal: Deal }>(`/deals/${id}`);
      setSelectedDeal(res.deal);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load deal details', 'error');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/deals', { method: 'POST', body: JSON.stringify(form) });
      showToast('Deal added to pipeline');
      setShowCreate(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create deal failed', 'error');
    }
  };

  const logDealNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeal || !noteInput.trim()) return;
    try {
      await api('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'NOTE',
          subject: noteInput.trim(),
          dealId: selectedDeal.id,
          accountId: selectedDeal.accountId,
        }),
      });
      setNoteInput('');
      openDealDetail(selectedDeal.id);
      showToast('Activity logged');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log note', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'kanban'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            {t(language, 'kanbanView')}
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            {t(language, 'tableView')}
          </button>
        </div>

        {!isReadOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Deal</span>
          </button>
        )}
      </div>

      {viewMode === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.id);
            const stageSum = stageDeals.reduce((sum, d) => {
              const inAed = d.currency === 'USD' ? d.value / 0.272294 : d.value;
              return sum + inAed;
            }, 0);

            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragDealId) {
                    moveDealToStage(dragDealId, stage.id);
                    setDragDealId(null);
                  }
                }}
                className="w-68 shrink-0 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2.5 min-h-[460px]"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {stage.label}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {stageDeals.length} deals · {formatCompactMoney(stageSum, 'AED', currency)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 flex-1">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable={!isReadOnly}
                      onDragStart={() => setDragDealId(deal.id)}
                      onClick={() => openDealDetail(deal.id)}
                      className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-colors space-y-1.5"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {deal.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {deal.account?.name} · {deal.serviceType}
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[11px] font-mono tabular-nums">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatMoney(deal.value, deal.currency, currency)}
                        </span>
                        <span className="text-slate-400">{deal.probability}%</span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{deal.owner?.name}</span>
                        <span>{new Date(deal.expectedCloseDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">Deal</th>
                  <th className="py-2.5 px-4 text-start">Account · Service</th>
                  <th className="py-2.5 px-4 text-start">Stage</th>
                  <th className="py-2.5 px-4 text-end">Value</th>
                  <th className="py-2.5 px-4 text-end">Prob.</th>
                  <th className="py-2.5 px-4 text-end">Close Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deals.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => openDealDetail(d.id)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {d.title}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {d.account?.name} · {d.serviceType}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-blue-600 dark:text-blue-400">
                      {d.stage.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2.5 px-4 text-end font-mono tabular-nums">
                      {formatMoney(d.value, d.currency, currency)}
                    </td>
                    <td className="py-2.5 px-4 text-end font-mono tabular-nums">
                      {d.probability}%
                    </td>
                    <td className="py-2.5 px-4 text-end font-mono text-slate-500">
                      {new Date(d.expectedCloseDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deal Detail Drawer */}
      {selectedDeal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full overflow-y-auto p-6 border-s border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-display text-lg font-bold">{selectedDeal.title}</h3>
                <div className="text-xs text-slate-500 mt-1">
                  {selectedDeal.account?.name} · {selectedDeal.serviceType}
                </div>
              </div>
              <button onClick={() => setSelectedDeal(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-400">Deal Value</div>
                <div className="text-base font-mono font-bold tabular-nums mt-0.5">
                  {formatMoney(selectedDeal.value, selectedDeal.currency, currency)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Internal Margin (Protected)</div>
                <div className="text-base font-mono font-bold tabular-nums mt-0.5">
                  {selectedDeal.marginRedacted
                    ? '[REDACTED]'
                    : `${selectedDeal.internalMargin ?? 35}%`}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Competitors</div>
                <div className="font-medium mt-0.5">{selectedDeal.competitors || 'None listed'}</div>
              </div>
              <div>
                <div className="text-slate-400">Stage</div>
                {!isReadOnly ? (
                  <select
                    value={selectedDeal.stage}
                    onChange={(e) =>
                      moveDealToStage(selectedDeal.id, e.target.value as DealStage)
                    }
                    className="mt-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="font-medium mt-0.5">{selectedDeal.stage}</div>
                )}
              </div>
            </div>

            {selectedDeal.lostReason && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                Lost Reason: {selectedDeal.lostReason}
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">
                Stakeholders ({selectedDeal.account?.contacts?.length || 0})
              </h4>
              <div className="space-y-1 text-xs">
                {(selectedDeal.account?.contacts || []).map((c) => (
                  <div key={c.id} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span>
                      {c.firstName} {c.lastName} · {c.role}
                    </span>
                    <span className="font-mono text-slate-400">{c.email}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">Deal Activity Timeline</h4>
              {!isReadOnly && (
                <form onSubmit={logDealNote} className="flex gap-2 mb-3">
                  <input
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Log meeting, call, or scoping note..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                  >
                    Log
                  </button>
                </form>
              )}
              <div className="space-y-2">
                {(selectedDeal.activities || []).map((a) => (
                  <div
                    key={a.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div className="flex justify-between font-medium">
                      <span>
                        {a.type} · {a.subject}
                      </span>
                      <span className="font-mono text-slate-400">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {lostPrompt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
            <h3 className="font-display text-base font-bold">Record Closed Lost Reason</h3>
            <input
              required
              placeholder="e.g., Price, Incumbent MSSP, Budget Freeze"
              value={lostPrompt.reason}
              onChange={(e) => setLostPrompt({ ...lostPrompt, reason: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLostPrompt(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const p = lostPrompt;
                  setLostPrompt(null);
                  moveDealToStage(p.dealId, 'CLOSED_LOST', p.reason || 'Unspecified');
                }}
                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg"
              >
                Mark Closed Lost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Deal Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Create New Deal</h3>
            <input
              required
              placeholder="Deal Title (e.g., DIFC Bank — Managed SOC)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <select
              required
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
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
                placeholder="Service Type"
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <input
                type="number"
                required
                value={form.value}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                required
                value={form.expectedCloseDate}
                onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
              <input
                placeholder="Competitors"
                value={form.competitors}
                onChange={(e) => setForm({ ...form, competitors: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Save Deal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
