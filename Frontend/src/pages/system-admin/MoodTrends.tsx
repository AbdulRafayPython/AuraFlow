/**
 * System Admin - Mood Trends Analytics Page
 * Glass-morphism themed sentiment analysis matching analytics design.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import adminService, { MoodTrend } from '@/services/adminService';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, Smile, Frown, Meh, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: '#22c55e', Negative: '#ef4444', Neutral: '#3b82f6', Mixed: '#eab308',
};

interface MoodData {
  trends: MoodTrend[];
  distribution: { name: string; value: number }[];
  summary: {
    total_analyzed: number;
    dominant_sentiment: string;
    sentiment_change: number;
  };
}

export default function SysMoodTrends() {
  const { toast } = useToast();
  const [moodData, setMoodData] = useState<MoodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');

  const fetchMoodData = async () => {
    setLoading(true);
    try {
      const data = await adminService.getGlobalMoodTrends(parseInt(days));
      setMoodData(data);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load mood data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMoodData(); }, [days]);

  const sentimentIcon = (sentiment: string) => {
    if (sentiment?.toLowerCase() === 'positive') return <Smile className="h-5 w-5 text-green-500" />;
    if (sentiment?.toLowerCase() === 'negative') return <Frown className="h-5 w-5 text-red-500" />;
    return <Meh className="h-5 w-5 text-gray-500" />;
  };

  // Build donut stroke segments from distribution
  const buildDonut = (dist: { name: string; value: number }[]) => {
    const segs: { color: string; dasharray: string; dashoffset: number }[] = [];
    let offset = 0;
    dist.forEach(d => {
      segs.push({
        color: SENTIMENT_COLORS[d.name] || '#6b7280',
        dasharray: `${d.value}, ${100 - d.value}`,
        dashoffset: -offset,
      });
      offset += d.value;
    });
    return segs;
  };

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end">
        <h2 className="text-3xl font-bold">Mood Trends</h2>
        <div className="flex items-center gap-2">
          {['7', '14', '30'].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                days === d ? 'bg-[hsl(var(--theme-accent-primary))] text-white' : 'bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-accent-primary)/0.2)]'
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <div className="h-24 bg-[hsl(var(--theme-bg-tertiary)/0.3)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : moodData ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] p-6 rounded-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">Messages Analyzed</p>
                  <h3 className="text-3xl font-bold mt-1">{moodData.summary?.total_analyzed?.toLocaleString() || 0}</h3>
                </div>
                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><Activity className="h-5 w-5" /></div>
              </div>
              <p className="text-xs text-[hsl(var(--theme-text-secondary))] font-medium mt-3">Past {days} days</p>
            </div>
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] p-6 rounded-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">Dominant Sentiment</p>
                  <h3 className="text-3xl font-bold mt-1 capitalize">{moodData.summary?.dominant_sentiment || 'N/A'}</h3>
                </div>
                {sentimentIcon(moodData.summary?.dominant_sentiment || 'neutral')}
              </div>
              <p className="text-xs text-emerald-500 font-medium mt-3">Platform-wide</p>
            </div>
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] p-6 rounded-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">Sentiment Score</p>
                  <h3 className="text-3xl font-bold mt-1">{Math.abs(moodData.summary?.sentiment_change || 0)}%</h3>
                </div>
                <div className="p-2 rounded-lg" style={{ background: (moodData.summary?.sentiment_change || 0) >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                  {(moodData.summary?.sentiment_change || 0) >= 0
                    ? <TrendingUp className="h-5 w-5 text-green-500" />
                    : <TrendingDown className="h-5 w-5 text-red-500" />
                  }
                </div>
              </div>
              <p className={cn('text-xs font-medium mt-3', (moodData.summary?.sentiment_change || 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                {(moodData.summary?.sentiment_change || 0) >= 0 ? '+' : ''}{moodData.summary?.sentiment_change || 0}% sentiment growth
              </p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Sentiment Over Time */}
            <div className="lg:col-span-2 bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-1">Sentiment Over Time</h3>
              <p className="text-sm text-[hsl(var(--theme-text-secondary))] mb-6">Daily sentiment distribution across the platform</p>
              {moodData.trends && moodData.trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={moodData.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--theme-border-default))" />
                    <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--theme-bg-secondary))', border: '1px solid hsl(var(--theme-border-default))', borderRadius: 8, color: 'hsl(var(--theme-text-primary))' }} />
                    <Area type="monotone" dataKey="positive" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="Positive" />
                    <Area type="monotone" dataKey="negative" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Negative" />
                    <Area type="monotone" dataKey="neutral" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Neutral" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-[hsl(var(--theme-text-secondary))]">No trend data available for this period</div>
              )}
            </div>

            {/* Mood Distribution - SVG donut matching design */}
            <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6">Mood Distribution</h3>
              {moodData.distribution && moodData.distribution.length > 0 ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex items-center justify-around w-full gap-6">
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        {buildDonut(moodData.distribution).map((seg, i) => (
                          <circle key={i} cx={18} cy={18} r={16} fill="none" stroke={seg.color} strokeWidth={4} strokeDasharray={seg.dasharray} strokeDashoffset={seg.dashoffset} />
                        ))}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold">{moodData.summary?.total_analyzed?.toLocaleString() || 0}</span>
                        <span className="text-[10px] text-[hsl(var(--theme-text-muted))] uppercase">Analyzed</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {moodData.distribution.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between w-32">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: SENTIMENT_COLORS[entry.name] || '#6b7280' }} />
                            <span className="text-sm">{entry.name}</span>
                          </div>
                          <span className="text-sm font-bold">{entry.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-[hsl(var(--theme-text-secondary))]">No distribution data available</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.15)] rounded-2xl py-12 text-center">
          <Activity className="h-12 w-12 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
          <p className="text-[hsl(var(--theme-text-secondary))]">No mood data available</p>
        </div>
      )}
    </div>
  );
}
