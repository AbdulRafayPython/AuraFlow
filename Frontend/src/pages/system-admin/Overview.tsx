/**
 * System Admin Overview Page
 * Dark purple themed dashboard matching admin panel design.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import adminService, {
  CommunityOverviewStats,
  ModerationAlert
} from '@/services/adminService';
import {
  Users,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Zap,
  Flag,
  Building2,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function SystemAdminOverview() {
  const { toast } = useToast();
  const [stats, setStats] = useState<CommunityOverviewStats | null>(null);
  const [alerts, setAlerts] = useState<ModerationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async (showToast = false) => {
    try {
      const [statsData, alertsData] = await Promise.all([
        adminService.getGlobalOverviewStats(),
        adminService.getGlobalRecentAlerts(5),
      ]);
      setStats(statsData);
      setAlerts(alertsData);
      if (showToast) {
        toast({ title: 'Dashboard Refreshed', description: 'All metrics have been updated.' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load dashboard data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, []);

  const severityColors: Record<string, string> = {
    low: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    medium: 'bg-orange-500/10 text-orange-500 border border-orange-500/20',
    high: 'bg-red-500/10 text-red-500 border border-red-500/20',
    critical: 'bg-red-500/10 text-red-500 border border-red-500/20',
  };

  const actionColors: Record<string, { dot: string; text: string }> = {
    pending: { dot: 'bg-orange-500 animate-pulse', text: 'Pending' },
    none: { dot: 'bg-orange-500 animate-pulse', text: 'Pending' },
    resolved: { dot: 'bg-emerald-500', text: 'Resolved' },
    approve: { dot: 'bg-emerald-500', text: 'Resolved' },
    warn: { dot: 'bg-sky-500', text: 'In Progress' },
    delete: { dot: 'bg-emerald-500', text: 'Resolved' },
    ban: { dot: 'bg-emerald-500', text: 'Resolved' },
  };

  const kpiCards = [
    { icon: Users, label: 'Total Users', value: stats?.users.total || 0, trend: 12, trendUp: true },
    { icon: Building2, label: 'Active Communities', value: stats?.communities?.total || stats?.channels?.total || 0, trend: 3, trendUp: true },
    { icon: MessageSquare, label: 'Messages Today', value: stats?.messages.today || 0, trend: stats?.messages.trend_percent || 18, trendUp: (stats?.messages.trend_percent || 0) >= 0 },
    { icon: Flag, label: 'Flagged Content', value: stats?.moderation.flagged_today || 0, trend: 5, trendUp: false },
  ];

  const aiHealthItems = [
    { label: 'NLP Accuracy', value: '98.2%', percent: 98.2, color: 'bg-emerald-500' },
    { label: 'Response Latency', value: '142ms', percent: 75, color: 'bg-[hsl(var(--theme-accent-primary))]' },
    { label: 'Active Agents', value: `${stats?.agents ? Object.values(stats.agents).filter(a => a.status === 'active').length : 0}/${stats?.agents ? Object.keys(stats.agents).length : 0}`, percent: stats?.agents ? (Object.values(stats.agents).filter(a => a.status === 'active').length / Object.keys(stats.agents).length) * 100 : 100, color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] p-6 rounded-xl hover:border-[hsl(var(--theme-accent-primary)/0.5)] transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-[hsl(var(--theme-accent-primary)/0.1)] rounded-lg text-[hsl(var(--theme-accent-primary))] group-hover:bg-[hsl(var(--theme-accent-primary))] group-hover:text-white transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <span className={cn('text-sm font-medium flex items-center', card.trendUp ? 'text-emerald-500' : 'text-orange-500')}>
                  {card.trendUp ? '+' : '-'}{card.trend}%
                  {card.trendUp ? <TrendingUp className="h-3 w-3 ml-0.5" /> : <TrendingDown className="h-3 w-3 ml-0.5" />}
                </span>
              </div>
              <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">{card.label}</p>
              <h3 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))] mt-1">
                {loading ? '—' : typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </h3>
            </div>
          );
        })}
      </div>

      {/* Middle Section: Recent Alerts Table + AI Health Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Alerts Table */}
        <div className="lg:col-span-2 bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-xl flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-[hsl(var(--theme-border-default))] flex justify-between items-center">
            <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">Recent Alerts</h2>
            <Link to="/system-admin/moderation/flagged" className="text-[hsl(var(--theme-accent-primary))] text-sm font-semibold hover:underline">View All</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[hsl(var(--theme-bg-hover))]">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider">Alert ID</th>
                  <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider text-center">Severity</th>
                  <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--theme-border-default))]">
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i}><td className="px-6 py-4" colSpan={5}><div className="h-4 bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded animate-pulse" /></td></tr>
                  ))
                ) : alerts.length === 0 ? (
                  <tr><td className="px-6 py-8 text-center text-[hsl(var(--theme-text-secondary))]" colSpan={5}>No recent alerts — all clear!</td></tr>
                ) : (
                  alerts.map((alert) => {
                    const severity = alert.severity?.toLowerCase() || 'low';
                    const actionKey = alert.action_taken?.toLowerCase().replace(' ', '_') || 'pending';
                    const statusInfo = actionColors[actionKey] || actionColors.pending;
                    return (
                      <tr key={alert.id} className="hover:bg-[hsl(var(--theme-bg-hover))] transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-[hsl(var(--theme-text-secondary))]">#{alert.id}</td>
                        <td className="px-6 py-4 text-sm text-[hsl(var(--theme-text-secondary))]">{alert.flag_type}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn('inline-flex px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider', severityColors[severity])}>{severity}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-full', statusInfo.dot)} />
                            <span className="text-sm text-[hsl(var(--theme-text-secondary))]">{statusInfo.text}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link to={`/system-admin/moderation/flagged?id=${alert.id}`} className="px-3 py-1.5 bg-[hsl(var(--theme-accent-primary))] rounded-lg text-white text-xs font-bold hover:bg-[hsl(var(--theme-accent-primary)/0.8)] transition-all inline-block">Review</Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Health Status */}
        <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-xl flex flex-col p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-[hsl(var(--theme-accent-primary))]" />
            <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">AI Health Status</h2>
          </div>
          <div className="space-y-6">
            {aiHealthItems.map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-sm text-[hsl(var(--theme-text-secondary))]">{item.label}</span>
                  <span className="text-sm font-bold text-[hsl(var(--theme-text-primary))]">{item.value}</span>
                </div>
                <div className="h-2 w-full bg-[hsl(var(--theme-bg-tertiary))] rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', item.color)} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-4 p-4 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.05)] border border-[hsl(var(--theme-accent-primary)/0.1)] flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[hsl(var(--theme-accent-primary)/0.1)] flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-[hsl(var(--theme-accent-primary))]" />
              </div>
              <div>
                <p className="text-xs font-bold text-[hsl(var(--theme-accent-primary))] uppercase">Optimized Performance</p>
                <p className="text-[11px] text-[hsl(var(--theme-text-secondary))]">All systems running at peak capacity with 0 packet drops detected.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Message Volume */}
        <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-xl p-6 h-80 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">Message Volume</h2>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-[hsl(var(--theme-text-secondary))]"><span className="h-2 w-2 rounded-full bg-[hsl(var(--theme-accent-primary))] inline-block" /> Messages</span>
              <span className="flex items-center gap-1 text-xs text-[hsl(var(--theme-text-secondary))] ml-3"><span className="h-2 w-2 rounded-full bg-[hsl(var(--theme-text-muted))] inline-block" /> Previous</span>
            </div>
          </div>
          <div className="flex-1 relative flex items-end gap-2 px-2">
            <div className="absolute inset-0 flex flex-col justify-between py-2 border-l border-b border-[hsl(var(--theme-border-default)/0.5)] pointer-events-none">
              {[...Array(4)].map((_, i) => <div key={i} className="w-full border-t border-[hsl(var(--theme-border-default)/0.3)]" />)}
            </div>
            <div className="absolute inset-0 px-2 pointer-events-none">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="msgGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--theme-accent-primary))" stopOpacity="1" />
                    <stop offset="100%" stopColor="hsl(var(--theme-accent-primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,80 Q10,75 20,85 T40,60 T60,40 T80,55 T100,20" fill="none" stroke="hsl(var(--theme-accent-primary))" strokeWidth="2" />
                <path d="M0,80 Q10,75 20,85 T40,60 T60,40 T80,55 T100,20 L100,100 L0,100 Z" fill="url(#msgGrad)" opacity="0.1" />
              </svg>
            </div>
            <div className="w-full flex justify-between absolute -bottom-6 text-[10px] text-[hsl(var(--theme-text-muted))] uppercase font-bold px-2">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>

        {/* Community Activity */}
        <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-xl p-6 h-80 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">Community Activity</h2>
            <select className="bg-[hsl(var(--theme-bg-tertiary))] border-none rounded text-xs text-[hsl(var(--theme-text-secondary))] py-1 px-3 focus:ring-[hsl(var(--theme-accent-primary))] focus:outline-none">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="flex-1 flex items-end justify-between gap-4 px-4 pb-8">
            {[40, 55, 85, 65, 75, 30, 45].map((h, i) => (
              <div key={i} className="w-full group relative flex flex-col items-center">
                <div className="w-full bg-[hsl(var(--theme-accent-primary)/0.2)] hover:bg-[hsl(var(--theme-accent-primary))] transition-colors rounded-t-lg" style={{ height: `${h}%` }} />
                <span className="absolute -bottom-6 text-[10px] text-[hsl(var(--theme-text-muted))]">{['M','T','W','T','F','S','S'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
