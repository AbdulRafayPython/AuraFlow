/**
 * System Admin - Flagged Content / Moderation Dashboard
 * Glass-morphism themed moderation page matching new admin panel design.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import adminService, { FlaggedMessage, PaginationInfo } from '@/services/adminService';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertTriangle, Check, X, Ban, Trash2, RefreshCw,
  ChevronLeft, ChevronRight, Search, Shield, CheckCircle, Clock, Flag,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type ActionType = 'approve' | 'warn' | 'delete' | 'ban' | 'mute';

interface ActionDialogState {
  isOpen: boolean;
  action: ActionType | null;
  flagId: number | null;
  username: string;
}

const severityColors: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-500 border border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border border-red-500/20',
};

const actionInfo: Record<string, { dot: string; text: string }> = {
  pending: { dot: 'bg-orange-500 animate-pulse', text: 'Pending' },
  none: { dot: 'bg-orange-500 animate-pulse', text: 'Pending' },
  resolved: { dot: 'bg-emerald-500', text: 'Resolved' },
  approve: { dot: 'bg-emerald-500', text: 'Resolved' },
  warn: { dot: 'bg-sky-500', text: 'Warned' },
  delete: { dot: 'bg-emerald-500', text: 'Deleted' },
  ban: { dot: 'bg-red-500', text: 'Banned' },
};

const filterTabs = [
  { label: 'Flagged Messages', value: 'pending' },
  { label: 'Blocked Users', value: 'resolved' },
  { label: 'Moderation Log', value: 'all' },
];

export default function SysFlaggedContent() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [messages, setMessages] = useState<FlaggedMessage[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [severity, setSeverity] = useState<string>('all');
  const [status, setStatus] = useState<string>('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  const [actionDialog, setActionDialog] = useState<ActionDialogState>({ isOpen: false, action: null, flagId: null, username: '' });
  const [actionNote, setActionNote] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params: any = { limit, offset: (currentPage - 1) * limit };
      if (severity !== 'all') params.severity = severity;
      if (status !== 'all') params.status = status;
      const data = await adminService.getGlobalFlaggedMessages(params);
      setMessages(data.messages || []);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load flagged messages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMessages(); }, [severity, status, currentPage]);

  const handleAction = async () => {
    if (!actionDialog.flagId || !actionDialog.action) return;
    setActionLoading(true);
    try {
      await adminService.resolveGlobalModerationFlag(actionDialog.flagId, actionDialog.action, actionNote);
      toast({ title: 'Action Applied', description: `Successfully ${actionDialog.action}ed the flagged content.` });
      setActionDialog({ isOpen: false, action: null, flagId: null, username: '' });
      setActionNote('');
      fetchMessages();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to apply action', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 1;
  const totalFlagged = pagination?.total || messages.length;
  const resolvedCount = messages.filter(m => m.action_taken === 'approve' || m.action_taken === 'delete' || m.action_taken === 'ban').length;
  const highSeverity = messages.filter(m => m.severity === 'high' || m.severity === 'critical').length;
  const pendingCount = messages.filter(m => !m.action_taken || m.action_taken === 'none' || m.action_taken === 'pending').length;

  const kpiCards = [
    { label: 'Flagged Today', value: totalFlagged, icon: Flag, iconColor: 'text-red-400', iconBg: 'bg-red-400/10', trend: '+15%', trendColor: 'text-emerald-500' },
    { label: 'Resolved Today', value: resolvedCount, icon: CheckCircle, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-400/10', trend: '-5%', trendColor: 'text-orange-500' },
    { label: 'Active Violations', value: highSeverity, icon: AlertTriangle, iconColor: 'text-orange-400', iconBg: 'bg-orange-400/10', trend: '+2%', trendColor: 'text-emerald-500' },
    { label: 'Auto-Blocked', value: pendingCount, icon: Ban, iconColor: 'text-[hsl(var(--theme-accent-primary))]', iconBg: 'bg-[hsl(var(--theme-accent-primary)/0.1)]', trend: '-10%', trendColor: 'text-orange-500' },
  ];

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] p-6 rounded-xl hover:border-[hsl(var(--theme-accent-primary)/0.3)] transition-all shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className={cn('p-2 rounded-lg', card.iconBg)}>
                  <Icon className={cn('h-5 w-5', card.iconColor)} />
                </div>
                <span className={cn('text-xs font-bold', card.trendColor)}>{card.trend}</span>
              </div>
              <p className="text-[hsl(var(--theme-text-secondary))] text-sm font-medium">{card.label}</p>
              <h3 className="text-3xl font-bold mt-1">{card.value}</h3>
            </div>
          );
        })}
      </div>

      {/* Tab Navigation & Filters */}
      <div className="space-y-4">
        <div className="flex border-b border-[hsl(var(--theme-accent-primary)/0.1)] gap-8">
          {filterTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => { setStatus(tab.value); setCurrentPage(1); }}
              className={cn(
                'pb-3 text-sm font-bold transition-colors flex items-center gap-2',
                status === tab.value
                  ? 'border-b-2 border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-accent-primary))]'
                  : 'text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-accent-primary))]'
              )}
            >
              {tab.label}
              {tab.value === 'pending' && (
                <span className="bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))] text-[10px] px-1.5 py-0.5 rounded-full">{totalFlagged}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {['all', 'low', 'medium', 'high', 'critical'].map(sev => (
            <button
              key={sev}
              onClick={() => { setSeverity(sev); setCurrentPage(1); }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors capitalize',
                severity === sev
                  ? 'bg-[hsl(var(--theme-accent-primary)/0.1)] border-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]'
                  : 'bg-[hsl(var(--theme-accent-primary)/0.05)] hover:bg-[hsl(var(--theme-accent-primary)/0.1)] border-[hsl(var(--theme-accent-primary)/0.1)]'
              )}
            >
              {sev === 'all' ? 'Severity: All' : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--theme-accent-primary)/0.1)] bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-[hsl(var(--theme-accent-primary)/0.1)] border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
            <tr>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Severity</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">User</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Community</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Message Preview</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">AI Confidence</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td className="px-6 py-4" colSpan={8}><div className="h-5 bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded animate-pulse" /></td></tr>
              ))
            ) : messages.length === 0 ? (
              <tr>
                <td className="px-6 py-12 text-center text-[hsl(var(--theme-text-secondary))]" colSpan={8}>
                  <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  No flagged messages found
                </td>
              </tr>
            ) : (
              messages.map(msg => {
                const sev = msg.severity?.toLowerCase() || 'low';
                const actionKey = msg.action_taken?.toLowerCase().replace(' ', '_') || 'pending';
                const isExpanded = expandedRow === msg.id;
                const confidencePercent = Math.round((msg.confidence || 0) * 100);

                return (
                  <React.Fragment key={msg.id}>
                    <tr
                      className={cn(
                        'transition-colors cursor-pointer',
                        isExpanded ? 'bg-[hsl(var(--theme-accent-primary)/0.05)]' : 'hover:bg-[hsl(var(--theme-accent-primary)/0.05)]'
                      )}
                      onClick={() => setExpandedRow(isExpanded ? null : msg.id)}
                    >
                      <td className="px-6 py-4">
                        <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold capitalize', severityColors[sev])}>
                          {sev}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-full">
                            <AvatarImage src={msg.user.avatar_url || undefined} />
                            <AvatarFallback className="bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] text-xs">
                              {msg.user.username[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{msg.user.display_name || msg.user.username}</p>
                            <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">ID: {msg.user.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))]">#{msg.channel.name}</td>
                      <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))] max-w-xs truncate italic">"{msg.message_text}"</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))] rounded text-[11px]">{msg.flag_type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[hsl(var(--theme-bg-tertiary))] rounded-full overflow-hidden">
                            <div className="bg-[hsl(var(--theme-accent-primary))] h-full rounded-full" style={{ width: `${confidencePercent}%` }} />
                          </div>
                          <span className="text-xs font-bold">{confidencePercent}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[hsl(var(--theme-text-secondary))]">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : msg.id); }}
                          className={cn(
                            'font-bold hover:underline transition-colors',
                            isExpanded ? 'text-[hsl(var(--theme-accent-primary))]' : 'text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-accent-primary))]'
                          )}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <tr className="bg-[hsl(var(--theme-accent-primary)/0.1)]">
                        <td className="p-8" colSpan={8}>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 space-y-6">
                              <div className="bg-[hsl(var(--theme-bg-secondary)/0.4)] p-5 rounded-xl border border-[hsl(var(--theme-accent-primary)/0.2)]">
                                <h4 className="text-xs font-bold text-[hsl(var(--theme-accent-primary))] uppercase mb-3">Full Message Content</h4>
                                <p className="text-lg leading-relaxed">{msg.message_text}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] p-4 rounded-xl">
                                  <h4 className="text-xs font-bold text-[hsl(var(--theme-accent-primary))] uppercase mb-3">AI Analysis</h4>
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                      <span>Confidence Score</span>
                                      <span className="text-red-400 font-bold">{confidencePercent}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span>Flag Type</span>
                                      <span className="text-orange-400 font-bold">{msg.flag_type}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span>Severity Level</span>
                                      <span className={cn('font-bold capitalize', sev === 'critical' || sev === 'high' ? 'text-red-400' : sev === 'medium' ? 'text-orange-400' : 'text-blue-400')}>{sev}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] p-4 rounded-xl">
                                  <h4 className="text-xs font-bold text-[hsl(var(--theme-accent-primary))] uppercase mb-3">Details</h4>
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                      <span>Channel</span>
                                      <span className="font-bold">#{msg.channel.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span>Violations</span>
                                      <span className="font-bold text-orange-400">{msg.user.violation_count || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span>Timestamp</span>
                                      <span className="font-bold">{new Date(msg.created_at).toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-6">
                              <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] p-5 rounded-xl">
                                <h4 className="text-xs font-bold text-[hsl(var(--theme-accent-primary))] uppercase mb-4">User Info</h4>
                                <div className="flex items-center gap-3 mb-4">
                                  <Avatar className="h-10 w-10">
                                    <AvatarImage src={msg.user.avatar_url || undefined} />
                                    <AvatarFallback className="bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))]">{msg.user.username[0].toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-bold">{msg.user.display_name || msg.user.username}</p>
                                    <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">@{msg.user.username}</p>
                                  </div>
                                </div>
                                <div className="text-xs text-[hsl(var(--theme-text-secondary))]">
                                  Violation count: <span className="text-orange-400 font-bold">{msg.user.violation_count || 0}</span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => setActionDialog({ isOpen: true, action: 'approve', flagId: msg.id, username: msg.user.username })}
                                  className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                  <Check className="h-3.5 w-3.5" /> Approve Message
                                </button>
                                <button
                                  onClick={() => setActionDialog({ isOpen: true, action: 'warn', flagId: msg.id, username: msg.user.username })}
                                  className="w-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" /> Warn User
                                </button>
                                <button
                                  onClick={() => setActionDialog({ isOpen: true, action: 'delete', flagId: msg.id, username: msg.user.username })}
                                  className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete Message
                                </button>
                                <button
                                  onClick={() => setActionDialog({ isOpen: true, action: 'ban', flagId: msg.id, username: msg.user.username })}
                                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                  <Ban className="h-3.5 w-3.5" /> Ban User Permanently
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-[hsl(var(--theme-text-muted))]">
            Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, pagination.total)} of {pagination.total} flagged messages
          </p>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="h-8 w-8 rounded border border-[hsl(var(--theme-accent-primary)/0.1)] flex items-center justify-center hover:bg-[hsl(var(--theme-accent-primary)/0.1)] transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {[...Array(Math.min(totalPages, 3))].map((_, i) => (
              <button
                key={i + 1}
                onClick={() => setCurrentPage(i + 1)}
                className={cn(
                  'h-8 w-8 rounded flex items-center justify-center text-xs font-bold transition-colors',
                  currentPage === i + 1
                    ? 'bg-[hsl(var(--theme-accent-primary))] text-white shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.2)]'
                    : 'border border-[hsl(var(--theme-accent-primary)/0.1)] hover:bg-[hsl(var(--theme-accent-primary)/0.1)]'
                )}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="h-8 w-8 rounded border border-[hsl(var(--theme-accent-primary)/0.1)] flex items-center justify-center hover:bg-[hsl(var(--theme-accent-primary)/0.1)] transition-colors disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Action Dialog */}
      {actionDialog.isOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setActionDialog({ isOpen: false, action: null, flagId: null, username: '' })} />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-accent-primary)/0.2)] rounded-xl p-6 w-[420px] max-w-[90vw] z-50 space-y-4"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            <h3 className="text-lg font-bold text-[hsl(var(--theme-text-primary))] capitalize">
              {actionDialog.action} — {actionDialog.username}
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-secondary))]">Add an optional note for this moderation action.</p>
            <textarea
              className="w-full bg-[hsl(var(--theme-bg-primary))] border border-[hsl(var(--theme-border-default))] rounded-lg p-3 text-sm text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none resize-none h-24"
              placeholder="Add a note (optional)..."
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setActionDialog({ isOpen: false, action: null, flagId: null, username: '' }); setActionNote(''); }}
                className="px-4 py-2 border border-[hsl(var(--theme-border-default))] rounded-lg text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading}
                className="px-4 py-2 bg-[hsl(var(--theme-accent-primary))] text-white rounded-lg text-sm font-bold hover:bg-[hsl(var(--theme-accent-primary)/0.8)] transition-all disabled:opacity-50"
              >
                {actionLoading ? 'Applying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
