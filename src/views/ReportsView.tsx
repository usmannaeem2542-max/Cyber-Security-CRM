import { Download, FileDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { convertCurrency, formatMoney } from '../lib/currency';
import { exportTablePdf, exportToCsv } from '../lib/export';
import { t } from '../lib/i18n';

interface ReportsResponse {
  salesPerformance: Array<{
    name: string;
    wonCount: number;
    lostCount: number;
    openCount: number;
    wonAED: number;
    openAED: number;
    winRate: number;
  }>;
  pipelineVelocity: Array<{
    stage: string;
    deals: number;
    avgDays: number;
    valueAED: number;
  }>;
  winLossAnalysis: {
    wonCount: number;
    lostCount: number;
    wonValueAED: number;
    lostValueAED: number;
    lostReasons: Array<{ reason: string; count: number }>;
  };
  leadSourceRoi: Array<{
    source: string;
    leads: number;
    qualified: number;
    wonAED: number;
  }>;
  forecastVsActual: Array<{
    month: string;
    forecastAED: number;
    actualAED: number;
  }>;
}

export function ReportsView() {
  const { currency, language, showToast } = useApp();
  const [data, setData] = useState<ReportsResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<ReportsResponse>('/reports');
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load reports', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <div className="h-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  const forecastSeries = data.forecastVsActual.map((m) => ({
    month: m.month,
    forecast: Math.round(convertCurrency(m.forecastAED, 'AED', currency)),
    actual: Math.round(convertCurrency(m.actualAED, 'AED', currency)),
  }));

  const velocitySeries = data.pipelineVelocity.map((v) => ({
    stage: v.stage.replace('CLOSED_', '').replace(/_/g, ' '),
    avgDays: v.avgDays,
    deals: v.deals,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Executive Revenue &amp; Pipeline Analytics
          </h2>
          <p className="text-xs text-slate-500">
            Sales performance, velocity, win/loss drivers, source ROI, and forecast accuracy
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCsv(
                'Reports',
                'sentinelshield_sales_performance.csv',
                ['Rep', 'Won Deals', 'Lost Deals', 'Open Deals', 'Win Rate %', `Won (${currency})`, `Open (${currency})`],
                data.salesPerformance.map((r) => [
                  r.name,
                  r.wonCount,
                  r.lostCount,
                  r.openCount,
                  `${r.winRate}%`,
                  Math.round(convertCurrency(r.wonAED, 'AED', currency)),
                  Math.round(convertCurrency(r.openAED, 'AED', currency)),
                ])
              )
            }
            className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t(language, 'exportCsv')}</span>
          </button>
          <button
            onClick={() =>
              exportTablePdf(
                'Reports',
                `Sales Performance Report (${currency})`,
                'sentinelshield_sales_report.pdf',
                ['Representative', 'Won', 'Lost', 'Open', 'Win Rate', `Won (${currency})`, `Open Pipeline (${currency})`],
                data.salesPerformance.map((r) => [
                  r.name,
                  r.wonCount,
                  r.lostCount,
                  r.openCount,
                  `${r.winRate}%`,
                  formatMoney(r.wonAED, 'AED', currency),
                  formatMoney(r.openAED, 'AED', currency),
                ])
              )
            }
            className="px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>{t(language, 'exportPdf')}</span>
          </button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold mb-1">Forecast vs Actual Revenue</h3>
          <p className="text-xs text-slate-500 mb-4">Weighted expected close vs closed-won ({currency})</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Line type="monotone" dataKey="forecast" name={`Forecast (${currency})`} stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="actual" name={`Actual Won (${currency})`} stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold mb-1">Pipeline Velocity</h3>
          <p className="text-xs text-slate-500 mb-4">Average cycle days in stage</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocitySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="avgDays" name="Avg Days" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Win/Loss & Lead Source ROI */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-display text-sm font-semibold">Win / Loss Analysis</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <div className="text-slate-400">Closed Won ({data.winLossAnalysis.wonCount})</div>
              <div className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatMoney(data.winLossAnalysis.wonValueAED, 'AED', currency)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <div className="text-slate-400">Closed Lost ({data.winLossAnalysis.lostCount})</div>
              <div className="text-base font-mono font-bold text-red-600 dark:text-red-400 mt-1">
                {formatMoney(data.winLossAnalysis.lostValueAED, 'AED', currency)}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="font-medium text-slate-500">Top Lost Reasons</div>
            {data.winLossAnalysis.lostReasons.map((lr) => (
              <div
                key={lr.reason}
                className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800"
              >
                <span>{lr.reason}</span>
                <span className="font-mono font-semibold">{lr.count} deals</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="font-display text-sm font-semibold">Lead Source ROI</h3>
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                <th className="py-2 text-start">Source</th>
                <th className="py-2 text-end">Leads</th>
                <th className="py-2 text-end">Qualified</th>
                <th className="py-2 text-end">Won Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.leadSourceRoi.map((s) => (
                <tr key={s.source}>
                  <td className="py-2 font-medium">{s.source.replace(/_/g, ' ')}</td>
                  <td className="py-2 text-end font-mono tabular-nums">{s.leads}</td>
                  <td className="py-2 text-end font-mono tabular-nums">{s.qualified}</td>
                  <td className="py-2 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatMoney(s.wonAED, 'AED', currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales Performance Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold">
          Sales Performance by Representative
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-2.5 px-4 text-start">Representative</th>
                <th className="py-2.5 px-4 text-end">Won</th>
                <th className="py-2.5 px-4 text-end">Lost</th>
                <th className="py-2.5 px-4 text-end">Open</th>
                <th className="py-2.5 px-4 text-end">Win Rate</th>
                <th className="py-2.5 px-4 text-end">Won Revenue</th>
                <th className="py-2.5 px-4 text-end">Open Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.salesPerformance.map((rep) => (
                <tr key={rep.name}>
                  <td className="py-2.5 px-4 font-semibold">{rep.name}</td>
                  <td className="py-2.5 px-4 text-end font-mono tabular-nums">{rep.wonCount}</td>
                  <td className="py-2.5 px-4 text-end font-mono tabular-nums">{rep.lostCount}</td>
                  <td className="py-2.5 px-4 text-end font-mono tabular-nums">{rep.openCount}</td>
                  <td className="py-2.5 px-4 text-end font-mono tabular-nums">{rep.winRate}%</td>
                  <td className="py-2.5 px-4 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatMoney(rep.wonAED, 'AED', currency)}
                  </td>
                  <td className="py-2.5 px-4 text-end font-mono tabular-nums">
                    {formatMoney(rep.openAED, 'AED', currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
