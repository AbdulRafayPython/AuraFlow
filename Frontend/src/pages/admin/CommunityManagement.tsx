/**
 * Community Management Page (System Admin)
 * Shows ALL communities on the platform with health scores and management options.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { API_URL } from '@/config/api';
import {
  Building2,
  Search,
  Users,
  Hash,
  MessageSquare,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Community {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  logo_url: string;
  created_at: string;
  member_count: number;
  channel_count: number;
  owner_username: string;
}

export default function CommunityManagement() {
  const { user } = useAuth();
  const { currentTheme, themes } = useTheme();
  const theme = themes[currentTheme];
  const isDark = theme.isDark;

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
        ...(search && { search }),
      });
      const res = await fetch(`${API_URL}/admin/system/communities?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setCommunities(data.communities);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error('Failed to fetch communities:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Admin &gt; Communities</p>
          <h1 className="text-2xl font-bold">Community Management</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCommunities} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search communities..."
          className="pl-10"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cn('rounded-xl border p-4', isDark ? 'bg-card border-border/50' : 'bg-white border-gray-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Communities</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
          </div>
        </div>
        <div className={cn('rounded-xl border p-4', isDark ? 'bg-card border-border/50' : 'bg-white border-gray-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold">
                {communities.reduce((sum, c) => sum + c.member_count, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className={cn('rounded-xl border p-4', isDark ? 'bg-card border-border/50' : 'bg-white border-gray-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10">
              <Hash className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Channels</p>
              <p className="text-2xl font-bold">
                {communities.reduce((sum, c) => sum + c.channel_count, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Communities Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : communities.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No communities found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {communities.map((community) => (
            <div
              key={community.id}
              className={cn(
                'rounded-xl border p-5 transition-all hover:border-accent/50',
                isDark ? 'bg-card border-border/50' : 'bg-white border-gray-200'
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ backgroundColor: community.color ? `${community.color}20` : 'hsl(var(--accent) / 0.1)' }}
                >
                  {community.icon || <Building2 className="h-6 w-6 text-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{community.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                    {community.description || 'No description'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/50">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-xs">Members</span>
                  </div>
                  <p className="font-bold mt-0.5">{community.member_count.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />
                    <span className="text-xs">Channels</span>
                  </div>
                  <p className="font-bold mt-0.5">{community.channel_count}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-xs">Owner</span>
                  </div>
                  <p className="font-bold mt-0.5 text-sm truncate">{community.owner_username || 'N/A'}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                Created {community.created_at ? new Date(community.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
