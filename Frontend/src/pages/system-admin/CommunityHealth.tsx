/**
 * System Admin - Community Management Hub
 * Matching the auraflow_community_management_hub design.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import adminService from '@/services/adminService';
import { API_SERVER } from '@/config/api';
import {
  Users, MessageSquare, TrendingUp, Hash, AlertCircle, Plus
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface HealthData {
  health_score: number;
  activity_trend: 'up' | 'down' | 'stable';
  metrics: {
    engagement_rate: number;
    retention_rate: number;
    growth_rate: number;
  };
  summary?: {
    total_users: number;
    active_users: number;
    total_messages: number;
    total_communities: number;
  };
  communities?: Array<{
    id: number;
    name: string;
    member_count: number;
    channel_count: number;
    health_score: number;
    logo_url?: string;
    banner_url?: string;
    description?: string;
    creator_name?: string;
    message_count?: number;
    active_users?: number;
  }>;
  top_channels?: Array<{
    name: string;
    message_count: number;
    activity_percent: number;
  }>;
}

function HealthCircle({ score, size = 48 }: { score: number; size?: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#f43f5e';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 48 48">
        <circle cx={24} cy={24} r={r} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth={4} />
        <circle cx={24} cy={24} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-500" />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color }}>{score}%</span>
    </div>
  );
}

const heatmapRows = [
  [10, 20, 10, 30, 60, 80, 100, 70, 40, 20, 10, 10],
  [20, 30, 40, 60, 90, 100, 90, 60, 40, 30, 20, 20],
  [30, 40, 60, 80, 90, 80, 70, 50, 40, 30, 30, 20],
  [10, 20, 30, 40, 60, 50, 40, 30, 20, 10, 10, 10],
];
const heatmapDays = ['Mon', 'Wed', 'Fri', 'Sun'];

function getActivityLabel(percent: number): { label: string; cls: string } {
  if (percent >= 80) return { label: 'Extremely High', cls: 'bg-green-500/10 text-green-500' };
  if (percent >= 60) return { label: 'High', cls: 'bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-accent-primary))]' };
  if (percent >= 30) return { label: 'Medium', cls: 'bg-yellow-500/10 text-yellow-500' };
  return { label: 'Low', cls: 'bg-slate-500/10 text-slate-500' };
}

export default function SysCommunityHealth() {
  const { toast } = useToast();
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCommunity, setSelectedCommunity] = useState<HealthData['communities']extends (infer T)[] ? T | null : never>(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const data = await adminService.getGlobalCommunityHealth(parseInt(days));
      setHealthData(data);
      if (data.communities?.length) {
        setSelectedCommunity(data.communities[0]);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load health data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, [days]);

  const tabs = ['Overview', 'Members', 'Channels', 'Settings'];

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end">
        <h2 className="text-3xl font-bold">Community Overview</h2>
        <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-emerald-500/20">
          <Plus className="h-4 w-4" />
          Create New
        </button>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-border-default)/0.5)] rounded-xl p-5">
              <div className="h-32 bg-[hsl(var(--theme-bg-tertiary)/0.3)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : healthData ? (
        <>
          {/* Community Cards Grid */}
          {healthData.communities && healthData.communities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {healthData.communities.slice(0, 4).map((c) => {
                const isSelected = selectedCommunity?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCommunity(c)}
                    className={cn(
                      'bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-border-default)/0.5)] p-5 rounded-xl space-y-4 hover:border-[hsl(var(--theme-accent-primary)/0.5)] transition-all cursor-pointer',
                      isSelected && 'border-[hsl(var(--theme-accent-primary)/0.4)]'
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="w-14 h-14 rounded-xl bg-[hsl(var(--theme-accent-primary)/0.3)] flex items-center justify-center text-[hsl(var(--theme-accent-primary))] font-bold text-lg overflow-hidden">
                        {c.logo_url ? (
                          <img src={`${API_SERVER}${c.logo_url}`} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          c.name[0]
                        )}
                      </div>
                      <HealthCircle score={c.health_score} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{c.name}</h3>
                      <p className="text-sm text-[hsl(var(--theme-text-secondary))]">{(c.member_count || 0).toLocaleString()} members &bull; {c.channel_count || 0} channels</p>
                    </div>
                    <button
                      className={cn(
                        'w-full py-2 rounded-lg font-medium transition-colors text-sm',
                        isSelected
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]'
                      )}
                    >
                      {isSelected ? 'Managing' : 'Manage'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-border-default)/0.5)] rounded-xl py-12 text-center">
              <AlertCircle className="h-12 w-12 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
              <p className="text-[hsl(var(--theme-text-secondary))]">No communities found</p>
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
            <div className="flex gap-8">
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={cn(
                    'pb-4 px-2 border-b-2 font-bold text-sm transition-colors',
                    activeTab === tab.toLowerCase()
                      ? 'border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-accent-primary))]'
                      : 'border-transparent text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-accent-primary))]'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Community Detail Banner */}
          {selectedCommunity && (
            <div className="relative h-48 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--theme-bg-secondary))/0.8] to-transparent z-10" />
              {selectedCommunity.banner_url ? (
                <img
                  src={`${API_SERVER}${selectedCommunity.banner_url}`}
                  alt={`${selectedCommunity.name} banner`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--theme-accent-primary)/0.3)] to-[hsl(var(--theme-bg-secondary))]" />
              )}
              <div className="absolute bottom-6 left-6 z-20 flex items-end gap-5">
                <div className="w-24 h-24 rounded-2xl border-4 border-[hsl(var(--theme-bg-secondary))] bg-[hsl(var(--theme-accent-primary)/0.3)] p-1 shadow-2xl flex items-center justify-center text-[hsl(var(--theme-accent-primary))] text-3xl font-bold overflow-hidden">
                  {selectedCommunity.logo_url ? (
                    <img src={`${API_SERVER}${selectedCommunity.logo_url}`} alt={selectedCommunity.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    selectedCommunity.name[0]
                  )}
                </div>
                <div className="mb-1">
                  <h3 className="text-2xl font-bold text-white">{selectedCommunity.name}</h3>
                  <p className="text-slate-200">
                    {selectedCommunity.description || `${(selectedCommunity.member_count || 0).toLocaleString()} members \u2022 ${selectedCommunity.channel_count || 0} channels`}
                  </p>
                </div>
              </div>
              {selectedCommunity.creator_name && (
                <div className="absolute top-6 right-6 z-20">
                  <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 rounded-lg border border-white/10">
                    <span className="text-xs text-white/70">Owned by</span>
                    <div className="w-6 h-6 rounded-full bg-[hsl(var(--theme-accent-primary)/0.5)] flex items-center justify-center text-[10px] font-bold text-white">
                      {selectedCommunity.creator_name[0]}
                    </div>
                    <span className="text-xs font-bold text-white">{selectedCommunity.creator_name}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Grid */}
          {healthData.summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[hsl(var(--theme-bg-hover))] p-6 rounded-xl border border-[hsl(var(--theme-border-default)/0.5)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--theme-text-muted))]">Total Members</p>
                  <p className="text-2xl font-bold">{healthData.summary.total_users.toLocaleString()}</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500 text-xs font-bold">{healthData.metrics.growth_rate}%</span>
                </div>
              </div>
              <div className="bg-[hsl(var(--theme-bg-hover))] p-6 rounded-xl border border-[hsl(var(--theme-border-default)/0.5)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[hsl(var(--theme-accent-primary)/0.1)] flex items-center justify-center text-[hsl(var(--theme-accent-primary))]">
                  <Hash className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--theme-text-muted))]">Active Channels</p>
                  <p className="text-2xl font-bold">{healthData.summary.total_communities}</p>
                </div>
                <div className="ml-auto">
                  <span className="text-[hsl(var(--theme-text-secondary))] text-xs font-bold">Stable</span>
                </div>
              </div>
              <div className="bg-[hsl(var(--theme-bg-hover))] p-6 rounded-xl border border-[hsl(var(--theme-border-default)/0.5)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--theme-text-muted))]">Messages This Week</p>
                  <p className="text-2xl font-bold">{healthData.summary.total_messages.toLocaleString()}</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500 text-xs font-bold">{healthData.metrics.engagement_rate}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Heatmap + Channel Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Activity Heatmap */}
            <div className="bg-[hsl(var(--theme-bg-hover))] p-6 rounded-xl border border-[hsl(var(--theme-border-default)/0.5)] space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-bold">Member Activity Heatmap</h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[hsl(var(--theme-text-muted))] uppercase tracking-widest font-bold">Low</span>
                  <div className="flex gap-1">
                    {[10, 30, 60, 100].map(v => (
                      <div key={v} className="w-3 h-3 rounded-sm" style={{ background: `hsl(var(--theme-accent-primary) / ${v / 100})` }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-[hsl(var(--theme-text-muted))] uppercase tracking-widest font-bold">High</span>
                </div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-2">
                <div className="flex flex-col justify-between text-[10px] text-[hsl(var(--theme-text-secondary))] font-medium py-1">
                  {heatmapDays.map(d => <span key={d}>{d}</span>)}
                </div>
                <div className="grid grid-cols-12 gap-1.5">
                  {heatmapRows.flat().map((v, i) => (
                    <div key={i} className="aspect-square rounded-sm" style={{ background: `hsl(var(--theme-accent-primary) / ${v / 100})` }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Channel Breakdown Table */}
            <div className="bg-[hsl(var(--theme-bg-hover))] p-6 rounded-xl border border-[hsl(var(--theme-border-default)/0.5)] space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-bold">Channel Breakdown</h4>
                <span className="text-[hsl(var(--theme-accent-primary))] text-xs font-bold cursor-pointer hover:underline">View All</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[hsl(var(--theme-text-muted))] border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
                      <th className="pb-3 font-medium">Channel Name</th>
                      <th className="pb-3 font-medium">Messages</th>
                      <th className="pb-3 font-medium">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
                    {healthData.top_channels && healthData.top_channels.length > 0 ? (
                      healthData.top_channels.slice(0, 4).map((ch, i) => {
                        const activity = getActivityLabel(ch.activity_percent);
                        return (
                          <tr key={i}>
                            <td className="py-3 flex items-center gap-2">
                              <span className="text-slate-400">#</span>
                              <span className="font-medium">{ch.name}</span>
                            </td>
                            <td className="py-3">{ch.message_count.toLocaleString()}</td>
                            <td className="py-3">
                              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', activity.cls)}>
                                {activity.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <>
                        {[
                          { name: 'general', msgs: '—', pct: 0 },
                          { name: 'announcements', msgs: '—', pct: 0 },
                        ].map((ch, i) => (
                          <tr key={i}>
                            <td className="py-3 flex items-center gap-2">
                              <span className="text-[hsl(var(--theme-text-secondary))]">#</span>
                              <span className="font-medium">{ch.name}</span>
                            </td>
                            <td className="py-3 text-[hsl(var(--theme-text-muted))]">{ch.msgs}</td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--theme-text-muted)/0.1)] text-[hsl(var(--theme-text-muted))] text-[10px] font-bold">No data</span>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-[hsl(var(--theme-bg-hover))] border border-[hsl(var(--theme-border-default)/0.5)] rounded-2xl py-12 text-center">
          <AlertCircle className="h-12 w-12 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
          <p className="text-[hsl(var(--theme-text-secondary))]">No health data available</p>
        </div>
      )}
    </div>
  );
}
