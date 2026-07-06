/**
 * My Communities (Community Admin)
 *
 * Shows the communities where the current user is owner/admin — sourced from the
 * existing GET /api/admin/owned-communities endpoint that already populates the
 * sidebar selector via CommunityDashboardContext. Each card has a quick "Open
 * dashboard" action that switches the selected community and routes back to the
 * Overview at /admin.
 *
 * Previously this page hit /admin/system/communities (a platform-admin endpoint
 * that returns every community on the platform). That route is wrong for the
 * /admin/* community-admin context — see plan phase 1.7 in cached-dazzling-owl.md.
 *
 * Note on "last activity": the existing owned-communities payload doesn't carry
 * a last-message timestamp and the remediation plan forbids new analytics
 * aggregations, so the cards intentionally don't show one. If/when a future
 * phase adds it to the backend, the field will flow through naturally.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useCommunityDashboard, OwnedCommunity } from '@/contexts/CommunityDashboardContext';
import { cn } from '@/lib/utils';
import {
  Building2,
  Search,
  Users,
  Hash,
  RefreshCw,
  ArrowRight,
  Shield,
  Star,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

function RoleBadge({ role }: { role: string }) {
  const normalized = (role || '').toLowerCase();
  if (normalized === 'owner') {
    return (
      <Badge className="gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 border-amber-500/30">
        <Star className="h-3 w-3" />
        Owner
      </Badge>
    );
  }
  if (normalized === 'admin') {
    return (
      <Badge className="gap-1 bg-sky-500/15 text-sky-600 hover:bg-sky-500/15 border-sky-500/30">
        <Shield className="h-3 w-3" />
        Admin
      </Badge>
    );
  }
  // Fallback — shouldn't appear because the endpoint already filters to
  // owner/admin, but we render whatever the server sent rather than swallowing it.
  return <Badge variant="outline">{role || 'Member'}</Badge>;
}

function CommunityCardSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        'bg-card border-border/50',
      )}
    >
      <div className="flex items-start gap-4">
        <Skeleton className="w-14 h-14 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/50">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-9 w-full mt-4" />
    </div>
  );
}

interface CommunityCardProps {
  community: OwnedCommunity;
  isSelected: boolean;
  isDark: boolean;
  onOpen: () => void;
}

function CommunityCard({ community, isSelected, isDark, onOpen }: CommunityCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-all hover:border-accent/50 hover:shadow-md',
        isSelected && 'border-accent/60 ring-1 ring-accent/30',
        'bg-card border-border/50',
      )}
    >
      <div className="flex items-start gap-4">
        {community.logo_url ? (
          <img
            src={community.logo_url}
            alt=""
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{
              backgroundColor: community.color
                ? `${community.color}20`
                : 'hsl(var(--accent) / 0.1)',
            }}
          >
            {community.icon || <Building2 className="h-6 w-6 text-accent" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg truncate">{community.name}</h3>
            <RoleBadge role={community.role} />
            {isSelected && (
              <Badge variant="outline" className="text-xs">
                Currently selected
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/50">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs">Members</span>
          </div>
          <p className="font-bold mt-0.5">
            {community.member_count.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            <span className="text-xs">Channels</span>
          </div>
          <p className="font-bold mt-0.5">
            {community.channel_count.toLocaleString()}
          </p>
        </div>
      </div>

      <Button
        className="w-full mt-4"
        variant={isSelected ? 'default' : 'outline'}
        onClick={onOpen}
      >
        Open dashboard
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

export default function CommunityManagement() {
  const { currentTheme, themes } = useTheme();
  const navigate = useNavigate();
  const {
    ownedCommunities,
    isLoadingCommunities,
    selectedCommunity,
    selectCommunity,
    refreshOwnedCommunities,
  } = useCommunityDashboard();

  const theme = themes[currentTheme];
  const isDark = theme.isDark;

  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ownedCommunities;
    return ownedCommunities.filter((c) => c.name.toLowerCase().includes(q));
  }, [ownedCommunities, search]);

  const totalMembers = useMemo(
    () => ownedCommunities.reduce((sum, c) => sum + (c.member_count || 0), 0),
    [ownedCommunities],
  );
  const totalChannels = useMemo(
    () => ownedCommunities.reduce((sum, c) => sum + (c.channel_count || 0), 0),
    [ownedCommunities],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshOwnedCommunities();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpen = (community: OwnedCommunity) => {
    // selectCommunity persists to localStorage and updates context state;
    // navigating to /admin lands on the Overview already scoped to it.
    selectCommunity(community.id);
    navigate('/admin');
  };

  const isLoading = isLoadingCommunities && ownedCommunities.length === 0;
  const refreshing = isRefreshing || isLoadingCommunities;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Admin &gt; My Communities</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-accent" />
            My Communities
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Communities you own or help administer. Open one to manage its
            members, moderation, agents, and analytics.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Search — only when there's enough to bother searching */}
      {ownedCommunities.length > 3 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your communities..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-card border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Communities</p>
              <p className="text-2xl font-bold">
                {isLoading ? <Skeleton className="h-7 w-10" /> : ownedCommunities.length}
              </p>
            </div>
          </div>
        </div>
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-card border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold">
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  totalMembers.toLocaleString()
                )}
              </p>
            </div>
          </div>
        </div>
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-card border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10">
              <Hash className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Channels</p>
              <p className="text-2xl font-bold">
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  totalChannels.toLocaleString()
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <CommunityCardSkeleton key={i} isDark={isDark} />
          ))}
        </div>
      ) : ownedCommunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
          <h3 className="font-semibold mb-1">You don't manage any communities yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Communities you own or admin will show up here. Ask an owner to add
            you as an admin, or create your own community from the main app.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
          <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
          <h3 className="font-semibold mb-1">No matches</h3>
          <p className="text-sm text-muted-foreground">
            No community matches "{search.trim()}". Clear the search to see them all.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setSearch('')}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((community) => (
            <CommunityCard
              key={community.id}
              community={community}
              isSelected={selectedCommunity?.id === community.id}
              isDark={isDark}
              onOpen={() => handleOpen(community)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
