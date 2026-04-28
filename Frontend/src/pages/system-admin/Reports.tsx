/**
 * System Admin - Reports Page
 * Glass-morphism themed daily and weekly reports matching analytics design.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import adminService, { DailyReport, WeeklyReport } from '@/services/adminService';
import {
  FileText, Calendar, MessageSquare, Download,
  Users, TrendingUp, AlertTriangle, Brain, Building2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function SysReports() {
  const { toast } = useToast();
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [daily, weekly] = await Promise.all([
        adminService.getGlobalDailyReport(selectedDate),
        adminService.getGlobalWeeklyReport(),
      ]);
      setDailyReport(daily);
      setWeeklyReport(weekly);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load reports', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchReports(); }, [selectedDate]);

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end">
        <h2 className="text-3xl font-bold">Reports</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--theme-text-secondary))] pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[hsl(var(--theme-accent-primary)/0.1)] border-transparent focus:border-[hsl(var(--theme-accent-primary))] focus:ring-0 rounded-xl pl-10 pr-4 py-2 text-sm text-[hsl(var(--theme-text-primary))] transition-all"
            />
          </div>
          <button className="bg-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.9)] text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-all text-sm">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-[hsl(var(--theme-border-default))]">
        <div className="flex gap-8">
          {(['daily', 'weekly'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'pb-4 px-2 border-b-2 text-sm font-bold capitalize transition-all',
                activeTab === tab ? 'border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-accent-primary))]' : 'border-transparent text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-accent-primary))]'
              )}
            >
              {tab} Report
            </button>
          ))}
        </div>
      </div>

      {/* Daily Report */}
      {activeTab === 'daily' && (
        <div className="space-y-8">
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-bg-hover))] rounded-xl p-6">
                  <div className="h-16 bg-[hsl(var(--theme-bg-tertiary)/0.3)] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : dailyReport ? (
            <>
              {/* Metric Cards */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: MessageSquare, color: '#3b82f6', bg: 'bg-blue-500/10', value: dailyReport.summary?.total_messages?.toLocaleString() || 0, label: 'Messages' },
                  { icon: Users, color: '#22c55e', bg: 'bg-emerald-500/10', value: dailyReport.summary?.active_users?.toLocaleString() || 0, label: 'Active Users' },
                  { icon: AlertTriangle, color: '#f97316', bg: 'bg-orange-500/10', value: dailyReport.moderation?.total_flags || 0, label: 'Total Flags' },
                  { icon: Brain, color: 'hsl(var(--theme-accent-primary))', bg: 'bg-[hsl(var(--theme-accent-primary)/0.1)]', value: Object.values(dailyReport.ai_agents || {}).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0), label: 'AI Agent Actions' },
                ].map((card, i) => (
                  <div key={i} className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] p-6 rounded-2xl">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">{card.label}</p>
                        <h3 className="text-3xl font-bold mt-1">{card.value}</h3>
                      </div>
                      <div className={cn('p-2 rounded-lg', card.bg)}>
                        <card.icon className="h-5 w-5" style={{ color: card.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sentiment & Moderation */}
              <div className="grid gap-6 lg:grid-cols-2">
                {dailyReport.sentiment && (
                  <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4">Sentiment Breakdown</h3>
                    <div className="space-y-3">
                      {Object.entries(dailyReport.sentiment).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-[hsl(var(--theme-text-secondary))] capitalize">{key}</span>
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]">{typeof val === 'number' ? val : String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dailyReport.moderation && (
                  <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4">Moderation Summary</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[hsl(var(--theme-text-secondary))]">Total Flags</span>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">{dailyReport.moderation.total_flags || 0}</span>
                      </div>
                      {dailyReport.moderation.breakdown && Object.entries(dailyReport.moderation.breakdown).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-[hsl(var(--theme-text-secondary))] capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl py-12 text-center">
              <FileText className="h-12 w-12 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
              <p className="text-[hsl(var(--theme-text-secondary))]">No report available for this date</p>
            </div>
          )}
        </div>
      )}

      {/* Weekly Report */}
      {activeTab === 'weekly' && (
        <div className="space-y-8">
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-bg-hover))] rounded-xl p-6">
                  <div className="h-16 bg-[hsl(var(--theme-bg-tertiary)/0.3)] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : weeklyReport ? (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: MessageSquare, color: '#3b82f6', bg: 'bg-blue-500/10', value: weeklyReport.summary?.total_messages?.toLocaleString() || 0, label: 'Weekly Messages' },
                  { icon: Users, color: '#22c55e', bg: 'bg-emerald-500/10', value: weeklyReport.summary?.active_users?.toLocaleString() || 0, label: 'Active Users' },
                  { icon: TrendingUp, color: '#f97316', bg: 'bg-orange-500/10', value: weeklyReport.summary?.new_users || 0, label: 'New Users' },
                  { icon: Building2, color: 'hsl(var(--theme-accent-primary))', bg: 'bg-[hsl(var(--theme-accent-primary)/0.1)]', value: weeklyReport.top_communities?.length || 0, label: 'Top Communities' },
                ].map((card, i) => (
                  <div key={i} className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] p-6 rounded-2xl">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">{card.label}</p>
                        <h3 className="text-3xl font-bold mt-1">{card.value}</h3>
                      </div>
                      <div className={cn('p-2 rounded-lg', card.bg)}>
                        <card.icon className="h-5 w-5" style={{ color: card.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top Communities Leaderboard */}
              {weeklyReport.top_communities && weeklyReport.top_communities.length > 0 && (
                <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-6">Top Communities Leaderboard</h3>
                  <div className="space-y-6">
                    {weeklyReport.top_communities.map((c, idx) => (
                      <div key={c.id} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-[hsl(var(--theme-text-secondary))]">{c.message_count?.toLocaleString()} messages</span>
                        </div>
                        <div className="w-full bg-[hsl(var(--theme-bg-tertiary))] rounded-full h-2">
                          <div
                            className="bg-[hsl(var(--theme-accent-primary))] h-2 rounded-full transition-all"
                            style={{ width: `${Math.min((c.message_count / (weeklyReport.top_communities![0]?.message_count || 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Reports Table - matching design */}
              <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-[hsl(var(--theme-border-default))] flex items-center justify-between">
                  <h3 className="text-lg font-bold">Recent Reports</h3>
                  <button className="text-[hsl(var(--theme-accent-primary))] text-sm font-semibold hover:underline">View All History</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[hsl(var(--theme-accent-primary)/0.05)] text-[hsl(var(--theme-text-secondary))] text-xs font-bold uppercase tracking-widest">
                        <th className="px-6 py-4">Report Name</th>
                        <th className="px-6 py-4">Generated On</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Format</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-[hsl(var(--theme-border-default))]">
                      <tr className="hover:bg-[hsl(var(--theme-accent-primary)/0.05)] transition-colors">
                        <td className="px-6 py-4 font-medium">Daily Report — {selectedDate}</td>
                        <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))]">{new Date(selectedDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> READY
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))] font-mono">JSON</td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.1)] rounded-lg"><Download className="h-4 w-4" /></button>
                        </td>
                      </tr>
                      <tr className="hover:bg-[hsl(var(--theme-accent-primary)/0.05)] transition-colors">
                        <td className="px-6 py-4 font-medium">Weekly Summary</td>
                        <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))]">{typeof weeklyReport.period === 'string' ? weeklyReport.period : weeklyReport.period ? `${weeklyReport.period.start} — ${weeklyReport.period.end}` : 'Current Week'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> READY
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))] font-mono">JSON</td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.1)] rounded-lg"><Download className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl py-12 text-center">
              <FileText className="h-12 w-12 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
              <p className="text-[hsl(var(--theme-text-secondary))]">No weekly report available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
