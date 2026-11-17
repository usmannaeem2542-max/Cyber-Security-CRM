import { CheckSquare, ChevronLeft, ChevronRight, Plus, Square } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { Account, Activity, Ticket } from '../types/crm';

export function ActivitiesTicketsView({
  defaultMode = 'activities',
}: {
  defaultMode?: 'activities' | 'tickets';
}) {
  const { user, showToast } = useApp();
  const [mode, setMode] = useState<'activities' | 'tickets'>(defaultMode);
  const [actView, setActView] = useState<'list' | 'calendar'>('calendar');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const [showNewActivity, setShowNewActivity] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);

  const [actForm, setActForm] = useState({
    type: 'TASK' as Activity['type'],
    subject: '',
    description: '',
    dueDate: new Date().toISOString().slice(0, 10),
    priority: 'MEDIUM' as Activity['priority'],
    accountId: '',
  });

  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    category: 'SOC_ALERT',
    priority: 'HIGH' as Ticket['priority'],
    accountId: '',
  });

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  const isReadOnly = user?.role === 'READ_ONLY';

  const load = useCallback(async () => {
    try {
      const [aRes, tRes, accRes] = await Promise.all([
        api<{ activities: Activity[] }>('/activities'),
        api<{ tickets: Ticket[] }>('/tickets'),
        api<{ accounts: Account[] }>('/accounts'),
      ]);
      setActivities(aRes.activities);
      setTickets(tRes.tickets);
      setAccounts(accRes.accounts);
      if (accRes.accounts.length > 0 && !actForm.accountId) {
        setActForm((f) => ({ ...f, accountId: accRes.accounts[0].id }));
        setTicketForm((f) => ({ ...f, accountId: accRes.accounts[0].id }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load operations', 'error');
    }
  }, [showToast, actForm.accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActivity = async (act: Activity) => {
    if (isReadOnly) return;
    try {
      await api(`/activities/${act.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !act.completed }),
      });
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/activities', { method: 'POST', body: JSON.stringify(actForm) });
      showToast('Activity scheduled');
      setShowNewActivity(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create activity', 'error');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/tickets', { method: 'POST', body: JSON.stringify(ticketForm) });
      showToast('Support ticket logged');
      setShowNewTicket(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create ticket', 'error');
    }
  };

  const updateTicketStatus = async (id: string, status: Ticket['status']) => {
    if (isReadOnly) return;
    try {
      await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast(`Ticket updated to ${status}`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  // Calendar computation
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells = Array.from({ length: firstDayOfWeek + daysInMonth }, (_, idx) => {
    if (idx < firstDayOfWeek) return null;
    return idx - firstDayOfWeek + 1;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              onClick={() => setMode('activities')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'activities'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              Activities &amp; Tasks ({activities.length})
            </button>
            <button
              onClick={() => setMode('tickets')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'tickets'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              Support Tickets ({tickets.length})
            </button>
          </div>

          {mode === 'activities' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
              <button
                onClick={() => setActView('calendar')}
                className={`px-2.5 py-1 text-xs rounded-md ${
                  actView === 'calendar'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setActView('list')}
                className={`px-2.5 py-1 text-xs rounded-md ${
                  actView === 'list'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                List
              </button>
            </div>
          )}
        </div>

        {!isReadOnly && (
          <button
            onClick={() =>
              mode === 'activities' ? setShowNewActivity(true) : setShowNewTicket(true)
            }
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{mode === 'activities' ? 'Schedule Activity' : 'Log Ticket'}</span>
          </button>
        )}
      </div>

      {mode === 'activities' ? (
        actView === 'calendar' ? (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">
                {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCalMonth(new Date(year, month - 1, 1))}
                  className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCalMonth(new Date())}
                  className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  Today
                </button>
                <button
                  onClick={() => setCalMonth(new Date(year, month + 1, 1))}
                  className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div
                  key={d}
                  className="bg-slate-50 dark:bg-slate-900 py-1.5 text-center text-[11px] font-semibold text-slate-500"
                >
                  {d}
                </div>
              ))}
              {calendarCells.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="bg-slate-50/40 dark:bg-slate-950/40 min-h-24" />;
                }
                const dayEvents = activities.filter((a) => {
                  if (!a.dueDate) return false;
                  const dt = new Date(a.dueDate);
                  return (
                    dt.getFullYear() === year &&
                    dt.getMonth() === month &&
                    dt.getDate() === day
                  );
                });
                return (
                  <div
                    key={day}
                    className="bg-white dark:bg-slate-900 min-h-24 p-1.5 space-y-1"
                  >
                    <div className="text-[11px] font-mono text-slate-400">{day}</div>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => toggleActivity(ev)}
                        className={`w-full text-start px-1.5 py-0.5 rounded text-[10px] truncate block ${
                          ev.completed
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 line-through'
                            : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        }`}
                        title={ev.subject}
                      >
                        {ev.type}: {ev.subject}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {activities.map((act) => (
              <div key={act.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={() => toggleActivity(act)}
                    className="mt-0.5 text-slate-400 hover:text-blue-600"
                  >
                    {act.completed ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div
                      className={`font-medium ${
                        act.completed
                          ? 'line-through text-slate-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {act.type} · {act.subject}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {act.account?.name || act.deal?.title || 'General'} · {act.owner?.name}
                      {act.autoGenerated ? ' · Auto-created on Proposal Sent' : ''}
                    </div>
                  </div>
                </div>
                <div className="text-end font-mono text-[11px] text-slate-500 shrink-0">
                  {act.dueDate ? new Date(act.dueDate).toLocaleDateString() : 'No due date'}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4 text-start">Ticket</th>
                  <th className="py-2.5 px-4 text-start">Subject &amp; Account</th>
                  <th className="py-2.5 px-4 text-start">Category</th>
                  <th className="py-2.5 px-4 text-start">Priority</th>
                  <th className="py-2.5 px-4 text-end">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tickets.map((tkt) => (
                  <tr key={tkt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono font-semibold">{tkt.ticketNumber}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {tkt.subject}
                      </div>
                      <div className="text-[11px] text-slate-400">{tkt.account?.name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{tkt.category.replace(/_/g, ' ')}</td>
                    <td className="py-3 px-4 font-semibold">
                      <span
                        className={
                          tkt.priority === 'CRITICAL'
                            ? 'text-red-600 dark:text-red-400'
                            : tkt.priority === 'HIGH'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-300'
                        }
                      >
                        {tkt.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-end">
                      {!isReadOnly ? (
                        <select
                          value={tkt.status}
                          onChange={(e) =>
                            updateTicketStatus(tkt.id, e.target.value as Ticket['status'])
                          }
                          className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="RESOLVED">RESOLVED</option>
                          <option value="CLOSED">CLOSED</option>
                        </select>
                      ) : (
                        <span>{tkt.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Activity Modal */}
      {showNewActivity && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateActivity}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Schedule Activity / Task</h3>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={actForm.type}
                onChange={(e) =>
                  setActForm({ ...actForm, type: e.target.value as Activity['type'] })
                }
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="TASK">Task</option>
                <option value="CALL">Call</option>
                <option value="MEETING">Meeting</option>
                <option value="EMAIL">Email</option>
                <option value="NOTE">Note</option>
              </select>
              <input
                type="date"
                value={actForm.dueDate}
                onChange={(e) => setActForm({ ...actForm, dueDate: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <input
              required
              placeholder="Subject"
              value={actForm.subject}
              onChange={(e) => setActForm({ ...actForm, subject: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <select
              value={actForm.accountId}
              onChange={(e) => setActForm({ ...actForm, accountId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewActivity(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Save Activity
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTicket}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold">Log Support Ticket</h3>
            <select
              required
              value={ticketForm.accountId}
              onChange={(e) => setTicketForm({ ...ticketForm, accountId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Ticket Subject"
              value={ticketForm.subject}
              onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <textarea
              required
              placeholder="Incident or service request description"
              value={ticketForm.description}
              onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={ticketForm.category}
                onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="SOC_ALERT">SOC Alert</option>
                <option value="PEN_TEST_RETEST">Pen Test Retest</option>
                <option value="LICENSING">Licensing</option>
                <option value="COMPLIANCE_ADVISORY">Compliance Advisory</option>
                <option value="GENERAL">General</option>
              </select>
              <select
                value={ticketForm.priority}
                onChange={(e) =>
                  setTicketForm({ ...ticketForm, priority: e.target.value as Ticket['priority'] })
                }
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewTicket(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg"
              >
                Submit Ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
