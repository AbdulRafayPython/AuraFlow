/**
 * System Admin - Blocked Users Page
 * Dark purple themed blocked users management matching admin panel design.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import adminService, { BlockedUser, PaginationInfo } from '@/services/adminService';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserX, RefreshCw, Search, Calendar, AlertTriangle, UserCheck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function SysBlockedUsers() {
  const { toast } = useToast();

  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unblockDialog, setUnblockDialog] = useState<{ isOpen: boolean; blockId: number | null; username: string }>({
    isOpen: false, blockId: null, username: ''
  });
  const [unblockLoading, setUnblockLoading] = useState(false);

  const fetchBlockedUsers = async () => {
    setLoading(true);
    try {
      const data = await adminService.getGlobalBlockedUsers({ limit: 100 });
      setUsers(data.users || []);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load blocked users', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBlockedUsers(); }, []);

  const handleUnblock = async () => {
    if (!unblockDialog.blockId) return;
    setUnblockLoading(true);
    try {
      await adminService.unblockGlobalUser(unblockDialog.blockId);
      toast({ title: 'User Unblocked', description: `${unblockDialog.username} has been unblocked.` });
      setUnblockDialog({ isOpen: false, blockId: null, username: '' });
      fetchBlockedUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to unblock user', variant: 'destructive' });
    } finally {
      setUnblockLoading(false);
    }
  };

  const filteredUsers = search
    ? users.filter(u => u.user?.username?.toLowerCase().includes(search.toLowerCase()) || u.reason?.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">Blocked Users</h1>
          <p className="text-[hsl(var(--theme-text-secondary))] text-sm mt-1">Manage blocked users across all communities</p>
        </div>
        <button
          onClick={fetchBlockedUsers}
          className="px-4 py-2 bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] rounded-lg text-sm font-bold hover:bg-[hsl(var(--theme-bg-hover))] transition-all flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] p-5 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
              <UserX className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[hsl(var(--theme-text-secondary))] text-sm">Total Blocked Users</p>
          <h3 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))] mt-1">{users.length}</h3>
        </div>
        <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] p-5 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[hsl(var(--theme-text-secondary))] text-sm">High Violation Count (3+)</p>
          <h3 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))] mt-1">{users.filter(u => (u.total_violations || 0) >= 3).length}</h3>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--theme-text-secondary))]" />
        <input
          className="w-full bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none transition-all"
          placeholder="Search blocked users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Blocked Users Table */}
      <div className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[hsl(var(--theme-bg-hover))]">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider">Reason</th>
                <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider text-center">Violations</th>
                <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider">Blocked On</th>
                <th className="px-6 py-3 text-xs font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--theme-border-default))]">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4" colSpan={5}>
                      <div className="h-5 bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-[hsl(var(--theme-text-secondary))]" colSpan={5}>
                    <UserCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    No blocked users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-[hsl(var(--theme-bg-hover))] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-[hsl(var(--theme-border-default))]">
                          <AvatarImage src={user.user?.avatar_url || undefined} />
                          <AvatarFallback className="bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] text-xs">
                            {(user.user?.username || '?')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{user.user?.username || 'Unknown'}</p>
                          {user.user?.email && <p className="text-xs text-[hsl(var(--theme-text-secondary))]">{user.user.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[250px]">
                      <p className="text-sm text-[hsl(var(--theme-text-secondary))] truncate">{user.reason || 'No reason provided'}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        'inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold',
                        (user.total_violations || 0) >= 3
                          ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                          : 'bg-slate-500/10 text-[hsl(var(--theme-text-secondary))] border border-slate-500/20'
                      )}>
                        {user.total_violations || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--theme-text-secondary))]">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(user.blocked_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setUnblockDialog({ isOpen: true, blockId: user.id, username: user.user?.username || 'this user' })}
                        className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg text-xs font-bold hover:bg-emerald-500/20 transition-all"
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unblock Confirmation Dialog */}
      {unblockDialog.isOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setUnblockDialog({ isOpen: false, blockId: null, username: '' })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] rounded-xl p-6 w-[420px] max-w-[90vw] z-50 space-y-4"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            <h3 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">Unblock {unblockDialog.username}?</h3>
            <p className="text-sm text-[hsl(var(--theme-text-secondary))]">This will remove the block and allow them to participate again.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setUnblockDialog({ isOpen: false, blockId: null, username: '' })}
                className="px-4 py-2 border border-[hsl(var(--theme-border-default))] rounded-lg text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleUnblock}
                disabled={unblockLoading}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-500/80 transition-all disabled:opacity-50"
              >
                {unblockLoading ? 'Unblocking...' : 'Unblock'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
