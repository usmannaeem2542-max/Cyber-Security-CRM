import { Download, Plus } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatCompactMoney, formatMoney } from '../lib/currency';
import type { AudienceSegment, Campaign, ContentAsset, EmailTemplate } from '../types/crm';

export function MarketingView() {
  const { user, currency, showToast } = useApp();
  const [subTab, setSubTab] = useState<'campaigns' | 'templates' | 'segments' | 'content'>(
    'campaigns'
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [segments, setSegments] = useState<AudienceSegment[]>([]);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewVars, setPreviewVars] = useState({
    firstName: 'Amira',
    companyName: 'Emirates Crescent Bank',
    serviceInterest: '24/7 Managed SOC / MDR',
    industry: 'Banking & Finance',
    senderName: user?.name || 'Zaid Khoury',
  });

  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campForm, setCampForm] = useState({
    name: '',
    type: 'WEBINAR',
    budget: 25000,
    currency: 'AED' as 'AED' | 'USD',
    startDate: new Date().toISOString().slice(0, 10),
    targetIndustry: 'Banking & Finance',
  });

  const isReadOnly = user?.role === 'READ_ONLY';

  const load = useCallback(async () => {
    try {
      const res = await api<{
        campaigns: Campaign[];
        templates: EmailTemplate[];
        segments: AudienceSegment[];
        assets: ContentAsset[];
      }>('/marketing/overview');
      setCampaigns(res.campaigns);
      setTemplates(res.templates);
      setSegments(res.segments);
      setAssets(res.assets);
      if (res.templates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(res.templates[0]);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load marketing hub', 'error');
    }
  }, [showToast, selectedTemplate]);

  useEffect(() => {
    load();
  }, [load]);

  const renderMerged = (text: string) =>
    text
      .replace(/\{\{firstName\}\}/g, previewVars.firstName)
      .replace(/\{\{companyName\}\}/g, previewVars.companyName)
      .replace(/\{\{serviceInterest\}\}/g, previewVars.serviceInterest)
      .replace(/\{\{industry\}\}/g, previewVars.industry)
      .replace(/\{\{senderName\}\}/g, previewVars.senderName);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/marketing/campaigns', { method: 'POST', body: JSON.stringify(campForm) });
      showToast('Campaign launched');
      setShowNewCampaign(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create campaign failed', 'error');
    }
  };

  const trackAssetDownload = async (id: string) => {
    try {
      await api(`/marketing/assets/${id}/download`, { method: 'POST' });
      showToast('Asset link copied & download tracked');
      load();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          {(
            [
              ['campaigns', `Campaigns & ROI (${campaigns.length})`],
              ['templates', `Email Templates (${templates.length})`],
              ['segments', `Audience Segments (${segments.length})`],
              ['content', `Content Library (${assets.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subTab === id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === 'campaigns' && !isReadOnly && (
          <button
            onClick={() => setShowNewCampaign(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>
        )}
      </div>

      {subTab === 'campaigns' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">Campaign</th>
                  <th className="py-2.5 px-4 text-start">Type · Status</th>
                  <th className="py-2.5 px-4 text-end">Budget</th>
                  <th className="py-2.5 px-4 text-end">Leads (Qual.)</th>
                  <th className="py-2.5 px-4 text-end">Attributed Pipeline</th>
                  <th className="py-2.5 px-4 text-end">Won Revenue</th>
                  <th className="py-2.5 px-4 text-end">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {c.targetIndustry || 'Multi-Sector'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {c.type} ·{' '}
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-end font-mono tabular-nums">
                      {formatMoney(c.budget, c.currency, currency)}
                    </td>
                    <td className="py-3 px-4 text-end font-mono tabular-nums">
                      {c.leadCount} ({c.qualifiedCount})
                    </td>
                    <td className="py-3 px-4 text-end font-mono tabular-nums">
                      {formatCompactMoney(c.pipelineAED, 'AED', currency)}
                    </td>
                    <td className="py-3 px-4 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCompactMoney(c.wonAED, 'AED', currency)}
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-semibold tabular-nums">
                      <span
                        className={
                          c.roiPercent >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {c.roiPercent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'templates' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl)}
                className={`w-full text-start p-3.5 rounded-xl border transition-colors ${
                  selectedTemplate?.id === tpl.id
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {tpl.name}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{tpl.category}</div>
              </button>
            ))}
          </div>

          {selectedTemplate && (
            <div className="lg:col-span-2 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <input
                  value={previewVars.firstName}
                  onChange={(e) => setPreviewVars({ ...previewVars, firstName: e.target.value })}
                  placeholder="firstName"
                  className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <input
                  value={previewVars.companyName}
                  onChange={(e) => setPreviewVars({ ...previewVars, companyName: e.target.value })}
                  placeholder="companyName"
                  className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <input
                  value={previewVars.serviceInterest}
                  onChange={(e) =>
                    setPreviewVars({ ...previewVars, serviceInterest: e.target.value })
                  }
                  placeholder="serviceInterest"
                  className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Subject: {renderMerged(selectedTemplate.subject)}
                </div>
                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {renderMerged(selectedTemplate.body)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'segments' && (
        <div className="grid md:grid-cols-3 gap-4">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {seg.name}
              </div>
              <div className="text-xs text-slate-500">{seg.description}</div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {[seg.criteriaIndustry, seg.criteriaService, seg.criteriaStage]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {seg.matchingCount} matches
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'content' && (
        <div className="grid md:grid-cols-2 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="text-[11px] font-mono text-slate-400">
                  {asset.type} · {asset.serviceCategory}
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {asset.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5">{asset.summary}</p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">{asset.downloads} downloads</span>
                <button
                  onClick={() => trackAssetDownload(asset.id)}
                  className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Track Share / Download</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewCampaign && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCampaign}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Launch Marketing Campaign</h3>
            <input
              required
              placeholder="Campaign Name"
              value={campForm.name}
              onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={campForm.type}
                onChange={(e) => setCampForm({ ...campForm, type: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="WEBINAR">Webinar</option>
                <option value="EMAIL">Email</option>
                <option value="LINKEDIN">LinkedIn</option>
                <option value="EVENT">Event</option>
                <option value="CONTENT">Content</option>
              </select>
              <input
                type="number"
                required
                value={campForm.budget}
                onChange={(e) => setCampForm({ ...campForm, budget: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <input
              placeholder="Target Industry"
              value={campForm.targetIndustry}
              onChange={(e) => setCampForm({ ...campForm, targetIndustry: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewCampaign(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Create Campaign
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
