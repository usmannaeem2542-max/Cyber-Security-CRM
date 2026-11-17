import { ArrowRightLeft, Download, Plus, Trash2, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatMoney } from '../lib/currency';
import { exportToCsv } from '../lib/export';
import { t } from '../lib/i18n';
import type { Lead, SavedFilter } from '../types/crm';

const LEAD_STATUSES = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'] as const;
const LEAD_SOURCES = [
  'ALL',
  'WEBINAR',
  'LINKEDIN',
  'EMAIL_CAMPAIGN',
  'EVENT',
  'INBOUND_WEB',
  'PARTNER',
  'COLD_OUTREACH',
];

export function LeadsView() {
  const { user, currency, language, showToast, setActiveModule } = useApp();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [directory, setDirectory] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'budget' | 'createdAt'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [csvText, setCsvText] = useState(
    'firstName,lastName,email,companyName,industry,companySize,serviceInterest,estimatedBudget\nNasser,Al-Ghamdi,nasser@gulfbank.ae,Gulf Premier Bank,Banking & Finance,ENTERPRISE,Managed SOC/MDR,280000'
  );

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    jobTitle: 'CISO',
    industry: 'Banking & Finance',
    companySize: 'ENTERPRISE' as Lead['companySize'],
    country: 'UAE',
    source: 'INBOUND_WEB',
    serviceInterest: 'Web & API Penetration Testing',
    estimatedBudget: 150000,
    currency: 'AED' as 'AED' | 'USD',
    engagementScore: 70,
    notes: '',
  });

  const [convertForm, setConvertForm] = useState({
    dealTitle: '',
    dealValue: 150000,
    expectedCloseDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
  });

  const isReadOnly = user?.role === 'READ_ONLY';
  const canAssign = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRes, dirRes, filterRes] = await Promise.all([
        api<{ leads: Lead[] }>('/leads'),
        api<{ users: Array<{ id: string; name: string; role: string }> }>('/auth/users/directory'),
        api<{ filters: SavedFilter[] }>('/saved-filters?module=leads'),
      ]);
      setLeads(leadRes.leads);
      setDirectory(dirRes.users);
      setSavedFilters(filterRes.filters);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load leads', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = leads.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL' && l.source !== sourceFilter) return false;
      if (
        q &&
        !`${l.firstName} ${l.lastName} ${l.companyName} ${l.email} ${l.serviceInterest}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'score') return (a.score - b.score) * mul;
      if (sortBy === 'budget') return (a.estimatedBudget - b.estimatedBudget) * mul;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mul;
    });
    return list;
  }, [leads, statusFilter, sourceFilter, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const paginatedLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/leads', { method: 'POST', body: JSON.stringify(form) });
      showToast('Lead created & scored');
      setShowCreate(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create failed', 'error');
    }
  };

  const handleCsvImport = async () => {
    try {
      const lines = csvText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        showToast('Provide header row and at least one data row', 'error');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          obj[h] = h === 'estimatedBudget' || h === 'engagementScore' ? Number(cols[i] || 0) : cols[i];
        });
        return obj;
      });
      const res = await api<{ count: number }>('/leads/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      showToast(`Imported ${res.count} leads`);
      setShowImport(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'CSV import failed', 'error');
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (!selectedIds.length || isReadOnly) return;
    try {
      await api('/leads/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, status }),
      });
      showToast(`Updated ${selectedIds.length} leads to ${status}`);
      setSelectedIds([]);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk update failed', 'error');
    }
  };

  const handleBulkAssign = async (ownerId: string) => {
    if (!selectedIds.length || !canAssign || !ownerId) return;
    try {
      await api('/leads/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, ownerId }),
      });
      showToast(`Assigned ${selectedIds.length} leads`);
      setSelectedIds([]);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Assign failed', 'error');
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertLead) return;
    try {
      await api(`/leads/${convertLead.id}/convert`, {
        method: 'POST',
        body: JSON.stringify(convertForm),
      });
      showToast('Converted to Account, Contact & Deal');
      setConvertLead(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Conversion failed', 'error');
    }
  };

  const saveCurrentFilter = async () => {
    const name = `${statusFilter} · ${sourceFilter}`;
    try {
      await api('/saved-filters', {
        method: 'POST',
        body: JSON.stringify({
          name,
          module: 'leads',
          filterJson: JSON.stringify({ statusFilter, sourceFilter, search }),
        }),
      });
      showToast(`Saved filter "${name}"`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save filter failed', 'error');
    }
  };

  const deleteLead = async (id: string) => {
    if (isReadOnly) return;
    try {
      await api(`/leads/${id}`, { method: 'DELETE' });
      showToast('Lead removed');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          {LEAD_STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              exportToCsv(
                'Lead',
                'sentinelshield_leads.csv',
                ['Name', 'Email', 'Company', 'Industry', 'Size', 'Service', 'Score', 'Status', 'Budget'],
                filteredLeads.map((l) => [
                  `${l.firstName} ${l.lastName}`,
                  l.email,
                  l.companyName,
                  l.industry,
                  l.companySize,
                  l.serviceInterest,
                  l.score,
                  l.status,
                  `${l.currency} ${l.estimatedBudget}`,
                ])
              )
            }
            className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t(language, 'exportCsv')}</span>
          </button>

          {!isReadOnly && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t(language, 'importCsv')}</span>
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t(language, 'createNew')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter & Bulk Action Bar */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by name, company, service..."
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-60"
          />
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                Source: {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <button
            onClick={saveCurrentFilter}
            className="px-2.5 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            Save Filter
          </button>
          {savedFilters.map((sf) => (
            <button
              key={sf.id}
              onClick={() => {
                const f = JSON.parse(sf.filterJson);
                setStatusFilter(f.statusFilter || 'ALL');
                setSourceFilter(f.sourceFilter || 'ALL');
                setSearch(f.search || '');
              }}
              className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300 hover:text-blue-600"
            >
              {sf.name}
            </button>
          ))}
        </div>

        {selectedIds.length > 0 && !isReadOnly && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500">{selectedIds.length} selected</span>
            <select
              onChange={(e) => {
                if (e.target.value) handleBulkStatus(e.target.value);
                e.target.value = '';
              }}
              className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="">Set Status...</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="UNQUALIFIED">UNQUALIFIED</option>
            </select>
            {canAssign && (
              <select
                onChange={(e) => {
                  if (e.target.value) handleBulkAssign(e.target.value);
                  e.target.value = '';
                }}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="">Assign Rep...</option>
                {directory.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Leads Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      paginatedLeads.length > 0 &&
                      paginatedLeads.every((l) => selectedIds.includes(l.id))
                    }
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? paginatedLeads.map((l) => l.id) : [])
                    }
                  />
                </th>
                <th className="py-2.5 px-3 text-start">Lead &amp; Company</th>
                <th className="py-2.5 px-3 text-start">Industry &amp; Size</th>
                <th className="py-2.5 px-3 text-start">Service Interest</th>
                <th
                  className="py-2.5 px-3 text-end cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    setSortBy('score');
                    setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
                  }}
                >
                  Score {sortBy === 'score' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
                <th
                  className="py-2.5 px-3 text-end cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    setSortBy('budget');
                    setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
                  }}
                >
                  Est. Budget {sortBy === 'budget' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
                <th className="py-2.5 px-3 text-start">Status · Owner</th>
                <th className="py-2.5 px-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading leads...
                  </td>
                </tr>
              ) : paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No leads match your current filter. Try resetting filters or create a new lead.
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(lead.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked
                              ? [...prev, lead.id]
                              : prev.filter((x) => x !== lead.id)
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {lead.firstName} {lead.lastName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lead.companyName} · {lead.email}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      <div>{lead.industry}</div>
                      <div className="text-[11px] text-slate-400">
                        {lead.companySize} · {lead.country}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200">
                      <div>{lead.serviceInterest}</div>
                      <div className="text-[11px] text-slate-400">
                        {lead.source.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono font-semibold tabular-nums">
                      <span
                        className={
                          lead.score >= 80
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : lead.score >= 60
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-500'
                        }
                      >
                        {lead.score}/100
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {formatMoney(lead.estimatedBudget, lead.currency, currency)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div
                        className={`font-medium ${
                          lead.status === 'QUALIFIED' || lead.status === 'CONVERTED'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : lead.status === 'UNQUALIFIED'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {lead.status}
                      </div>
                      <div className="text-[11px] text-slate-400">{lead.owner?.name}</div>
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <div className="inline-flex items-center gap-2">
                        {!isReadOnly && lead.status !== 'CONVERTED' && (
                          <button
                            onClick={() => {
                              setConvertLead(lead);
                              setConvertForm({
                                dealTitle: `${lead.companyName} — ${lead.serviceInterest}`,
                                dealValue: lead.estimatedBudget || 120000,
                                expectedCloseDate: new Date(Date.now() + 45 * 86400000)
                                  .toISOString()
                                  .slice(0, 10),
                              });
                            }}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Convert</span>
                          </button>
                        )}
                        {lead.status === 'CONVERTED' && (
                          <button
                            onClick={() => setActiveModule('deals')}
                            className="text-xs text-slate-500 hover:text-blue-600 whitespace-nowrap"
                          >
                            View Deal
                          </button>
                        )}
                        {!isReadOnly && (
                          <button
                            onClick={() => deleteLead(lead.id)}
                            className="text-slate-400 hover:text-red-600"
                            title="Delete lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {paginatedLeads.length} of {filteredLeads.length} leads
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-40"
            >
              Prev
            </button>
            <span className="font-mono tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create Lead Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-display text-lg font-bold">Capture New Lead</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block mb-1 font-medium">First Name</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Last Name</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Work Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Company Name</label>
                <input
                  required
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Industry</label>
                <select
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option>Banking &amp; Finance</option>
                  <option>Healthcare</option>
                  <option>Government</option>
                  <option>Fintech</option>
                  <option>Retail</option>
                  <option>Energy &amp; Utilities</option>
                  <option>Technology</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 font-medium">Company Size</label>
                <select
                  value={form.companySize}
                  onChange={(e) =>
                    setForm({ ...form, companySize: e.target.value as Lead['companySize'] })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="SMB">SMB</option>
                  <option value="MID_MARKET">Mid-Market</option>
                  <option value="ENTERPRISE">Enterprise</option>
                  <option value="GOVERNMENT">Government</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 font-medium">Service Interest</label>
                <input
                  required
                  value={form.serviceInterest}
                  onChange={(e) => setForm({ ...form, serviceInterest: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Estimated Budget</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={form.estimatedBudget}
                    onChange={(e) => setForm({ ...form, estimatedBudget: Number(e.target.value) })}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  />
                  <select
                    value={form.currency}
                    onChange={(e) =>
                      setForm({ ...form, currency: e.target.value as 'AED' | 'USD' })
                    }
                    className="px-2 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  >
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {t(language, 'cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg"
              >
                {t(language, 'save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">Import Leads from CSV</h3>
            <p className="text-xs text-slate-500">
              Columns supported: firstName, lastName, email, companyName, industry, companySize,
              serviceInterest, estimatedBudget.
            </p>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg"
              >
                Import Rows
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Lead Modal */}
      {convertLead && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConvert}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold">Convert Lead to Account, Contact &amp; Deal</h3>
            <div className="text-xs text-slate-500">
              Lead: {convertLead.firstName} {convertLead.lastName} ({convertLead.companyName})
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium">Opportunity / Deal Title</label>
                <input
                  required
                  value={convertForm.dealTitle}
                  onChange={(e) => setConvertForm({ ...convertForm, dealTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Deal Value ({convertLead.currency})</label>
                <input
                  type="number"
                  required
                  value={convertForm.dealValue}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, dealValue: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Expected Close Date</label>
                <input
                  type="date"
                  required
                  value={convertForm.expectedCloseDate}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, expectedCloseDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConvertLead(null)}
                className="px-4 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg"
              >
                Confirm Conversion
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
