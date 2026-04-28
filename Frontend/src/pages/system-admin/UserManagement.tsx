/**
 * System Admin - User Management Page
 * Glass-morphism themed user management with fully working actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import adminService, { CommunityMember, PaginationInfo } from '@/services/adminService';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search, ChevronLeft, ChevronRight, X,
  Building2, AlertTriangle, ShieldCheck, ShieldOff,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type GlobalUser = CommunityMember & {
  account_status?: string;
  account_status_reason?: string;
  account_status_until?: string;
  system_role?: string;
};

const filterTabs = [
  { label: 'All Users', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
];

const roleColors: Record<string, string> = {
  system_admin: 'bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]',
  admin: 'bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]',
  moderator: 'bg-amber-500/20 text-amber-500',
  member: 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]',
  user: 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]',
};

const statusDotColors: Record<string, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
};

const accountStatusBadge: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  suspended: 'bg-amber-500/15 text-amber-400',
  banned: 'bg-red-500/15 text-red-400',
};

// ── Confirmation Dialog ──────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, confirmClass, children, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel: string; confirmClass?: string;
  children?: React.ReactNode; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-accent-primary)/0.2)] rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-[hsl(var(--theme-text-secondary))]">{message}</p>
        {children}
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 h-10 rounded-xl border border-[hsl(var(--theme-border-default))] text-sm font-medium hover:bg-[hsl(var(--theme-bg-tertiary))] transition-colors">Cancel</button>
          <button onClick={onConfirm} className={cn('flex-1 h-10 rounded-xl text-sm font-bold transition-colors', confirmClass || 'bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90')}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function SysUserManagement() {
  const { toast } = useToast();

  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<GlobalUser | null>(null);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const limit = 20;

  // Dialog states
  const [warnOpen, setWarnOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [dialogReason, setDialogReason] = useState('');
  const [suspendDays, setSuspendDays] = useState(7);
  const [selectedRole, setSelectedRole] = useState<'user' | 'system_admin'>('user');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit, offset: (currentPage - 1) * limit };
      if (filter !== 'all') params.account_status = filter;
      if (search) params.search = search;
      const data = await adminService.getGlobalUsers(params);
      setUsers(data.members || []);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, currentPage]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = () => {
    setCurrentPage(1);
    setSearch(searchInput);
  };

  const viewDetails = async (user: GlobalUser) => {
    setSelectedUser(user);
    setDetailsLoading(true);
    try {
      const details = await adminService.getGlobalUserDetails(user.id);
      setUserDetails(details);
    } catch {
      toast({ title: 'Error', description: 'Failed to load user details', variant: 'destructive' });
    } finally {
      setDetailsLoading(false);
    }
  };

  const closePanel = () => { setSelectedUser(null); setUserDetails(null); };

  // ── Action handlers ──────────────────────────────────────
  const handleWarn = async () => {
    if (!selectedUser || !dialogReason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.warnUser(selectedUser.id, dialogReason.trim());
      toast({ title: 'Warning Sent', description: `Warning sent to ${selectedUser.display_name || selectedUser.username}` });
      setWarnOpen(false);
      setDialogReason('');
      viewDetails(selectedUser);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedUser || !dialogReason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.suspendUser(selectedUser.id, dialogReason.trim(), suspendDays);
      toast({ title: 'User Suspended', description: `${selectedUser.display_name || selectedUser.username} suspended for ${suspendDays} days` });
      setSuspendOpen(false);
      setDialogReason('');
      setSuspendDays(7);
      fetchUsers();
      viewDetails(selectedUser);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBan = async () => {
    if (!selectedUser || !dialogReason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.banUser(selectedUser.id, dialogReason.trim());
      toast({ title: 'User Banned', description: `${selectedUser.display_name || selectedUser.username} has been banned` });
      setBanOpen(false);
      setDialogReason('');
      fetchUsers();
      viewDetails(selectedUser);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await adminService.updateUserSystemRole(selectedUser.id, selectedRole);
      toast({ title: 'Role Updated', description: `Role changed to ${selectedRole.replace('_', ' ')}` });
      setRoleOpen(false);
      fetchUsers();
      viewDetails(selectedUser);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await adminService.unsuspendUser(selectedUser.id);
      toast({ title: 'User Restored', description: `${selectedUser.display_name || selectedUser.username} restored to active` });
      fetchUsers();
      viewDetails(selectedUser);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 1;

  const getAccountStatus = (user: GlobalUser) => user.account_status || 'active';

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Filter Tabs */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {filterTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setFilter(tab.value); setCurrentPage(1); }}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
              filter === tab.value
                ? 'bg-[hsl(var(--theme-accent-primary))] text-white'
                : 'bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-accent-primary)/0.1)]'
            )}
          >
            {tab.label} {tab.value === 'all' && pagination ? `(${pagination.total.toLocaleString()})` : ''}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--theme-text-muted))]" />
          <input
            className="w-full bg-[hsl(var(--theme-bg-tertiary))] border-none rounded-xl pl-12 pr-4 h-11 focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] text-sm placeholder:text-[hsl(var(--theme-text-muted))]"
            placeholder="Search by name, email, or username..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[hsl(var(--theme-bg-tertiary))] text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Account Status</th>
              <th className="px-6 py-4">Presence</th>
              <th className="px-6 py-4">Stats</th>
              <th className="px-6 py-4">Violations</th>
              <th className="px-6 py-4">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td className="px-6 py-4" colSpan={7}><div className="h-5 bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded animate-pulse" /></td></tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td className="px-6 py-12 text-center text-[hsl(var(--theme-text-secondary))]" colSpan={7}>
                  No users found matching your criteria
                </td>
              </tr>
            ) : (
              users.map(user => {
                const acctStatus = getAccountStatus(user);
                const isBanned = acctStatus === 'banned';
                const isSuspended = acctStatus === 'suspended';
                const violationCount = user.stats?.violation_count || 0;
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      'hover:bg-[hsl(var(--theme-accent-primary)/0.05)] transition-colors cursor-pointer',
                      selectedUser?.id === user.id && 'bg-[hsl(var(--theme-accent-primary)/0.1)]'
                    )}
                    onClick={() => viewDetails(user)}
                  >
                    <td className="px-6 py-4">
                      <div className={cn('flex items-center gap-3', isBanned && 'opacity-60')}>
                        <div className="h-10 w-10 rounded-full border border-[hsl(var(--theme-accent-primary)/0.3)] overflow-hidden flex-shrink-0">
                          <Avatar className="h-full w-full">
                            <AvatarImage src={user.avatar_url || undefined} className="object-cover" />
                            <AvatarFallback className="bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] text-sm">
                              {(user.display_name || user.username)[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div>
                          <p className={cn('text-sm font-bold', isBanned && 'line-through')}>{user.display_name || user.username}</p>
                          <p className="text-xs text-[hsl(var(--theme-text-muted))]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('px-3 py-1 text-[10px] font-bold rounded-full uppercase', roleColors[user.role || user.system_role || 'user'])}>
                        {(user.role || user.system_role || 'user').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('px-3 py-1 text-[10px] font-bold rounded-full capitalize', accountStatusBadge[acctStatus] || accountStatusBadge.active)}>
                        {acctStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn('h-2 w-2 rounded-full', statusDotColors[user.status] || 'bg-slate-500')} />
                        <span className="text-xs font-medium capitalize">{user.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn('text-xs', (isBanned || isSuspended) && 'opacity-60 text-[hsl(var(--theme-text-muted))]')}>
                        <p className="font-medium">{user.stats?.community_count || 0} Communities</p>
                        <p className="text-[hsl(var(--theme-text-muted))]">{(user.stats?.message_count || 0).toLocaleString()} messages</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('text-xs font-medium', violationCount > 2 ? 'text-red-500' : violationCount > 0 ? 'text-amber-500' : '')}>
                        {violationCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-[hsl(var(--theme-text-muted))]">
                      {user.last_seen ? new Date(user.last_seen).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {/* Pagination */}
        {pagination && totalPages > 1 && (
          <div className="px-6 py-4 bg-[hsl(var(--theme-bg-tertiary))] flex items-center justify-between">
            <p className="text-xs text-[hsl(var(--theme-text-muted))]">
              Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, pagination.total)} of {pagination.total.toLocaleString()} entries
            </p>
            <div className="flex items-center gap-2">
              <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-text-muted))] disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      'text-xs font-bold px-3 py-1 rounded-md',
                      currentPage === page ? 'text-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary)/0.1)]' : 'text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-accent-primary)/0.05)]'
                    )}
                  >
                    {page}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="text-xs text-[hsl(var(--theme-text-muted))] px-2">...</span>}
              <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-text-muted))] disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Over Profile Panel */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closePanel} />
          <aside className="fixed top-0 right-0 h-full w-[420px] max-w-full bg-[hsl(var(--theme-bg-secondary)/0.95)] backdrop-blur-xl border-l border-[hsl(var(--theme-accent-primary)/0.2)] z-50 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
              <h2 className="font-bold">User Details</h2>
              <button onClick={closePanel} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-text-muted))]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailsLoading ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded animate-pulse" />)}
                </div>
              ) : (
                <>
                  {/* Profile Header */}
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="relative">
                      <div className="h-20 w-20 rounded-full border-4 border-[hsl(var(--theme-accent-primary)/0.3)] p-0.5">
                        <Avatar className="h-full w-full rounded-full">
                          <AvatarImage src={selectedUser.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback className="bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] text-2xl">
                            {(selectedUser.display_name || selectedUser.username)[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className={cn('absolute bottom-0 right-0 h-5 w-5 rounded-full border-4 border-[hsl(var(--theme-bg-secondary))]', statusDotColors[selectedUser.status] || 'bg-slate-500')} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{selectedUser.display_name || selectedUser.username}</h3>
                      <p className="text-sm text-[hsl(var(--theme-text-muted))] font-medium">{selectedUser.email}</p>
                      <p className="text-xs text-[hsl(var(--theme-text-secondary))] mt-1">Joined {new Date(selectedUser.created_at || selectedUser.joined_at).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    {/* Account Status Badge */}
                    {(() => {
                      const acctStatus = userDetails?.user?.account_status || getAccountStatus(selectedUser);
                      return (
                        <span className={cn('px-4 py-1.5 text-xs font-bold rounded-full capitalize', accountStatusBadge[acctStatus] || accountStatusBadge.active)}>
                          {acctStatus === 'suspended' && userDetails?.user?.account_status_until
                            ? `Suspended until ${new Date(userDetails.user.account_status_until).toLocaleDateString()}`
                            : acctStatus}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[hsl(var(--theme-bg-tertiary))] rounded-xl p-3 text-center">
                      <p className="text-lg font-bold">{selectedUser.stats?.community_count || 0}</p>
                      <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">Communities</p>
                    </div>
                    <div className="bg-[hsl(var(--theme-bg-tertiary))] rounded-xl p-3 text-center">
                      <p className="text-lg font-bold">{(selectedUser.stats?.message_count || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">Messages</p>
                    </div>
                    <div className="bg-[hsl(var(--theme-bg-tertiary))] rounded-xl p-3 text-center">
                      <p className={cn('text-lg font-bold', (selectedUser.stats?.violation_count || 0) > 0 ? 'text-red-400' : '')}>{selectedUser.stats?.violation_count || 0}</p>
                      <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">Violations</p>
                    </div>
                  </div>

                  {/* Role Display */}
                  <div className="flex items-center justify-between bg-[hsl(var(--theme-bg-tertiary))] rounded-xl p-4">
                    <div>
                      <p className="text-xs text-[hsl(var(--theme-text-muted))] font-medium">System Role</p>
                      <p className="text-sm font-bold capitalize">{(userDetails?.user?.role || selectedUser.role || 'user').replace('_', ' ')}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedRole((userDetails?.user?.role || selectedUser.role || 'user') as any);
                        setRoleOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[hsl(var(--theme-accent-primary)/0.3)] hover:bg-[hsl(var(--theme-accent-primary)/0.1)] transition-colors"
                    >
                      Change Role
                    </button>
                  </div>

                  {/* Communities */}
                  {userDetails?.communities && userDetails.communities.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">Communities</label>
                        <span className="text-xs font-bold text-[hsl(var(--theme-accent-primary))]">{userDetails.communities.length} Total</span>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {userDetails.communities.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-[hsl(var(--theme-bg-tertiary))] rounded-xl">
                            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.2)] flex items-center justify-center flex-shrink-0">
                              <Building2 className="h-4 w-4 text-[hsl(var(--theme-accent-primary))]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">{c.name}</p>
                              <p className="text-[10px] text-[hsl(var(--theme-text-muted))] capitalize">{c.role || 'member'} {c.violation_count > 0 ? `• ${c.violation_count} violations` : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Moderation History */}
                  {userDetails?.moderation_history && userDetails.moderation_history.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">Moderation Flags</label>
                      <div className="space-y-2 max-h-36 overflow-y-auto">
                        {userDetails.moderation_history.map((m: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-[hsl(var(--theme-bg-tertiary))] rounded-xl">
                            <AlertTriangle className={cn('h-4 w-4 flex-shrink-0 mt-0.5', m.severity === 'high' || m.severity === 'critical' ? 'text-red-400' : 'text-amber-400')} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold capitalize">{m.flag_type || 'Flag'} — {m.severity}</p>
                              <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">Action: {m.action_taken} • {m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Admin Action History */}
                  {userDetails?.admin_actions && userDetails.admin_actions.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">Admin Actions</label>
                      <div className="border-l-2 border-[hsl(var(--theme-accent-primary)/0.2)] ml-2 pl-5 space-y-4 relative">
                        {userDetails.admin_actions.map((a: any, i: number) => (
                          <div key={i} className="relative">
                            <div className={cn(
                              'absolute -left-[27px] top-1 h-3 w-3 rounded-full',
                              a.action_type === 'ban' ? 'bg-red-500' : a.action_type === 'suspend' ? 'bg-amber-500' : a.action_type === 'warn' ? 'bg-yellow-500' : 'bg-[hsl(var(--theme-accent-primary))]'
                            )} />
                            <p className="text-xs font-bold capitalize">{a.action_type.replace('_', ' ')}</p>
                            <p className="text-[10px] text-[hsl(var(--theme-text-muted))] italic">{a.reason}</p>
                            <p className="text-[10px] text-[hsl(var(--theme-text-secondary))]">by {a.admin_username} • {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-[hsl(var(--theme-accent-primary)/0.1)] space-y-3">
                    {(() => {
                      const acctStatus = userDetails?.user?.account_status || getAccountStatus(selectedUser);
                      const isSystemAdmin = (userDetails?.user?.role || selectedUser.role) === 'system_admin';

                      if (acctStatus === 'suspended' || acctStatus === 'banned') {
                        return (
                          <button
                            onClick={handleRestore}
                            disabled={actionLoading}
                            className="w-full h-11 bg-emerald-500/15 text-emerald-400 rounded-xl text-sm font-bold hover:bg-emerald-500/25 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            Restore to Active
                          </button>
                        );
                      }

                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => { setDialogReason(''); setWarnOpen(true); }}
                            disabled={isSystemAdmin}
                            className="h-10 border border-[hsl(var(--theme-accent-primary)/0.3)] rounded-lg text-xs font-bold hover:bg-[hsl(var(--theme-accent-primary)/0.1)] transition-colors disabled:opacity-30"
                          >
                            Send Warning
                          </button>
                          <button
                            onClick={() => { setDialogReason(''); setSuspendDays(7); setSuspendOpen(true); }}
                            disabled={isSystemAdmin}
                            className="h-10 bg-amber-500/10 text-amber-500 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition-colors disabled:opacity-30"
                          >
                            Suspend
                          </button>
                          <button
                            onClick={() => { setDialogReason(''); setBanOpen(true); }}
                            disabled={isSystemAdmin}
                            className="h-10 bg-red-500/10 text-red-500 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors col-span-2 disabled:opacity-30"
                          >
                            <ShieldOff className="h-3.5 w-3.5 inline mr-1.5" />
                            Ban Account
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ── Warning Dialog ── */}
      <ConfirmDialog
        open={warnOpen}
        title="Send Warning"
        message={`Send an official warning to ${selectedUser?.display_name || selectedUser?.username}. This will be recorded in their admin action history.`}
        confirmLabel={actionLoading ? 'Sending...' : 'Send Warning'}
        confirmClass="bg-yellow-600 text-white hover:bg-yellow-700"
        onConfirm={handleWarn}
        onCancel={() => setWarnOpen(false)}
      >
        <textarea
          className="w-full bg-[hsl(var(--theme-bg-tertiary)/0.6)] border border-[hsl(var(--theme-border-default))] rounded-xl p-3 text-sm resize-none h-24 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))] placeholder:text-[hsl(var(--theme-text-muted))]"
          placeholder="Reason for warning (required)..."
          value={dialogReason}
          onChange={e => setDialogReason(e.target.value)}
        />
      </ConfirmDialog>

      {/* ── Suspend Dialog ── */}
      <ConfirmDialog
        open={suspendOpen}
        title="Suspend User"
        message={`Suspend ${selectedUser?.display_name || selectedUser?.username} from the platform. They will not be able to log in during the suspension period.`}
        confirmLabel={actionLoading ? 'Suspending...' : 'Suspend User'}
        confirmClass="bg-amber-600 text-white hover:bg-amber-700"
        onConfirm={handleSuspend}
        onCancel={() => setSuspendOpen(false)}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[hsl(var(--theme-text-secondary))] mb-1 block">Duration (days)</label>
            <select
              className="w-full bg-[hsl(var(--theme-bg-tertiary)/0.6)] border border-[hsl(var(--theme-border-default))] rounded-xl h-10 text-sm px-3 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))]"
              value={suspendDays}
              onChange={e => setSuspendDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <textarea
            className="w-full bg-[hsl(var(--theme-bg-tertiary)/0.6)] border border-[hsl(var(--theme-border-default))] rounded-xl p-3 text-sm resize-none h-20 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))] placeholder:text-[hsl(var(--theme-text-muted))]"
            placeholder="Reason for suspension (required)..."
            value={dialogReason}
            onChange={e => setDialogReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>

      {/* ── Ban Dialog ── */}
      <ConfirmDialog
        open={banOpen}
        title="Ban User"
        message={`Permanently ban ${selectedUser?.display_name || selectedUser?.username} from the platform. This action can be reversed later.`}
        confirmLabel={actionLoading ? 'Banning...' : 'Ban User'}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
        onConfirm={handleBan}
        onCancel={() => setBanOpen(false)}
      >
        <textarea
          className="w-full bg-[hsl(var(--theme-bg-tertiary)/0.6)] border border-[hsl(var(--theme-border-default))] rounded-xl p-3 text-sm resize-none h-24 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))] placeholder:text-[hsl(var(--theme-text-muted))]"
          placeholder="Reason for ban (required)..."
          value={dialogReason}
          onChange={e => setDialogReason(e.target.value)}
        />
      </ConfirmDialog>

      {/* ── Role Change Dialog ── */}
      <ConfirmDialog
        open={roleOpen}
        title="Change System Role"
        message={`Change the system role for ${selectedUser?.display_name || selectedUser?.username}.`}
        confirmLabel={actionLoading ? 'Updating...' : 'Update Role'}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleOpen(false)}
      >
        <select
          className="w-full bg-[hsl(var(--theme-bg-tertiary)/0.6)] border border-[hsl(var(--theme-border-default))] rounded-xl h-10 text-sm px-3 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))]"
          value={selectedRole}
          onChange={e => setSelectedRole(e.target.value as any)}
        >
          <option value="user">User</option>
          <option value="system_admin">System Admin</option>
        </select>
      </ConfirmDialog>
    </div>
  );
}
