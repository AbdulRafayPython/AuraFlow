/**
 * Blocked Users Page
 * Displays all blocked users in the selected community with unblock functionality.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService, { BlockedUser, PaginationInfo } from '@/services/adminService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  UserX,
  RefreshCw,
  Search,
  Calendar,
  AlertTriangle,
  UserCheck,
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Gavel,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import adminService from '@/services/adminService';

// ---- Appeals sub-panel ----
interface Appeal {
  id: number;
  user_name: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  block_reason: string;
  created_at: string;
  reviewed_at: string | null;
}

function AppealsPanel() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);

  const load = async () => {
    if (!selectedCommunity?.id) return;
    setLoading(true);
    try {
      const rows = await adminService.listAppeals(selectedCommunity.id);
      setAppeals(rows);
    } catch (e: any) {
      toast({ title: 'Failed to load appeals', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [selectedCommunity?.id]);

  const handleResolve = async (appealId: number, action: 'approve' | 'reject') => {
    setResolving(appealId);
    try {
      await adminService.resolveAppeal(selectedCommunity!.id, appealId, action);
      toast({ title: action === 'approve' ? 'Appeal approved — user unblocked' : 'Appeal rejected' });
      void load();
    } catch (e: any) {
      toast({ title: 'Failed to resolve appeal', description: e.message, variant: 'destructive' });
    } finally {
      setResolving(null);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Review appeals from blocked users.</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : appeals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-2 opacity-30" />
            <p>No pending appeals.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appeals.map(a => (
            <Card key={a.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{a.user_name}</span>
                      <Badge
                        variant={
                          a.status === 'pending' ? 'secondary' :
                          a.status === 'approved' ? 'default' : 'destructive'
                        }
                      >
                        {a.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <AlertTriangle className="h-3 w-3" />
                      Blocked for: <span className="italic">{a.block_reason}</span>
                    </div>
                    <p className="text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3 mb-2">
                      "{a.message}"
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {formatDate(a.created_at)}
                    </p>
                    {a.admin_note && (
                      <p className="text-xs mt-1 text-muted-foreground">
                        Admin note: {a.admin_note}
                      </p>
                    )}
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-300 hover:bg-green-50"
                        onClick={() => handleResolve(a.id, 'approve')}
                        disabled={resolving === a.id}
                      >
                        {resolving === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => handleResolve(a.id, 'reject')}
                        disabled={resolving === a.id}
                      >
                        {resolving === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BlockedUsers() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unblockDialog, setUnblockDialog] = useState<{ isOpen: boolean; userId: number | null; username: string }>({
    isOpen: false,
    userId: null,
    username: ''
  });
  const [unblockLoading, setUnblockLoading] = useState(false);

  const fetchBlockedUsers = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const data = await adminService.getBlockedUsers(selectedCommunity.id, { limit: 100 });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load blocked users',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id]);

  const handleUnblock = async () => {
    if (!unblockDialog.userId || !selectedCommunity) return;
    
    setUnblockLoading(true);
    try {
      await adminService.unblockUser(selectedCommunity.id, unblockDialog.userId);
      
      toast({
        title: 'User Unblocked',
        description: `${unblockDialog.username} has been unblocked successfully.`
      });
      
      // Remove from list
      setUsers(prev => prev.filter(u => u.user.id !== unblockDialog.userId));
      setUnblockDialog({ isOpen: false, userId: null, username: '' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unblock user',
        variant: 'destructive'
      });
    } finally {
      setUnblockLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    !search ||
    user.user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.user.display_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserX className="h-6 w-6 text-red-500" />
            Blocked Users
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage blocked users in {selectedCommunity?.name || 'your community'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchBlockedUsers}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">High Violators</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {users.filter(u => u.total_violations >= 5).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Tabs */}
      <Tabs defaultValue="blocked" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="blocked">
            <UserX className="h-4 w-4 mr-1" /> Blocked ({users.length})
          </TabsTrigger>
          <TabsTrigger value="appeals">
            <Gavel className="h-4 w-4 mr-1" /> Appeals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blocked">
          <Card className="mb-4">
            <CardContent className="py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username, display name, or community..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[120px]">Violations</TableHead>
                  <TableHead className="w-[180px]">Blocked At</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <UserCheck className="h-8 w-8 text-green-500" />
                        <span className="font-medium">No blocked users</span>
                        <span className="text-sm text-muted-foreground">
                          {search ? 'No users match your search' : 'All users are in good standing'}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(blocked => (
                    <TableRow key={blocked.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={blocked.user.avatar_url || undefined} />
                            <AvatarFallback className="bg-red-500/10 text-red-500">
                              {blocked.user.username[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{blocked.user.display_name}</div>
                            <div className="text-sm text-muted-foreground">@{blocked.user.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {blocked.user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={blocked.total_violations >= 5 ? 'destructive' : 'secondary'}
                          className="font-mono"
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {blocked.total_violations}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(blocked.blocked_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUnblockDialog({
                            isOpen: true,
                            userId: blocked.user.id,
                            username: blocked.user.username
                          })}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          Unblock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
          </TabsContent>

          {/* Appeals Tab */}
          <TabsContent value="appeals">
            <AppealsPanel />
          </TabsContent>
        </Tabs>

      {/* Unblock Confirmation Dialog */}
      <AlertDialog open={unblockDialog.isOpen} onOpenChange={open => !open && setUnblockDialog(prev => ({ ...prev, isOpen: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unblock <strong>{unblockDialog.username}</strong>? 
              They will be able to participate in the community again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnblock} disabled={unblockLoading}>
              {unblockLoading ? 'Processing...' : 'Unblock User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
