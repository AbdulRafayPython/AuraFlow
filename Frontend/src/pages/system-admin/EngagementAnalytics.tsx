/**
 * System Admin - Analytics Page
 * Redesigned to match the analytics dashboard design mockup.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import adminService, { DailyEngagement, HourlyActivity, ChannelStats } from '@/services/adminService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import {
  TrendingUp, Users, Smile, Download, Calendar,
  FileText, ArrowDownToLine
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Static heatmap data: rows = time slots, cols = MON-SUN
const heatmapData = [
  { label: '10 AM', values: [20, 45, 35, 65, 50, 15, 8] },
  { label: '2 PM', values: [55, 80, 100, 70, 65, 25, 12] },
  { label: '6 PM', values: [65, 75, 85, 90, 100, 45, 25] },
];
const heatmapDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const moodColors: Record<string, string> = {
  Positive: '#22c55e',
  Neutral: '#8c2bee',
  Negative: '#f43f5e',
  Mixed: '#eab308',
};

// At-risk users placeholder
const atRiskUsers = [
  { name: 'Marcus V.', status: 'Declining', statusColor: 'text-red-400', avatar: 'M' },
  { name: 'Sarah L.', status: 'Low Sentiment', statusColor: 'text-yellow-400', avatar: 'S' },
  { name: 'James O.', status: 'Inactive 3d', statusColor: 'text-slate-400', avatar: 'J' },
];

// Recent reports placeholder
const recentReports = [
  { name: 'Monthly Sentiment Audit', date: 'Oct 24, 2023', status: 'READY', statusColor: 'bg-emerald-500', format: 'PDF', downloadable: true },
  { name: 'Community Engagement Weekly', date: 'Oct 23, 2023', status: 'READY', statusColor: 'bg-emerald-500', format: 'XLSX', downloadable: true },
  { name: 'AI Performance Metrics', date: 'Oct 25, 2023', status: 'GENERATING', statusColor: 'bg-yellow-500', format: 'PDF', downloadable: false },
];

export default function SysEngagementAnalytics() {
  const { toast } = useToast();
  const [dailyData, setDailyData] = useState<DailyEngagement[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyActivity[]>([]);
  const [topChannels, setTopChannels] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await adminService.getGlobalEngagementAnalytics(parseInt(days));
      setDailyData(data.daily_engagement || []);
      setHourlyData(data.hourly_distribution || []);
      setTopChannels(data.top_channels || []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load engagement data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAnalytics(); }, [days]);

  const totalMessages = dailyData.reduce((sum, d) => sum + (d.messages || 0), 0);
  const avgDailyUsers = dailyData.length > 0
    ? Math.round(dailyData.reduce((sum, d) => sum + (d.active_users || 0), 0) / dailyData.length)
    : 0;

  // Compute growth percentage
  const midpoint = Math.floor(dailyData.length / 2);
  const firstHalf = dailyData.slice(0, midpoint).reduce((s, d) => s + (d.messages || 0), 0);
  const secondHalf = dailyData.slice(midpoint).reduce((s, d) => s + (d.messages || 0), 0);
  const growthPct = firstHalf > 0 ? (((secondHalf - firstHalf) / firstHalf) * 100).toFixed(1) : '12.5';

  // Compute retention
  const maxUsers = Math.max(...dailyData.map(d => d.active_users || 0), 1);
  const retentionPct = avgDailyUsers > 0 ? ((avgDailyUsers / maxUsers) * 100).toFixed(1) : '5.4';

  // Mood distribution as percentage (fallback)
  const moodDistribution = [
    { label: 'Positive', pct: 45, color: moodColors.Positive },
    { label: 'Neutral', pct: 35, color: moodColors.Neutral },
    { label: 'Negative', pct: 12, color: moodColors.Negative },
    { label: 'Mixed', pct: 8, color: moodColors.Mixed },
  ];
  const sentimentScore = moodDistribution[0].pct + Math.round(moodDistribution[1].pct * 0.5);

  // Sparkline bars for Platform Growth card
  const sparkBars = [40, 55, 48, 72, 60, 80, 95];

  // Live user avatars
  const liveAvatars = ['A', 'B', 'C', 'D'];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Time Range Filters */}
        <div className="flex items-center gap-2">
          {[
            { value: '7', label: 'Last 7 Days' },
            { value: '30', label: 'Last 30 Days' },
            { value: '90', label: 'Last 90 Days' },
          ].map(d => (
            <button
              key={d.value}
              onClick={() => setDays(d.value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                days === d.value
                  ? 'bg-[hsl(var(--theme-accent-primary))] text-white shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.2)]'
                  : 'bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-tertiary))] hover:text-[hsl(var(--theme-text-primary))]'
              )}
            >
              {d.label}
            </button>
          ))}
          <button className="px-4 py-2 rounded-lg text-sm font-medium bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-tertiary))] hover:text-[hsl(var(--theme-text-primary))] flex items-center gap-2 transition-all">
            Custom <Calendar className="h-4 w-4" />
          </button>
        </div>

        {/* Right side info */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-[hsl(var(--theme-text-muted))] flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Data updated 5 minutes ago
          </span>
          <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Platform Growth */}
        <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-[hsl(var(--theme-text-secondary))] font-medium">Platform Growth</p>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <h3 className="text-4xl font-bold mb-4">+{growthPct}%</h3>
          <div className="h-14 flex items-end gap-1.5 mb-3">
            {sparkBars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all bg-[hsl(var(--theme-accent-primary))]"
                style={{
                  height: `${h}%`,
                  opacity: 0.25 + i * 0.1,
                }}
              />
            ))}
          </div>
          <p className="text-xs text-emerald-500 font-medium">+2.1% from last week</p>
        </div>

        {/* Avg Daily Active Users */}
        <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-[hsl(var(--theme-text-secondary))] font-medium">Avg Daily Active Users</p>
            <div className="p-2 bg-[hsl(var(--theme-accent-primary)/0.1)] rounded-lg">
              <Users className="h-5 w-5 text-[hsl(var(--theme-accent-primary))]" />
            </div>
          </div>
          <h3 className="text-4xl font-bold mb-4">{avgDailyUsers || 342}</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex -space-x-2">
              {liveAvatars.map((a, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-[hsl(var(--theme-bg-secondary))] bg-gradient-to-br from-[hsl(var(--theme-accent-primary)/0.5)] to-[hsl(var(--theme-accent-secondary)/0.5)] flex items-center justify-center text-[10px] font-bold text-white"
                >
                  {a}
                </div>
              ))}
              <div className="w-8 h-8 rounded-full border-2 border-[hsl(var(--theme-bg-secondary))] bg-[hsl(var(--theme-accent-primary))] flex items-center justify-center text-[10px] font-bold text-white">
                +{Math.max((avgDailyUsers || 342) - 4, 38)}
              </div>
            </div>
            <span className="text-xs text-[hsl(var(--theme-text-secondary))]">
              Live now: <span className="text-emerald-400 font-medium">{Math.round((avgDailyUsers || 342) * 0.12)} users</span>
            </span>
          </div>
          <p className="text-xs text-emerald-500 font-medium">+{retentionPct}% user retention</p>
        </div>

        {/* Sentiment Score */}
        <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-[hsl(var(--theme-text-secondary))] font-medium">Sentiment Score</p>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Smile className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <h3 className="text-4xl font-bold mb-4">{sentimentScore}% Positive</h3>
          <div className="flex items-center gap-4 mb-3">
            {/* Mini donut */}
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx={18} cy={18} r={14} fill="none" stroke="hsl(var(--theme-bg-tertiary))" strokeWidth={3} />
                <circle
                  cx={18} cy={18} r={14} fill="none" stroke="#22c55e" strokeWidth={3}
                  strokeDasharray={`${sentimentScore * 0.88} ${88 - sentimentScore * 0.88}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-emerald-400">
                {sentimentScore}%
              </span>
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[hsl(var(--theme-text-secondary))]">Positive Trend</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[hsl(var(--theme-text-muted))]" />
                <span className="text-[hsl(var(--theme-text-secondary))]">Neutral/Misc</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-emerald-500 font-medium">+1.2% sentiment growth</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <div className="h-[280px] bg-[hsl(var(--theme-bg-tertiary)/0.3)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Message Volume Overview - Full Width Area Chart */}
          <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Message Volume Overview</h3>
              <div className="flex items-center gap-5 text-xs font-medium">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(var(--theme-accent-primary))]" />
                  <span className="text-[hsl(var(--theme-text-secondary))]">Direct Messages</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-[hsl(var(--theme-text-muted))]" />
                  <span className="text-[hsl(var(--theme-text-secondary))]">Channel Posts</span>
                </div>
              </div>
            </div>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--theme-accent-primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--theme-accent-primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--theme-border-default))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    stroke="#64748b"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis stroke="#64748b" fontSize={12} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--theme-bg-secondary))', border: '1px solid hsl(var(--theme-border-default))', borderRadius: 12, color: 'hsl(var(--theme-text-primary))' }}
                  />
                  <Area type="monotone" dataKey="messages" stroke="hsl(var(--theme-accent-primary))" strokeWidth={2} fill="url(#purpleGradient)" name="Direct Messages" />
                  <Area type="monotone" dataKey="active_users" stroke="#64748b" strokeWidth={1.5} fill="none" strokeDasharray="4 4" name="Channel Posts" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-[hsl(var(--theme-text-muted))]">No engagement data for this period</div>
            )}
          </div>

          {/* Mood Distribution + Top Communities Leaderboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mood Distribution Donut */}
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6">Mood Distribution</h3>
              <div className="flex items-center gap-8">
                {/* Donut Chart */}
                <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
                  <svg viewBox="0 0 160 160" className="w-full h-full transform -rotate-90">
                    {(() => {
                      let cumulativeOffset = 0;
                      const radius = 65;
                      const circumference = 2 * Math.PI * radius;
                      return moodDistribution.map((m, i) => {
                        const dashLength = (m.pct / 100) * circumference;
                        const el = (
                          <circle
                            key={i}
                            cx={80} cy={80} r={radius}
                            fill="none"
                            stroke={m.color}
                            strokeWidth={20}
                            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                            strokeDashoffset={-cumulativeOffset}
                            className="transition-all duration-500"
                          />
                        );
                        cumulativeOffset += dashLength;
                        return el;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold">
                      {totalMessages >= 1000 ? `${(totalMessages / 1000).toFixed(1)}k` : totalMessages || '1.2k'}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider font-bold">Tokens</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-col gap-3">
                  {moodDistribution.map((m) => (
                    <div key={m.label} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
                      <span className="text-sm text-[hsl(var(--theme-text-secondary))] w-16">{m.label}</span>
                      <span className="text-sm font-bold text-[hsl(var(--theme-text-primary))]">{m.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Communities Leaderboard */}
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6">Top Communities Leaderboard</h3>
              <div className="space-y-5">
                {(topChannels.length > 0
                  ? topChannels.slice(0, 4).map((ch) => ({
                      name: ch.community_name || ch.name,
                      messages: ch.message_count || 0,
                    }))
                  : [
                      { name: 'Design Studio', messages: 2400 },
                      { name: 'Web Dev Hub', messages: 1800 },
                      { name: 'AI Researchers', messages: 1200 },
                      { name: 'Marketing Sync', messages: 890 },
                    ]
                ).map((c, idx) => {
                  const maxMsgs = topChannels[0]?.message_count || 2400;
                  const barPct = Math.min((c.messages / maxMsgs) * 100, 100);
                  const barColors = ['#22c55e', '#8c2bee', '#3b82f6', '#eab308'];
                  return (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-[hsl(var(--theme-text-primary))]">{c.name}</span>
                        <span className="text-[hsl(var(--theme-text-secondary))]">
                          {c.messages >= 1000
                            ? `${(c.messages / 1000).toFixed(1)}k messages`
                            : `${c.messages} messages`}
                        </span>
                      </div>
                      <div className="w-full bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: `${barPct}%`, background: barColors[idx] || '#8c2bee' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User Engagement Heatmap + At-Risk Users */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
            {/* Engagement Heatmap */}
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6">User Engagement Heatmap</h3>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-8 gap-2 min-w-[400px]">
                  {/* Header row */}
                  <div className="h-8" />
                  {heatmapDays.map(d => (
                    <div key={d} className="h-8 text-xs font-medium flex items-center justify-center text-[hsl(var(--theme-text-muted))]">
                      {d}
                    </div>
                  ))}
                  {/* Data rows */}
                  {heatmapData.map((row, ri) => (
                    <React.Fragment key={ri}>
                      <div className="text-xs text-[hsl(var(--theme-text-muted))] font-medium flex items-center">{row.label}</div>
                      {row.values.map((v, ci) => (
                        <div
                          key={ci}
                          className="h-12 rounded-lg transition-colors"
                          style={{ background: `hsl(var(--theme-accent-primary) / ${Math.max(v / 100, 0.08)})` }}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* At-Risk Users */}
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6 w-full lg:w-80">
              <h3 className="text-lg font-bold mb-6">At-Risk Users</h3>
              <div className="space-y-4">
                {atRiskUsers.map((u, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(var(--theme-bg-tertiary)/0.5)] flex items-center justify-center text-sm font-bold text-[hsl(var(--theme-text-secondary))]">
                      {u.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{u.name}</p>
                      <p className={cn('text-xs font-medium flex items-center gap-1', u.statusColor)}>
                        <TrendingUp className="h-3 w-3" style={{ transform: u.status === 'Declining' ? 'rotate(135deg)' : 'none' }} />
                        {u.status}
                      </p>
                    </div>
                    <button className="px-3 py-1.5 rounded-lg border border-[hsl(var(--theme-accent-primary)/0.3)] text-xs font-medium text-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-accent-primary)/0.1)] transition-colors whitespace-nowrap">
                      REACH OUT
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Reports Section */}
          <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Recent Reports</h3>
              <button className="text-[hsl(var(--theme-accent-primary))] text-sm font-medium hover:underline">
                View All History
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[hsl(var(--theme-text-muted))] border-b border-[hsl(var(--theme-accent-primary)/0.1)] text-xs uppercase tracking-wider">
                    <th className="pb-3 font-medium">Report Name</th>
                    <th className="pb-3 font-medium">Generated On</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Format</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
                  {recentReports.map((r, i) => (
                    <tr key={i}>
                      <td className="py-4 font-medium text-[hsl(var(--theme-text-primary))]">{r.name}</td>
                      <td className="py-4 text-[hsl(var(--theme-text-secondary))]">{r.date}</td>
                      <td className="py-4">
                        <span className={cn(
                          'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white',
                          r.statusColor
                        )}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-4 text-[hsl(var(--theme-text-secondary))]">{r.format}</td>
                      <td className="py-4">
                        {r.downloadable ? (
                          <button className="text-[hsl(var(--theme-accent-primary))] hover:text-[hsl(var(--theme-accent-secondary))] transition-colors">
                            <ArrowDownToLine className="h-5 w-5" />
                          </button>
                        ) : (
                          <button className="text-[hsl(var(--theme-text-muted))] cursor-not-allowed">
                            <FileText className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-6 border-t border-[hsl(var(--theme-border-default))] mt-4">
            <p className="text-xs text-[hsl(var(--theme-text-muted))]">
              &copy; 2023 AuraFlow AI Communication Platform. All rights reserved. &nbsp;|&nbsp; Privacy Policy &nbsp;|&nbsp; System Status
            </p>
          </div>
        </>
      )}
    </div>
  );
}
