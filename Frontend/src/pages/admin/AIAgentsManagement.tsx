/**
 * AI Agents Management Page (System Admin)
 * Matching the auraflow_ai_agents_management_hub design.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { API_URL } from '@/config/api';
import {
  Brain,
  Shield,
  Heart,
  Target,
  TrendingUp,
  Leaf,
  FileText,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Plus,
  Sparkles,
  Mail,
  GraduationCap,
  Languages,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface AgentIntegration {
  community_id: number;
  community_name: string;
  is_enabled: boolean;
}

interface Agent {
  id: number;
  name: string;
  type: string;
  description: string;
  is_active: boolean;
  created_at: string;
  activity_24h: number;
  activity_7d: number;
  last_activity: string | null;
  integrations: AgentIntegration[];
}

const agentStyles: Record<string, { icon: React.ElementType; color: string; border: string; bg: string }> = {
  moderator:         { icon: Shield,         color: 'text-blue-500',    border: 'border-blue-500/20',    bg: 'bg-blue-500/10' },
  moderation:        { icon: Shield,         color: 'text-blue-500',    border: 'border-blue-500/20',    bg: 'bg-blue-500/10' },
  mood_tracker:      { icon: Heart,          color: 'text-pink-500',    border: 'border-pink-500/20',    bg: 'bg-pink-500/10' },
  mood:              { icon: Heart,          color: 'text-pink-500',    border: 'border-pink-500/20',    bg: 'bg-pink-500/10' },
  focus:             { icon: Target,         color: 'text-purple-500',  border: 'border-purple-500/20',  bg: 'bg-purple-500/10' },
  engagement:        { icon: TrendingUp,     color: 'text-orange-500',  border: 'border-orange-500/20',  bg: 'bg-orange-500/10' },
  wellness:          { icon: Leaf,           color: 'text-teal-500',    border: 'border-teal-500/20',    bg: 'bg-teal-500/10' },
  summarizer:        { icon: FileText,       color: 'text-yellow-500',  border: 'border-yellow-500/20',  bg: 'bg-yellow-500/10' },
  knowledge_builder: { icon: Brain,          color: 'text-indigo-500',  border: 'border-indigo-500/20',  bg: 'bg-indigo-500/10' },
  knowledge:         { icon: Brain,          color: 'text-indigo-500',  border: 'border-indigo-500/20',  bg: 'bg-indigo-500/10' },
  assistant:         { icon: Sparkles,       color: 'text-violet-500',  border: 'border-violet-500/20',  bg: 'bg-violet-500/10' },
  auto_message:      { icon: Mail,           color: 'text-amber-500',   border: 'border-amber-500/20',   bg: 'bg-amber-500/10' },
  support:           { icon: GraduationCap,  color: 'text-emerald-500', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10' },
  translator:        { icon: Languages,      color: 'text-cyan-500',    border: 'border-cyan-500/20',    bg: 'bg-cyan-500/10' },
};

const agentSecondStat: Record<string, string> = {
  moderation:        'Accuracy',
  moderator:         'Accuracy',
  mood_tracker:      'Avg Score',
  mood:              'Avg Score',
  focus:             'Optimized',
  engagement:        'Conversion',
  wellness:          'Engagement',
  summarizer:        'Accuracy',
  knowledge_builder: 'Coverage',
  knowledge:         'Coverage',
  assistant:         'Replies',
  auto_message:      'Welcomes',
  support:           'KB Hits',
  translator:        'Translated',
};

export default function AIAgentsManagement() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/system/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setAgents(data.agents);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const toggleAgent = async (agentId: number, isActive: boolean) => {
    setToggling(agentId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/system/agents/${agentId}/toggle`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setAgents(prev => prev.map(a => a.id === agentId ? { ...a, is_active: isActive } : a));
      }
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    } finally {
      setToggling(null);
    }
  };

  const getAgentStyle = (type: string) => {
    return agentStyles[type] || { icon: Brain, color: 'text-[#8c2bee]', border: 'border-[#8c2bee]/20', bg: 'bg-[#8c2bee]/10' };
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Build recent activity from agent data
  const recentActivities = agents
    .filter(a => a.last_activity && a.is_active)
    .sort((a, b) => new Date(b.last_activity!).getTime() - new Date(a.last_activity!).getTime())
    .slice(0, 4)
    .map(a => {
      const style = getAgentStyle(a.type);
      const time = a.last_activity ? new Date(a.last_activity).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
      return { agent: a, style, time };
    });

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Agents</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="bg-[#160d1f] border border-[#2d1b41] focus:border-[#8c2bee] focus:ring-0 rounded-lg pl-10 pr-3 py-2 text-sm w-64 placeholder-slate-500 text-slate-100 transition-colors"
              placeholder="Search agents..."
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-[#8c2bee] hover:bg-[#8c2bee]/90 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all shadow-lg shadow-[#8c2bee]/20">
            <Plus className="h-4 w-4" />
            Create New Agent
          </button>
        </div>
      </div>

      {/* Agent Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-[#8c2bee]" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          No AI agents found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => {
            const style = getAgentStyle(agent.type);
            const Icon = style.icon;
            const secondLabel = agentSecondStat[agent.type] || 'Score';
            return (
              <div
                key={agent.id}
                className={cn(
                  'bg-[#160d1f] border border-[#2d1b41] rounded-xl p-5 hover:border-[#8c2bee]/50 transition-all flex flex-col',
                  !agent.is_active && 'opacity-75 grayscale hover:grayscale-0 hover:opacity-100'
                )}
              >
                {/* Top row: icon + status + toggle */}
                <div className="flex items-start justify-between mb-4">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center border', style.bg, style.border, style.color)}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('flex h-2 w-2 rounded-full', agent.is_active ? 'bg-green-500' : 'bg-slate-500')} />
                    <span className={cn('text-xs font-semibold uppercase tracking-wider', agent.is_active ? 'text-green-500' : 'text-slate-500')}>
                      {agent.is_active ? 'Active' : 'Idle'}
                    </span>
                    <Switch
                      checked={agent.is_active}
                      onCheckedChange={(checked) => toggleAgent(agent.id, checked)}
                      disabled={toggling === agent.id}
                      className="ml-2"
                    />
                  </div>
                </div>

                {/* Name + Description */}
                <h3 className="text-lg font-bold mb-1">{agent.name}</h3>
                <p className="text-sm text-slate-400 mb-6 line-clamp-2">
                  {agent.description || `${agent.type} agent`}
                </p>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Actions</p>
                    <p className="text-lg font-bold">
                      {agent.is_active ? formatCount(agent.activity_24h) : '--'}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">{secondLabel}</p>
                    <p className="text-lg font-bold">
                      {agent.is_active ? formatCount(agent.activity_7d) : '--'}
                    </p>
                  </div>
                </div>

                {/* Configure Button */}
                <button className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors border border-white/5 mt-auto">
                  Configure
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Execution Chart Placeholder */}
      {!loading && agents.length > 0 && (
        <div className="bg-[#160d1f] border border-[#2d1b41] rounded-xl p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold">Agent Executions</h3>
              <p className="text-sm text-slate-400">Activity volume across all agents (last 24h)</p>
            </div>
            <div className="flex gap-4">
              {[
                { label: 'Moderation', color: 'bg-blue-500' },
                { label: 'Mood', color: 'bg-pink-500' },
                { label: 'Wellness', color: 'bg-teal-500' },
              ].map(legend => (
                <div key={legend.label} className="flex items-center gap-2">
                  <span className={cn('w-3 h-3 rounded-full', legend.color)} />
                  <span className="text-xs text-slate-300">{legend.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* SVG Chart */}
          <div className="relative h-64 w-full">
            <div className="absolute inset-0 flex flex-col justify-between py-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="border-t border-white/5 w-full" />
              ))}
            </div>
            <svg className="w-full h-full relative" viewBox="0 0 1000 200" preserveAspectRatio="none">
              <path d="M0,150 Q50,120 100,140 T200,80 T300,110 T400,60 T500,90 T600,40 T700,70 T800,20 T900,50 T1000,30" fill="none" stroke="#3b82f6" strokeWidth="3" />
              <path d="M0,180 Q50,160 100,170 T200,140 T300,150 T400,120 T500,140 T600,110 T700,130 T800,90 T900,110 T1000,100" fill="none" stroke="#ec4899" strokeWidth="3" />
              <path d="M0,190 Q50,185 100,188 T200,180 T300,182 T400,175 T500,178 T600,170 T700,172 T800,165 T900,168 T1000,160" fill="none" stroke="#14b8a6" strokeWidth="3" />
            </svg>
          </div>
          <div className="flex justify-between mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>23:59</span>
          </div>
        </div>
      )}

      {/* Recent Agent Activity */}
      {!loading && recentActivities.length > 0 && (
        <div className="bg-[#160d1f] border border-[#2d1b41] rounded-xl overflow-hidden">
          <div className="p-6 border-b border-[#2d1b41] flex items-center justify-between">
            <h3 className="text-xl font-bold">Recent Agent Activity</h3>
            <button className="text-[#8c2bee] text-sm font-semibold hover:underline">View All Logs</button>
          </div>
          <div className="divide-y divide-[#2d1b41]">
            {recentActivities.map(({ agent, style, time }, i) => (
              <div key={i} className="p-4 hover:bg-white/5 transition-colors flex items-center gap-4">
                <span className="text-xs text-slate-500 tabular-nums">{time}</span>
                <span className={cn('px-2 py-1 rounded text-[10px] font-bold uppercase border', style.bg, style.color, style.border)}>
                  {agent.name.split(' ')[0]}
                </span>
                <div className="flex-1">
                  <p className="text-sm">
                    {agent.activity_24h} actions processed in the last 24 hours
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircle className="h-3 w-3" />
                  Handled
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
