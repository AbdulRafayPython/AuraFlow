/**
 * Member Management Page
 * Comprehensive member list with search, filters, and moderation actions.
 * All data is scoped to the selected community.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService, { CommunityMember, PaginationInfo, BlockedUser } from '@/services/adminService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Users,
  RefreshCw,
  Search,
  MoreHorizontal,
  Mail,
  Calendar,
  AlertTriangle,
  Ban,
  Eye,
  UserCheck,
  Clock,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldOff,
  UserMinus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { DestructiveActionDialog } from '@/components/admin/DestructiveActionDialog';
import { UserDetailsDialog } from '@/components/admin/UserDetailsDialog';

export default function UserManagement() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [users, setUsers] = useState<CommunityMember[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  // The shared UserDetailsDialog (Phase 2.1) does its own fetching, so we only
  // hold the row that was clicked. `userDetails`/`detailsLoading` are gone —
  // the dialog manages both internally.
  const [selectedUser, setSelectedUser] = useState<CommunityMember | null>(null);

  // ─── Phase 1.5: moderation-action dialogs ────────────────────────────────
  // One dialog target at a time. `kind` drives which dialog renders and which
  // adminService call fires on confirm. `reason` is shared by warn/mute/ban.
  type ActionKind = 'warn' | 'mute' | 'ban' | 'remove';
  const [actionTarget, setActionTarget] = useState<{ kind: ActionKind; user: CommunityMember } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const REASON_MAX = 1000;

  // ─── Banned tab ─────────────────────────────────────────────────────────
  // Active vs. banned split. Banned users live in `blocked_users` (not
  // community_members), so they're fetched from a different endpoint and
  // rendered with a slimmer column set + an Unban button.
  type TabKind = 'active' | 'banned';
  const [tab, setTab] = useState<TabKind>('active');
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [blockedPagination, setBlockedPagination] = useState<PaginationInfo | null>(null);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedPage, setBlockedPage] = useState(1);
  // Unban confirm target — separate from actionTarget so it survives a
  // ban-dialog open/close cycle and lives in its own minimal flow.
  const [unbanTarget, setUnbanTarget] = useState<BlockedUser | null>(null);
  const [unbanBusy, setUnbanBusy] = useState(false);

  const limit = 20;

  const fetchUsers = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const params: any = {
        limit,
        offset: (currentPage - 1) * limit
      };
      
      if (status !== 'all') params.status = status;
      if (role !== 'all') params.role = role;
      if (search) params.search = search;
      
      const data = await adminService.getMembers(selectedCommunity.id, params);
      setUsers(data.members);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load members',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id, currentPage, status, role, search]);

  // Banned-tab loader. Fires when the tab is opened or the page changes;
  // we deliberately do NOT couple it to the search/role/status filters
  // — those belong to the active-members table and pulling them in here
  // would lie to the owner about what they're filtering.
  const fetchBlocked = async () => {
    if (!selectedCommunity) return;
    setBlockedLoading(true);
    try {
      const data = await adminService.getBlockedUsers(selectedCommunity.id, {
        limit,
        offset: (blockedPage - 1) * limit,
      });
      setBlocked(data.users);
      setBlockedPagination(data.pagination);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load banned members',
        variant: 'destructive',
      });
    } finally {
      setBlockedLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'banned') fetchBlocked();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id, tab, blockedPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setCurrentPage(1);
  };

  // Just opens the shared dialog with the clicked row. The dialog fetches
  // its own details + handles loading/error state.
  const viewUserDetails = (user: CommunityMember) => {
    if (!selectedCommunity) return;
    setSelectedUser(user);
  };

  // ─── Phase 1.5: moderation actions ───────────────────────────────────────
  // Open the relevant confirm/reason dialog. Reason is cleared per-open so a
  // stale message from a previous victim never leaks into the next dialog.
  const openAction = (kind: ActionKind, user: CommunityMember) => {
    setActionTarget({ kind, user });
    setActionReason('');
  };

  const closeAction = () => {
    if (actionBusy) return; // dialog itself also blocks, defense-in-depth
    setActionTarget(null);
    setActionReason('');
  };

  // Unmute is non-destructive — no confirm dialog, fire immediately.
  const handleUnmute = async (user: CommunityMember) => {
    if (!selectedCommunity) return;
    try {
      await adminService.unmuteMember(selectedCommunity.id, user.id);
      toast({
        title: 'Member unmuted',
        description: `${user.display_name} can post again.`,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unmute member',
        variant: 'destructive',
      });
    }
  };

  // Role toggle: member ↔ admin. Owner role is unreachable here — the
  // dropdown hides "Change role" when the target is the owner.
  const handleRoleChange = async (user: CommunityMember, role: 'admin' | 'member') => {
    if (!selectedCommunity) return;
    try {
      await adminService.updateMemberRole(selectedCommunity.id, user.id, role);
      toast({
        title: 'Role updated',
        description: `${user.display_name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update role',
        variant: 'destructive',
      });
    }
  };

  // Single dispatch for warn/mute/ban/remove. Each branch hits the right
  // adminService call, surfaces a kind-specific success toast, then refetches
  // so the row picks up the new role/is_muted state without a manual refresh.
  const confirmAction = async () => {
    if (!actionTarget || !selectedCommunity) return;
    const { kind, user } = actionTarget;
    const reason = actionReason.trim();

    // Warn / mute / ban require a reason. Remove does not.
    if ((kind === 'warn' || kind === 'mute' || kind === 'ban') && !reason) return;

    setActionBusy(true);
    try {
      switch (kind) {
        case 'warn':
          await adminService.warnMember(selectedCommunity.id, user.id, reason);
          toast({
            title: 'Warning sent',
            description: `${user.display_name} has been notified.`,
          });
          break;
        case 'mute':
          await adminService.muteMember(selectedCommunity.id, user.id, reason);
          toast({
            title: 'Member muted',
            description: `${user.display_name} can no longer post until you unmute them.`,
          });
          break;
        case 'ban':
          await adminService.blockUser(selectedCommunity.id, user.id, reason);
          toast({
            title: 'Member banned',
            description: `${user.display_name} has been removed and blocked from rejoining.`,
          });
          break;
        case 'remove':
          await adminService.removeMember(selectedCommunity.id, user.id);
          toast({
            title: 'Member removed',
            description: `${user.display_name} has been removed from the community.`,
          });
          break;
      }
      setActionTarget(null);
      setActionReason('');
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setActionBusy(false);
    }
  };

  // Unban is reversible — single confirm dialog (no reason field). On success
  // the row disappears from the Banned tab; the user can rejoin the community
  // themselves afterwards (we don't re-add them to community_members here).
  const confirmUnban = async () => {
    if (!unbanTarget || !selectedCommunity) return;
    setUnbanBusy(true);
    try {
      await adminService.unblockUser(selectedCommunity.id, unbanTarget.user.id);
      toast({
        title: 'Member unbanned',
        description: `${unbanTarget.user.display_name} can now rejoin the community.`,
      });
      setUnbanTarget(null);
      fetchBlocked();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unban member',
        variant: 'destructive',
      });
    } finally {
      setUnbanBusy(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      online: { variant: 'default', label: 'Online' },
      offline: { variant: 'secondary', label: 'Offline' },
      away: { variant: 'secondary', label: 'Away' },
      banned: { variant: 'destructive', label: 'Banned' },
    };
    const config = configs[status] || configs.offline;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-500" />
            Member Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and manage members of {selectedCommunity?.name || 'your community'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagination?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Online Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {users.filter(u => u.status === 'online').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {users.filter(u => u.role === 'admin' || u.role === 'owner').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">With Violations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {users.filter(u => u.stats.violation_count > 0).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs — Active vs. Banned. The active-members table keeps the
          filters/search; the Banned table is a slimmer view with Unban. */}
      <Tabs value={tab} onValueChange={v => setTab(v as TabKind)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            <Users className="h-4 w-4 mr-2" />
            Active members
          </TabsTrigger>
          <TabsTrigger value="banned">
            <Ban className="h-4 w-4 mr-2" />
            Banned
            {blockedPagination && blockedPagination.total > 0 && (
              <Badge variant="secondary" className="ml-2 font-mono">
                {blockedPagination.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-6 mt-0">

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username, email, or display name..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {/* Members Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[100px]">Role</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px] text-center">Messages</TableHead>
                  <TableHead className="w-[100px] text-center">Violations</TableHead>
                  <TableHead className="w-[150px]">Joined</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <span className="font-medium">No members found</span>
                        <span className="text-sm text-muted-foreground">
                          {search ? 'Try a different search term' : 'No members in this community yet'}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map(user => (
                    <TableRow key={user.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback>
                                {user.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {user.status === 'online' && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{user.display_name}</div>
                            <div className="text-sm text-muted-foreground">@{user.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'owner' ? 'default' : user.role === 'admin' ? 'secondary' : 'outline'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getStatusBadge(user.status)}
                          {user.is_muted && (
                            <Badge variant="outline" className="border-yellow-500/40 text-yellow-500">
                              <VolumeX className="h-3 w-3 mr-1" />
                              Muted
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">
                          {user.stats.message_count.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {user.stats.violation_count > 0 ? (
                          <Badge variant="destructive" className="font-mono">
                            {user.stats.violation_count}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-mono">0</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {user.joined_at ? new Date(user.joined_at).toLocaleDateString() : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => viewUserDetails(user)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {/* Role toggle — owner is unreachable; you can't
                                demote the owner from this page (server-side
                                guard backs this up). */}
                            {user.role !== 'owner' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    user,
                                    user.role === 'admin' ? 'member' : 'admin',
                                  )
                                }
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                {user.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={user.role === 'owner'}
                              onClick={() => openAction('warn', user)}
                            >
                              <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                              Send Warning
                            </DropdownMenuItem>
                            {user.is_muted ? (
                              <DropdownMenuItem onClick={() => handleUnmute(user)}>
                                <Volume2 className="h-4 w-4 mr-2 text-green-500" />
                                Unmute
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={user.role === 'owner'}
                                onClick={() => openAction('mute', user)}
                              >
                                <VolumeX className="h-4 w-4 mr-2 text-yellow-500" />
                                Mute
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={user.role === 'owner'}
                              onClick={() => openAction('remove', user)}
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove from Community
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={user.role === 'owner'}
                              onClick={() => openAction('ban', user)}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Ban User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>

        {/* Pagination */}
        {pagination && pagination.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, pagination.total)} of {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!pagination.has_more}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

        </TabsContent>

        <TabsContent value="banned" className="space-y-6 mt-0">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Member</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-[120px] text-center">Violations</TableHead>
                      <TableHead className="w-[180px]">Banned</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedLoading ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : blocked.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Ban className="h-8 w-8 text-muted-foreground" />
                            <span className="font-medium">No banned members</span>
                            <span className="text-sm text-muted-foreground">
                              Members you ban from the Active tab show up here.
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      blocked.map(b => (
                        <TableRow key={b.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={b.user.avatar_url || undefined} />
                                <AvatarFallback>
                                  {b.user.username[0]?.toUpperCase() || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{b.user.display_name}</div>
                                <div className="text-sm text-muted-foreground">
                                  @{b.user.username}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {b.user.email}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {b.total_violations > 0 ? (
                              <Badge variant="destructive" className="font-mono">
                                {b.total_violations}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="font-mono">0</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {b.blocked_at
                                ? new Date(b.blocked_at).toLocaleDateString()
                                : 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUnbanTarget(b)}
                              className="border-green-500/40 text-green-600 hover:bg-green-500/10 hover:text-green-600"
                            >
                              <UserCheck className="h-4 w-4 mr-2" />
                              Unban
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>

            {/* Pagination — same shape as the active-members table. */}
            {blockedPagination && blockedPagination.total > limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((blockedPage - 1) * limit) + 1} to{' '}
                  {Math.min(blockedPage * limit, blockedPagination.total)} of{' '}
                  {blockedPagination.total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBlockedPage(p => p - 1)}
                    disabled={blockedPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {blockedPage} of{' '}
                    {Math.max(1, Math.ceil(blockedPagination.total / limit))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBlockedPage(p => p + 1)}
                    disabled={!blockedPagination.has_more}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Unban confirm dialog — reversible action, no reason field. */}
      <DestructiveActionDialog
        open={!!unbanTarget}
        onOpenChange={open => !open && !unbanBusy && setUnbanTarget(null)}
        title="Unban member"
        description={
          unbanTarget
            ? `${unbanTarget.user.display_name} will be removed from the blocked list and can rejoin ${selectedCommunity?.name || 'the community'}. This does not re-add them as a member — they'll need to rejoin themselves.`
            : ''
        }
        confirmLabel="Unban member"
        severity="warn"
        loading={unbanBusy}
        onConfirm={confirmUnban}
      />

      {/* User Details Dialog — shared component (Phase 2.1). */}
      {selectedCommunity && (
        <UserDetailsDialog
          open={!!selectedUser}
          onOpenChange={open => !open && setSelectedUser(null)}
          communityId={selectedCommunity.id}
          member={selectedUser}
        />
      )}

      {/* ─── Moderation-action dialogs (Phase 1.5) ─────────────────────────
          One DestructiveActionDialog per kind. They share `actionTarget`
          state so only one is ever open at a time. */}

      {/* Warn — yellow severity, reason required. */}
      <DestructiveActionDialog
        open={actionTarget?.kind === 'warn'}
        onOpenChange={open => !open && closeAction()}
        severity="warn"
        title="Send warning"
        description={
          <>
            <strong>{actionTarget?.user.display_name}</strong> will receive an in-app
            notification with the reason below. The warning is logged in this
            community's audit trail.
          </>
        }
        extra={
          <div className="space-y-2">
            <Label htmlFor="warn-reason">Reason</Label>
            <Textarea
              id="warn-reason"
              value={actionReason}
              onChange={e => setActionReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="What rule was broken? Add enough context that the member can correct it."
              rows={4}
              disabled={actionBusy}
            />
            <div className="text-xs text-muted-foreground text-right">
              {actionReason.length}/{REASON_MAX}
            </div>
          </div>
        }
        confirmLabel="Send warning"
        confirmDisabled={!actionReason.trim()}
        loading={actionBusy}
        onConfirm={confirmAction}
      />

      {/* Mute — destructive severity. Indefinite at the DB level (no
          muted_until column) — call that out so admins don't expect auto-lift. */}
      <DestructiveActionDialog
        open={actionTarget?.kind === 'mute'}
        onOpenChange={open => !open && closeAction()}
        severity="destructive"
        title="Mute member"
        description={
          <>
            <strong>{actionTarget?.user.display_name}</strong> won't be able to post or
            react in any channel of this community. The mute stays in effect
            until you unmute them — there's no automatic expiry.
          </>
        }
        extra={
          <div className="space-y-2">
            <Label htmlFor="mute-reason">Reason</Label>
            <Textarea
              id="mute-reason"
              value={actionReason}
              onChange={e => setActionReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="Why is this member being muted?"
              rows={3}
              disabled={actionBusy}
            />
            <div className="text-xs text-muted-foreground text-right">
              {actionReason.length}/{REASON_MAX}
            </div>
          </div>
        }
        confirmLabel="Mute member"
        confirmDisabled={!actionReason.trim()}
        loading={actionBusy}
        onConfirm={confirmAction}
      />

      {/* Ban — destructive. Routes through the existing blockUser endpoint;
          the new warn/mute/unmute endpoints are 1.4's additions, this one
          predates them. */}
      <DestructiveActionDialog
        open={actionTarget?.kind === 'ban'}
        onOpenChange={open => !open && closeAction()}
        severity="destructive"
        title="Ban member"
        description={
          <>
            <strong>{actionTarget?.user.display_name}</strong> will be removed from
            this community and blocked from rejoining. They can appeal from
            their account.
          </>
        }
        extra={
          <div className="space-y-2">
            <Label htmlFor="ban-reason">Reason</Label>
            <Textarea
              id="ban-reason"
              value={actionReason}
              onChange={e => setActionReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="What led to the ban?"
              rows={3}
              disabled={actionBusy}
            />
            <div className="text-xs text-muted-foreground text-right">
              {actionReason.length}/{REASON_MAX}
            </div>
          </div>
        }
        confirmLabel="Ban member"
        confirmDisabled={!actionReason.trim()}
        loading={actionBusy}
        onConfirm={confirmAction}
      />

      {/* Remove — destructive but no block. Kicks the member; they can rejoin
          if the community allows. No reason needed (kept consistent with the
          existing removeMember endpoint, which takes no body). */}
      <DestructiveActionDialog
        open={actionTarget?.kind === 'remove'}
        onOpenChange={open => !open && closeAction()}
        severity="destructive"
        title="Remove from community"
        description={
          <>
            <strong>{actionTarget?.user.display_name}</strong> will be removed from
            this community. Unlike a ban, they can rejoin later if the
            community allows it.
          </>
        }
        confirmLabel="Remove member"
        loading={actionBusy}
        onConfirm={confirmAction}
      />
    </div>
  );
}
