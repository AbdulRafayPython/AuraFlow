/**
 * System Admin — Audit Logs
 * View all admin actions taken on the platform.
 */

import { useState, useEffect } from 'react';
import adminService from '@/services/adminService';
import {
  FileText, Search, Filter, ChevronLeft, ChevronRight,
  Shield, UserX, AlertTriangle, Ban, Eye, RefreshCw,
  Loader2, Calendar, Clock
} from 'lucide-react';

interface AuditLogEntry {
  id: number;
  admin_username: string;
  admin_display_name: string;
  target_username: string | null;
  target_display_name: string | null;
  action_type: string;
  action?: string;
  target_type?: string;
  community_id?: number | null;
  community_name?: string | null;
  actor_role?: string;
  reason: string;
  details: any;
  created_at: string;
}

const ACTION_BADGES: Record<string, { label: string; color: string; icon: any }> = {
  'user.warn': { label: 'Warning', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  'user.suspend': { label: 'Suspend', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: UserX },
  'user.ban': { label: 'Ban', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Ban },
  'user.unsuspend': { label: 'Restore', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: RefreshCw },
  'user.unban': { label: 'Unban', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: RefreshCw },
  'user.role_change': { label: 'Role Change', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Shield },
  'user.block': { label: 'Block', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Ban },
  'user.unblock': { label: 'Unblock', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: RefreshCw },
  'flag.resolve': { label: 'Flag Resolved', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Shield },
  'community.update': { label: 'Community Updated', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30', icon: Eye },
  'community.delete': { label: 'Community Deleted', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Ban },
  'community.member_role_change': { label: 'Member Role', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Shield },
  'community.member_remove': { label: 'Member Removed', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: UserX },
  'agent.toggle': { label: 'Agent Toggle', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: Shield },
  'agent.community_toggle': { label: 'Agent (Community)', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: Shield },
  'settings.update': { label: 'Settings Updated', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: Shield },
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const result = await adminService.getAuditLogs({
        action: actionFilter !== 'all' ? actionFilter : undefined,
        search: search || undefined,
        limit,
        offset: page * limit,
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(0);
    loadLogs();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getActionBadge = (actionType: string) => {
    const badge = ACTION_BADGES[actionType] || { label: actionType, color: 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] border-[hsl(var(--theme-border-default))]', icon: Eye };
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">Audit Logs</h1>
        <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">Track all administrative actions performed on the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--theme-text-muted))]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by admin or target username..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          className="px-4 py-2.5 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-sm text-[hsl(var(--theme-text-primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
        >
          <option value="all">All Actions</option>
          <option value="user.warn">Warnings</option>
          <option value="user.suspend">Suspensions</option>
          <option value="user.ban">Bans</option>
          <option value="user.unsuspend">Restores</option>
          <option value="user.role_change">Role Changes</option>
          <option value="user.block">Blocks</option>
          <option value="user.unblock">Unblocks</option>
          <option value="flag.resolve">Flag Resolutions</option>
          <option value="community.update">Community Updates</option>
          <option value="community.delete">Community Deletes</option>
          <option value="agent.toggle">Agent Toggles</option>
          <option value="agent.community_toggle">Agent (Per-Community)</option>
          <option value="settings.update">Settings Updates</option>
        </select>
        <button
          onClick={handleSearch}
          className="px-5 py-2.5 rounded-xl bg-[hsl(var(--theme-accent-primary))] text-white text-sm font-medium hover:opacity-90 transition-all"
        >
          Search
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--theme-text-muted))]">
        <FileText className="w-4 h-4" />
        <span>{total} total actions logged</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[hsl(var(--theme-accent-primary))] animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-[hsl(var(--theme-text-muted))] mx-auto mb-3" />
            <p className="text-[hsl(var(--theme-text-secondary))] font-medium">No audit logs found</p>
            <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">Admin actions will appear here when performed</p>
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--theme-border-default))]">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-6 py-4 hover:bg-[hsl(var(--theme-bg-hover))] transition-colors">
                {/* Action Badge */}
                <div className="pt-0.5 flex-shrink-0">
                  {getActionBadge(log.action_type)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[hsl(var(--theme-text-primary))]">
                    <span className="font-semibold">{log.admin_display_name || log.admin_username}</span>
                    {(log.target_username || log.target_display_name) && (
                      <>
                        <span className="text-[hsl(var(--theme-text-muted))]"> → </span>
                        <span className="font-semibold">{log.target_display_name || log.target_username}</span>
                      </>
                    )}
                    {log.community_name && (
                      <span className="text-[hsl(var(--theme-text-muted))] text-xs ml-2">[{log.community_name}]</span>
                    )}
                  </p>
                  {log.reason && (
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1 line-clamp-2">
                      Reason: {log.reason}
                    </p>
                  )}
                  {log.details && typeof log.details === 'object' && (
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5 font-mono line-clamp-2">
                      {JSON.stringify(log.details)}
                    </p>
                  )}
                  {log.details && typeof log.details === 'string' && (
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                      {log.details}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-[hsl(var(--theme-text-secondary))] flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(log.created_at)}
                  </p>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {formatTime(log.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[hsl(var(--theme-text-muted))]">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
