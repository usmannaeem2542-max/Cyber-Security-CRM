import { FileDown, Plus, Send, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatMoney } from '../lib/currency';
import { exportQuotePdf } from '../lib/export';
import type { Deal, Quote, ServiceCatalogItem } from '../types/crm';

export function CatalogQuotesView({ defaultTab = 'catalog' }: { defaultTab?: 'catalog' | 'quotes' }) {
  const { user, currency, showToast } = useApp();
  const [tab, setTab] = useState<'catalog' | 'quotes'>(defaultTab);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  const [showNewService, setShowNewService] = useState(false);
  const [showNewQuote, setShowNewQuote] = useState(false);

  const [svcForm, setSvcForm] = useState({
    code: '',
    name: '',
    category: 'OFFENSIVE_SECURITY',
    description: '',
    unitType: 'PER_ASSET',
    unitPriceAED: 15000,
    unitPriceUSD: 4085,
  });

  const [quoteForm, setQuoteForm] = useState({
    title: '',
    dealId: '',
    currency: 'AED' as 'AED' | 'USD',
    discountPercent: 5,
    taxPercent: 5,
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    terms: '50% upon SOW execution, 50% upon final report delivery. Net 30 days.',
    items: [] as Array<{
      serviceId: string;
      description: string;
      unitType: string;
      quantity: number;
      unitPrice: number;
    }>,
  });

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const isReadOnly = user?.role === 'READ_ONLY';
  const canEditCatalog = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';

  const load = useCallback(async () => {
    try {
      const [svcRes, qtRes, dealRes] = await Promise.all([
        api<{ services: ServiceCatalogItem[] }>('/services'),
        api<{ quotes: Quote[] }>('/quotes'),
        api<{ deals: Deal[] }>('/deals'),
      ]);
      setServices(svcRes.services);
      setQuotes(qtRes.quotes);
      setDeals(dealRes.deals);
      if (dealRes.deals.length > 0 && !quoteForm.dealId) {
        const d = dealRes.deals[0];
        setQuoteForm((q) => ({
          ...q,
          dealId: d.id,
          title: `${d.title} — Commercial Proposal`,
        }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load catalog & quotes', 'error');
    }
  }, [showToast, quoteForm.dealId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/services', { method: 'POST', body: JSON.stringify(svcForm) });
      showToast('Service package added to catalog');
      setShowNewService(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add service', 'error');
    }
  };

  const addServiceLineToQuote = (svcId: string) => {
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return;
    const price = quoteForm.currency === 'USD' ? svc.unitPriceUSD : svc.unitPriceAED;
    setQuoteForm((q) => ({
      ...q,
      items: [
        ...q.items,
        {
          serviceId: svc.id,
          description: svc.name,
          unitType: svc.unitType,
          quantity: 1,
          unitPrice: price,
        },
      ],
    }));
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    const deal = deals.find((d) => d.id === quoteForm.dealId);
    if (!deal || quoteForm.items.length === 0) {
      showToast('Select a deal and add at least one service line item', 'error');
      return;
    }
    try {
      await api('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          ...quoteForm,
          accountId: deal.accountId,
          status: 'DRAFT',
        }),
      });
      showToast('Quote generated');
      setShowNewQuote(false);
      setQuoteForm((q) => ({ ...q, items: [] }));
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create quote', 'error');
    }
  };

  const updateQuoteStatus = async (quoteId: string, status: Quote['status']) => {
    if (isReadOnly) return;
    try {
      const res = await api<{ autoTaskCreated: boolean }>(`/quotes/${quoteId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.autoTaskCreated) {
        showToast('Proposal marked SENT — automated 3-day follow-up task created!');
      } else {
        showToast(`Quote status updated to ${status}`);
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            onClick={() => setTab('catalog')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'catalog'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Services &amp; Pricing Catalog ({services.length})
          </button>
          <button
            onClick={() => setTab('quotes')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'quotes'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Quotes &amp; Proposals ({quotes.length})
          </button>
        </div>

        {tab === 'catalog' && canEditCatalog && (
          <button
            onClick={() => setShowNewService(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Service Package</span>
          </button>
        )}

        {tab === 'quotes' && !isReadOnly && (
          <button
            onClick={() => setShowNewQuote(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Build Quote</span>
          </button>
        )}
      </div>

      {tab === 'catalog' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc) => {
            const deliverables: string[] = JSON.parse(svc.deliverables || '[]');
            return (
              <div
                key={svc.id}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>{svc.code}</span>
                    <span>{svc.category.replace(/_/g, ' ')}</span>
                  </div>
                  <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    {svc.name}
                  </h3>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {svc.description}
                  </p>
                  {deliverables.length > 0 && (
                    <div className="mt-3 text-[11px] text-slate-600 dark:text-slate-300">
                      Deliverables: {deliverables.join(' · ')}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
                  <div>
                    <span className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(
                        currency === 'USD' ? svc.unitPriceUSD : svc.unitPriceAED,
                        currency,
                        currency
                      )}
                    </span>
                    <span className="text-[11px] text-slate-400 ms-1.5">
                      / {svc.unitType.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  {!isReadOnly && (
                    <button
                      onClick={() => {
                        setTab('quotes');
                        setShowNewQuote(true);
                        addServiceLineToQuote(svc.id);
                      }}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Add to Quote
                    </button>
                  )}
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
                  <th className="py-2.5 px-4 text-start">Quote #</th>
                  <th className="py-2.5 px-4 text-start">Proposal &amp; Account</th>
                  <th className="py-2.5 px-4 text-start">Status</th>
                  <th className="py-2.5 px-4 text-end">Total</th>
                  <th className="py-2.5 px-4 text-end">Valid Until</th>
                  <th className="py-2.5 px-4 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {quotes.map((qt) => (
                  <tr key={qt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {qt.quoteNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {qt.title}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {qt.account?.name} · {qt.items.length} line item(s) · Discount{' '}
                        {qt.discountPercent}% · VAT {qt.taxPercent}%
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          qt.status === 'ACCEPTED'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : qt.status === 'REJECTED'
                              ? 'text-red-600 dark:text-red-400'
                              : qt.status === 'SENT'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500'
                        }`}
                      >
                        {qt.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-semibold tabular-nums">
                      {formatMoney(qt.total, qt.currency, currency)}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-slate-500">
                      {new Date(qt.validUntil).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-end">
                      <div className="inline-flex items-center gap-2.5">
                        {!isReadOnly && qt.status === 'DRAFT' && (
                          <button
                            onClick={() => updateQuoteStatus(qt.id, 'SENT')}
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Mark Sent</span>
                          </button>
                        )}
                        {!isReadOnly && qt.status === 'SENT' && (
                          <button
                            onClick={() => updateQuoteStatus(qt.id, 'ACCEPTED')}
                            className="text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Accept
                          </button>
                        )}
                        <button
                          onClick={() => exportQuotePdf(qt, currency)}
                          className="text-slate-600 dark:text-slate-300 hover:text-blue-600 inline-flex items-center gap-1"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showNewService && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateService}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">New Catalog Service</h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Code (e.g. SVC-RED-TEAM)"
                value={svcForm.code}
                onChange={(e) => setSvcForm({ ...svcForm, code: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
              <select
                value={svcForm.unitType}
                onChange={(e) => setSvcForm({ ...svcForm, unitType: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="PER_ASSET">Per Asset</option>
                <option value="PER_IP">Per IP</option>
                <option value="PER_USER">Per User</option>
                <option value="PER_DAY">Per Day</option>
                <option value="FIXED_RETAINER">Fixed Retainer</option>
              </select>
            </div>
            <input
              required
              placeholder="Service Name"
              value={svcForm.name}
              onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <textarea
              required
              placeholder="Scope & Methodology Description"
              value={svcForm.description}
              onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                required
                placeholder="Unit Price AED"
                value={svcForm.unitPriceAED}
                onChange={(e) => setSvcForm({ ...svcForm, unitPriceAED: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
              <input
                type="number"
                required
                placeholder="Unit Price USD"
                value={svcForm.unitPriceUSD}
                onChange={(e) => setSvcForm({ ...svcForm, unitPriceUSD: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewService(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Save Service
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quote Builder Modal */}
      {showNewQuote && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateQuote}
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-display text-lg font-bold">Commercial Quote Builder</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-medium">Linked Deal</label>
                <select
                  required
                  value={quoteForm.dealId}
                  onChange={(e) => {
                    const d = deals.find((x) => x.id === e.target.value);
                    setQuoteForm({
                      ...quoteForm,
                      dealId: e.target.value,
                      title: d ? `${d.title} — Proposal` : quoteForm.title,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 font-medium">Quote Title</label>
                <input
                  required
                  value={quoteForm.title}
                  onChange={(e) => setQuoteForm({ ...quoteForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 font-medium">Add Service from Catalog</label>
              <select
                onChange={(e) => {
                  if (e.target.value) addServiceLineToQuote(e.target.value);
                  e.target.value = '';
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="">+ Select service package to append line item...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name} ({quoteForm.currency === 'USD' ? s.unitPriceUSD : s.unitPriceAED} / {s.unitType})
                  </option>
                ))}
              </select>
            </div>

            {quoteForm.items.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                {quoteForm.items.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center gap-2">
                    <input
                      value={item.description}
                      onChange={(e) => {
                        const next = [...quoteForm.items];
                        next[idx].description = e.target.value;
                        setQuoteForm({ ...quoteForm, items: next });
                      }}
                      className="flex-1 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const next = [...quoteForm.items];
                        next[idx].quantity = Number(e.target.value);
                        setQuoteForm({ ...quoteForm, items: next });
                      }}
                      className="w-20 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      value={item.unitPrice}
                      onChange={(e) => {
                        const next = [...quoteForm.items];
                        next[idx].unitPrice = Number(e.target.value);
                        setQuoteForm({ ...quoteForm, items: next });
                      }}
                      className="w-24 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setQuoteForm({
                          ...quoteForm,
                          items: quoteForm.items.filter((_, i) => i !== idx),
                        })
                      }
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block mb-1 font-medium">Discount %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={quoteForm.discountPercent}
                  onChange={(e) =>
                    setQuoteForm({ ...quoteForm, discountPercent: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">VAT / Tax %</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={quoteForm.taxPercent}
                  onChange={(e) =>
                    setQuoteForm({ ...quoteForm, taxPercent: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Valid Until</label>
                <input
                  type="date"
                  value={quoteForm.validUntil}
                  onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewQuote(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Create Draft Quote
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
