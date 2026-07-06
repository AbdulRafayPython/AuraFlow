/**
 * UserDetailsDialog — shared community-admin user-details modal.
 *
 * Originally lived inline in `pages/admin/UserManagement.tsx`. Lifted out in
 * Phase 2.1 so FlaggedContent can open the same modal when an admin clicks an
 * offending user, without re-implementing the Info / Activity / Communities
 * tabs.
 *
 * Two open modes:
 *   - Pre-resolved member object (UserManagement already has a `CommunityMember`
 *     in hand from its row data) → pass `member` + the loaded `details`.
 *   - User id only (FlaggedContent only has `user.id` on a flagged row) → pass
 *     `userId`; the dialog fetches the member details itself via adminService.
 *
 * Either way, `communityId` is required because every endpoint we hit is
 * community-scoped.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Ban, Building2, MessageSquare } from 'lucide-react';
import adminService, { CommunityMember } from '@/services/adminService';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  /** Pass when the caller already has a member row (UserManagement). */
  member?: CommunityMember | null;
  /** Pass when the caller only has a user id (FlaggedContent). */
  userId?: number | null;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  online: 'default',
  offline: 'secondary',
  away: 'secondary',
  banned: 'destructive',
};
const statusLabel: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  away: 'Away',
  banned: 'Banned',
};

export function UserDetailsDialog({
  open,
  onOpenChange,
  communityId,
  member,
  userId,
}: Props) {
  const { toast } = useToast();
  // Local copy — if caller only gave us a userId, we fill this in via the
  // member-details endpoint (which returns the same shape as the row data).
  const [resolvedMember, setResolvedMember] = useState<CommunityMember | null>(
    member ?? null,
  );
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Reset + reload whenever the open user changes. Two trigger sources:
  // a member row was clicked, or a user id was clicked. The id has priority
  // so FlaggedContent's per-row click always re-fetches even if the previous
  // open was for a different user.
  useEffect(() => {
    if (!open || !communityId) return;
    const targetId = userId ?? member?.id;
    if (!targetId) return;

    let cancelled = false;
    setLoading(true);
    setDetails(null);
    // If caller passed a member row, seed the header immediately.
    setResolvedMember(member ?? null);

    (async () => {
      try {
        const data = await adminService.getMemberDetails(communityId, targetId);
        if (cancelled) return;
        setDetails(data);
        // Member-details endpoint returns the user fields flat (id, username,
        // stats, …) — when the caller is in id-only mode (FlaggedContent),
        // synthesize a `CommunityMember`-shaped object for the header.
        if (!member && data?.id) {
          setResolvedMember({
            id: data.id,
            username: data.username,
            display_name: data.display_name,
            email: data.email,
            avatar_url: data.avatar_url,
            status: data.status,
            role: data.role,
            joined_at: data.joined_at,
            created_at: data.account_created,
            last_seen: data.last_seen,
            is_muted: data.is_muted,
            stats: {
              message_count: data.stats?.message_count ?? 0,
              violation_count: data.stats?.violation_count ?? 0,
            },
          });
        }
      } catch (error: any) {
        if (cancelled) return;
        toast({
          title: 'Error',
          description: error.message || 'Failed to load user details',
          variant: 'destructive',
        });
        // Close on hard load failure — an empty dialog isn't useful.
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, communityId, userId, member?.id]);

  const user = resolvedMember;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            Detailed information about {user?.display_name || 'this member'}
          </DialogDescription>
        </DialogHeader>

        {loading || !user ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="text-xl">
                  {user.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-bold">{user.display_name}</h3>
                <p className="text-muted-foreground">@{user.username}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={statusVariant[user.status] || 'secondary'}>
                    {statusLabel[user.status] || 'Offline'}
                  </Badge>
                  {user.stats?.violation_count > 0 && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {user.stats.violation_count} violations
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="communities">Communities</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Email</label>
                    <p className="font-medium">{user.email}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Joined</label>
                    <p className="font-medium">
                      {new Date(
                        user.joined_at || user.created_at || '',
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Last Seen</label>
                    <p className="font-medium">
                      {user.last_seen
                        ? new Date(user.last_seen).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Total Messages</label>
                    <p className="font-medium">
                      {(user.stats?.message_count ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Messages
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {(user.stats?.message_count ?? 0).toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Communities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {user.stats?.community_count || 1}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        Violations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-500">
                        {user.stats?.violation_count ?? 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Ban className="h-4 w-4 text-red-500" />
                        Bans
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-500">
                        {user.stats?.ban_count || 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="communities" className="mt-4">
                {details?.communities?.length > 0 ? (
                  <div className="space-y-2">
                    {details.communities.map((community: any) => (
                      <div
                        key={community.id}
                        className="flex items-center gap-3 p-3 rounded-lg border"
                      >
                        <Avatar className="h-10 w-10 rounded-lg">
                          <AvatarImage src={community.logo_url} />
                          <AvatarFallback className="rounded-lg">
                            {community.name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium">{community.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {new Date(community.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="secondary">{community.role}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No communities joined</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UserDetailsDialog;
