/**
 * System Admin - Community Management Page
 * Horizontal community cards with health badges,
 * tabbed detail view (Overview/Members/Channels/Settings), activity heatmap,
 * channel breakdown, and full CRUD management.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import adminService, { PaginationInfo } from '@/services/adminService';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search, ChevronLeft, ChevronRight, Users, Hash, MessageSquare,
  Trash2, Shield, ShieldOff, UserMinus, Loader2, Pencil, Crown,
  TrendingUp, TrendingDown, Minus, Mail, Building2, Settings,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// ── Types ──
interface CommunityRow {
  id: string; name: string; description: string; icon: string; color: string;
  logo_url: string; created_at: string; member_count: number; channel_count: number;
  owner_username: string; messages_7d: number;
}
interface CommunityDetail {
  id: string; name: string; description: string; icon: string; color: string;
  logo_url: string; banner_url: string; created_at: string;
  member_count: number; channel_count: number; blocked_count: number;
  total_messages: number; messages_7d: number; flagged_count: number;
  role_distribution: Record<string, number>;
  owner: { id: number; username: string; display_name: string; avatar_url: string; email: string } | null;
  channels: { id: number; name: string; type: string; created_at: string; message_count: number; member_count: number }[];
}
interface CommunityMember {
  id: number; username: string; display_name: string; avatar_url: string; email: string;
  status: string; last_seen: string | null; role: string; violation_count: number;
  joined_at: string; message_count: number;
}
interface ActivityData { heatmap: number[][]; trends: { messages_this_week: number; messages_last_week: number; new_members_7d: number; new_members_prev_7d: number } }

// ── Helpers ──
function computeHealth(c: CommunityRow) {
  const msgs = c.messages_7d || 0;
  const activity = Math.min(msgs / Math.max(c.member_count, 1), 5) / 5;
  const size = Math.min(c.member_count, 50) / 50;
  const channels = Math.min(c.channel_count, 10) / 10;
  return Math.max(5, Math.min(99, Math.round(activity * 40 + size * 30 + channels * 30)));
}
function healthColor(h: number) { return h >= 80 ? '#10b981' : h >= 60 ? '#f59e0b' : '#ef4444'; }
function trendPct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}
function activityLevel(msgs: number): { label: string; cls: string } {
  if (msgs >= 1000) return { label: 'Extremely High', cls: 'bg-emerald-500/15 text-emerald-400' };
  if (msgs >= 500) return { label: 'High', cls: 'bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]' };
  if (msgs >= 100) return { label: 'Medium', cls: 'bg-amber-500/15 text-amber-400' };
  return { label: 'Low', cls: 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]' };
}
function formatCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

const roleColors: Record<string, string> = {
  owner: 'bg-amber-500/20 text-amber-500',
  admin: 'bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]',
  member: 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]',
};
const statusDot: Record<string, string> = { online: 'bg-emerald-500', offline: 'bg-slate-500', idle: 'bg-yellow-500', dnd: 'bg-red-500' };
const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Confirm Dialog ──
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

// ── Heatmap Component ──
function ActivityHeatmap({ data }: { data: number[][] }) {
  const maxVal = useMemo(() => Math.max(1, ...data.flat()), [data]);
  return (
    <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Member Activity Heatmap</h3>
        <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--theme-text-muted))]">
          <span>LOW</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.6, 1].map((o, i) => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `hsl(var(--theme-accent-primary) / ${o})` }} />
            ))}
          </div>
          <span>HIGH</span>
        </div>
      </div>
      <div className="space-y-1">
        {data.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1">
            <span className="text-[10px] text-[hsl(var(--theme-text-muted))] w-7 text-right flex-shrink-0">
              {dayIdx % 2 === 0 ? dayLabels[dayIdx] : ''}
            </span>
            <div className="flex gap-[2px] flex-1">
              {row.map((val, hourIdx) => {
                const intensity = val / maxVal;
                return (
                  <div
                    key={hourIdx}
                    className="aspect-square flex-1 rounded-sm min-w-0 transition-colors"
                    style={{ backgroundColor: val === 0 ? 'hsl(var(--theme-bg-tertiary))' : `hsl(var(--theme-accent-primary) / ${Math.max(0.15, intensity)})` }}
                    title={`${dayLabels[dayIdx]} ${hourIdx}:00 — ${val} messages`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════
type Tab = 'overview' | 'members' | 'channels' | 'settings';

export default function SysCommunityManagement() {
  const { toast } = useToast();

  // ── List state ──
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  // ── Selected community state ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // ── Members state ──
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [membersPag, setMembersPag] = useState<PaginationInfo | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersPage, setMembersPage] = useState(1);
  const [membersSearch, setMembersSearch] = useState('');
  const [membersRole, setMembersRole] = useState('');

  // ── Dialog state ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [roleTarget, setRoleTarget] = useState<CommunityMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CommunityMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const selectedCommunity = useMemo(() => communities.find(c => c.id === selectedId) || null, [communities, selectedId]);

  // ── Drag-to-scroll for community cards ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);
  const hasDragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    // Don't capture pointer if the click is on a button — let it handle its own click
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    scrollStartX.current = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 3) hasDragged.current = true;
    scrollRef.current.scrollLeft = scrollStartX.current - dx;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.releasePointerCapture(e.pointerId);
    scrollRef.current.style.cursor = 'grab';
    // Reset after a microtask so the click event (which fires after pointerup) can still read hasDragged
    setTimeout(() => { hasDragged.current = false; }, 0);
  };

  // ── Fetch list ──
  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getSystemCommunities({ search, limit, offset: (currentPage - 1) * limit });
      setCommunities(data.communities);
      setPagination(data.pagination);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentPage]);

  useEffect(() => { fetchCommunities(); }, [fetchCommunities]);

  // Auto-select first community on initial load
  useEffect(() => {
    if (!loading && communities.length > 0 && selectedId === null) {
      selectCommunity(communities[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, communities]);

  // ── Select community ──
  const selectCommunity = async (id: string) => {
    if (selectedId === id) return;
    setSelectedId(id);
    setActiveTab('overview');
    setDetailLoading(true);
    setDetail(null);
    setActivity(null);
    // Reset member & edit state for clean switch
    setMembers([]);
    setMembersPage(1);
    setMembersSearch('');
    setMembersRole('');
    setEditName('');
    setEditDesc('');
    try {
      const [det, act] = await Promise.all([
        adminService.getSystemCommunityDetails(id),
        adminService.getSystemCommunityActivity(id).catch(() => null),
      ]);
      setDetail(det);
      setActivity(act);
    } catch {
      toast({ title: 'Error', description: 'Failed to load community details', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Fetch members ──
  const fetchMembers = useCallback(async () => {
    if (!selectedId) return;
    setMembersLoading(true);
    try {
      const data = await adminService.getSystemCommunityMembers(selectedId, {
        search: membersSearch, role: membersRole, limit: 15, offset: (membersPage - 1) * 15,
      });
      setMembers(data.members);
      setMembersPag(data.pagination);
    } catch {
      toast({ title: 'Error', description: 'Failed to load members', variant: 'destructive' });
    } finally {
      setMembersLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, membersSearch, membersRole, membersPage]);

  useEffect(() => {
    if (activeTab === 'members' && selectedId) fetchMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchMembers]);

  const handleSearch = () => { setCurrentPage(1); setSearch(searchInput); };

  // ── Actions ──
  const handleDelete = async () => {
    if (!selectedCommunity) return;
    setActionLoading(true);
    try {
      await adminService.deleteSystemCommunity(selectedCommunity.id);
      toast({ title: 'Community Deleted', description: `"${selectedCommunity.name}" deleted` });
      setDeleteOpen(false);
      setSelectedId(null); setDetail(null); setActivity(null);
      fetchCommunities();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setActionLoading(false); }
  };

  const handleEdit = async () => {
    if (!selectedCommunity || !editName.trim()) return;
    setActionLoading(true);
    try {
      await adminService.updateSystemCommunity(selectedCommunity.id, { name: editName.trim(), description: editDesc.trim() });
      toast({ title: 'Updated', description: 'Community updated' });
      setEditOpen(false);
      fetchCommunities();
      const det = await adminService.getSystemCommunityDetails(selectedCommunity.id);
      setDetail(det);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setActionLoading(false); }
  };

  const handleRoleChange = async () => {
    if (!selectedId || !roleTarget) return;
    const newRole = roleTarget.role === 'admin' ? 'member' : 'admin';
    setActionLoading(true);
    try {
      await adminService.updateCommunityMemberRole(selectedId, roleTarget.id, newRole as 'admin' | 'member');
      toast({ title: 'Role Updated', description: `${roleTarget.display_name || roleTarget.username} → ${newRole}` });
      setRoleTarget(null);
      fetchMembers();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setActionLoading(false); }
  };

  const handleRemoveMember = async () => {
    if (!selectedId || !removeTarget) return;
    setActionLoading(true);
    try {
      await adminService.removeCommunityMember(selectedId, removeTarget.id);
      toast({ title: 'Removed', description: `${removeTarget.display_name || removeTarget.username} removed` });
      setRemoveTarget(null);
      fetchMembers();
      fetchCommunities();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setActionLoading(false); }
  };

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 1;
  const membersTotalPages = membersPag ? Math.ceil(membersPag.total / 15) : 1;
  const msgTrend = activity ? trendPct(activity.trends.messages_this_week, activity.trends.messages_last_week) : 0;
  const memTrend = activity ? trendPct(activity.trends.new_members_7d, activity.trends.new_members_prev_7d) : 0;

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Community Overview</h1>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--theme-text-muted))]" />
          <input
            className="w-full bg-[hsl(var(--theme-bg-tertiary))] border-none rounded-xl pl-10 pr-4 h-10 text-sm placeholder:text-[hsl(var(--theme-text-muted))] focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
            placeholder="Search communities..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>

      {/* ── Community Cards Row ── */}
      <div>
        {loading ? (
          <div className="flex gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[200px] h-[180px] bg-[hsl(var(--theme-bg-secondary)/0.7)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : communities.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--theme-text-muted))]">No communities found</div>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-3 cursor-grab select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {communities.map(c => {
              const health = computeHealth(c);
              const hColor = healthColor(health);
              const isSelected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => { if (!hasDragged.current) selectCommunity(c.id); }}
                  className={cn(
                    'flex-shrink-0 w-[200px] rounded-xl border p-4 cursor-pointer transition-all select-none',
                    isSelected
                      ? 'bg-[hsl(var(--theme-accent-primary)/0.1)] border-[hsl(var(--theme-accent-primary)/0.4)]'
                      : 'bg-[hsl(var(--theme-bg-secondary)/0.7)] border-[hsl(var(--theme-accent-primary)/0.1)] hover:border-[hsl(var(--theme-accent-primary)/0.3)]'
                  )}
                >
                  {/* Icon + health ring */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-xl overflow-hidden"
                      style={{ backgroundColor: c.color ? `${c.color}25` : 'hsl(var(--theme-accent-primary) / 0.1)' }}
                    >
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : c.icon ? (
                        <span>{c.icon}</span>
                      ) : (
                        <Building2 className="h-5 w-5 text-[hsl(var(--theme-accent-primary))]" />
                      )}
                    </div>
                    {/* Circular progress ring */}
                    <div className="relative h-10 w-10 flex-shrink-0">
                      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[hsl(var(--theme-bg-tertiary))]" />
                        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="2.5" strokeLinecap="round"
                          stroke={hColor}
                          strokeDasharray={`${health * 94.25 / 100} 94.25`}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: hColor }}>
                        {health}%
                      </span>
                    </div>
                  </div>

                  {/* Name + stats */}
                  <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                    {formatCount(c.member_count)} members &bull; {c.channel_count} channels
                  </p>

                  {/* Manage button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); selectCommunity(c.id); }}
                    className={cn(
                      'w-full mt-3 h-9 rounded-lg text-xs font-medium transition-colors',
                      isSelected
                        ? 'bg-[hsl(var(--theme-accent-primary))] text-white'
                        : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-accent-primary)/0.15)]'
                    )}
                  >
                    {isSelected ? 'Managing' : 'Manage'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 mt-2">
            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-7 w-7 flex items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="text-xs text-[hsl(var(--theme-text-muted))]">{currentPage}/{totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-7 w-7 flex items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Selected Community Content                            */}
      {/* ══════════════════════════════════════════════════════ */}
      {selectedId && (
        <>
          {/* Tabs */}
          <div className="flex gap-6 border-b border-[hsl(var(--theme-border-default))]">
            {(['overview', 'members', 'channels', 'settings'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); if (tab === 'members') { setMembersPage(1); setMembersSearch(''); setMembersRole(''); } }}
                className={cn(
                  'pb-3 text-sm font-medium capitalize transition-colors',
                  activeTab === tab
                    ? 'text-[hsl(var(--theme-accent-primary))] border-b-2 border-[hsl(var(--theme-accent-primary))]'
                    : 'text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--theme-accent-primary))]" />
            </div>
          ) : !detail ? (
            <p className="text-center py-12 text-[hsl(var(--theme-text-muted))]">Failed to load details</p>
          ) : (
            <>
              {/* ─────────── OVERVIEW TAB ─────────── */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Banner */}
                  <div className="relative h-56 rounded-xl overflow-hidden bg-gradient-to-r from-[hsl(var(--theme-accent-primary)/0.4)] to-[hsl(var(--theme-bg-tertiary))]">
                    {detail.banner_url && (
                      <img src={detail.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    {/* Owned by — top right */}
                    {detail.owner && (
                      <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
                        <span className="text-xs text-white/60">Owned by</span>
                        <Avatar className="h-7 w-7 border border-white/20">
                          <AvatarImage src={detail.owner.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback className="text-[10px] bg-[hsl(var(--theme-bg-tertiary))]">{(detail.owner.display_name || detail.owner.username)[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-white font-medium">{detail.owner.display_name || detail.owner.username}</span>
                      </div>
                    )}
                    {/* Community info — bottom left */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end gap-4">
                      <div
                        className="h-14 w-14 rounded-xl flex items-center justify-center text-2xl font-bold overflow-hidden border-2 border-white/20 flex-shrink-0"
                        style={{ backgroundColor: detail.color ? `${detail.color}40` : 'hsl(var(--theme-accent-primary) / 0.3)' }}
                      >
                        {detail.logo_url ? (
                          <img src={detail.logo_url} alt="" className="h-full w-full object-cover" />
                        ) : detail.icon ? (
                          <span className="text-white">{detail.icon}</span>
                        ) : (
                          <Building2 className="h-6 w-6 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-white truncate">{detail.name}</h2>
                        <p className="text-sm text-white/70 truncate">{detail.description || 'No description'}</p>
                      </div>
                    </div>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { icon: Users, label: 'Total Members', value: detail.member_count, trend: memTrend, color: '#10b981' },
                      { icon: Hash, label: 'Active Channels', value: detail.channel_count, trend: null, color: '#0ea5e9' },
                      { icon: Mail, label: 'Messages This Week', value: detail.messages_7d || 0, trend: msgTrend, color: 'hsl(var(--theme-accent-primary))' },
                    ].map(kpi => (
                      <div key={kpi.label} className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl p-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: `${kpi.color}15` }}>
                            <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[hsl(var(--theme-text-muted))]">{kpi.label}</p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-bold">{kpi.value.toLocaleString()}</span>
                              {kpi.trend !== null && kpi.trend !== 0 && (
                                <span className={cn('text-xs font-medium flex items-center gap-0.5', kpi.trend > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {kpi.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {Math.abs(kpi.trend)}%
                                </span>
                              )}
                              {kpi.trend === null && (
                                <span className="text-xs text-[hsl(var(--theme-text-muted))] flex items-center gap-0.5">
                                  <Minus className="h-3 w-3" /> Stable
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Heatmap + Channel Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Heatmap */}
                    {activity ? (
                      <ActivityHeatmap data={activity.heatmap} />
                    ) : (
                      <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl p-5 flex items-center justify-center h-56">
                        <p className="text-sm text-[hsl(var(--theme-text-muted))]">Activity data unavailable</p>
                      </div>
                    )}

                    {/* Channel Breakdown */}
                    <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">Channel Breakdown</h3>
                        <button onClick={() => setActiveTab('channels')} className="text-xs text-[hsl(var(--theme-accent-primary))] hover:underline">View All</button>
                      </div>
                      {detail.channels.length === 0 ? (
                        <p className="text-sm text-[hsl(var(--theme-text-muted))] text-center py-6">No channels</p>
                      ) : (
                        <div className="overflow-auto max-h-52">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">
                                <th className="pb-2 font-semibold">Channel Name</th>
                                <th className="pb-2 font-semibold text-right">Messages</th>
                                <th className="pb-2 font-semibold text-right">Activity</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
                              {detail.channels
                                .sort((a, b) => b.message_count - a.message_count)
                                .slice(0, 6)
                                .map(ch => {
                                  const lvl = activityLevel(ch.message_count);
                                  return (
                                    <tr key={ch.id} className="text-sm">
                                      <td className="py-2.5 font-medium">
                                        <span className="text-[hsl(var(--theme-text-muted))] mr-1">#</span>
                                        {ch.name}
                                      </td>
                                      <td className="py-2.5 text-right tabular-nums">{ch.message_count.toLocaleString()}</td>
                                      <td className="py-2.5 text-right">
                                        <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap', lvl.cls)}>
                                          {lvl.label}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────── MEMBERS TAB ─────────── */}
              {activeTab === 'members' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--theme-text-muted))]" />
                      <input
                        className="w-full bg-[hsl(var(--theme-bg-tertiary))] border-none rounded-xl pl-9 pr-3 h-10 text-sm placeholder:text-[hsl(var(--theme-text-muted))] focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary))]"
                        placeholder="Search members..."
                        value={membersSearch}
                        onChange={e => { setMembersSearch(e.target.value); setMembersPage(1); }}
                      />
                    </div>
                    <select
                      className="bg-[hsl(var(--theme-bg-tertiary))] border-none rounded-xl px-4 h-10 text-sm focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary))]"
                      value={membersRole}
                      onChange={e => { setMembersRole(e.target.value); setMembersPage(1); }}
                    >
                      <option value="">All Roles</option>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </div>

                  <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[hsl(var(--theme-bg-tertiary))] text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
                          <th className="px-5 py-3">Member</th>
                          <th className="px-5 py-3">Role</th>
                          <th className="px-5 py-3">Messages</th>
                          <th className="px-5 py-3">Violations</th>
                          <th className="px-5 py-3">Joined</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
                        {membersLoading ? (
                          [...Array(5)].map((_, i) => (
                            <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="h-5 bg-[hsl(var(--theme-bg-tertiary)/0.5)] rounded animate-pulse" /></td></tr>
                          ))
                        ) : members.length === 0 ? (
                          <tr><td colSpan={6} className="px-5 py-10 text-center text-[hsl(var(--theme-text-muted))]">No members found</td></tr>
                        ) : members.map(m => (
                          <tr key={m.id} className="hover:bg-[hsl(var(--theme-accent-primary)/0.04)] transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="relative flex-shrink-0">
                                  <Avatar className="h-8 w-8 border border-[hsl(var(--theme-border-default))]">
                                    <AvatarImage src={m.avatar_url || undefined} />
                                    <AvatarFallback className="bg-[hsl(var(--theme-bg-tertiary))] text-xs">{(m.display_name || m.username)[0].toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--theme-bg-secondary))]', statusDot[m.status] || statusDot.offline)} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{m.display_name || m.username}</p>
                                  <p className="text-xs text-[hsl(var(--theme-text-muted))] truncate">{m.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold uppercase', roleColors[m.role] || roleColors.member)}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-sm tabular-nums">{m.message_count.toLocaleString()}</td>
                            <td className="px-5 py-3">
                              <span className={cn('text-sm', m.violation_count > 0 ? 'text-red-400 font-medium' : 'text-[hsl(var(--theme-text-muted))]')}>
                                {m.violation_count}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-[hsl(var(--theme-text-muted))]">
                              {m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                            </td>
                            <td className="px-5 py-3">
                              {m.role !== 'owner' ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => setRoleTarget(m)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--theme-bg-tertiary))] transition-colors" title={m.role === 'admin' ? 'Demote' : 'Promote'}>
                                    {m.role === 'admin' ? <ShieldOff className="h-3.5 w-3.5 text-amber-500" /> : <Shield className="h-3.5 w-3.5 text-[hsl(var(--theme-accent-primary))]" />}
                                  </button>
                                  <button onClick={() => setRemoveTarget(m)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors" title="Remove">
                                    <UserMinus className="h-3.5 w-3.5 text-red-500" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end">
                                  <Crown className="h-4 w-4 text-amber-500" />
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {membersTotalPages > 1 && (
                      <div className="flex items-center justify-between px-5 py-3 border-t border-[hsl(var(--theme-accent-primary)/0.1)]">
                        <p className="text-xs text-[hsl(var(--theme-text-muted))]">Page {membersPage} of {membersTotalPages} ({membersPag?.total} total)</p>
                        <div className="flex gap-1">
                          <button disabled={membersPage <= 1} onClick={() => setMembersPage(p => p - 1)} className="h-7 w-7 flex items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                          <button disabled={membersPage >= membersTotalPages} onClick={() => setMembersPage(p => p + 1)} className="h-7 w-7 flex items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─────────── CHANNELS TAB ─────────── */}
              {activeTab === 'channels' && (
                <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[hsl(var(--theme-bg-tertiary))] text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] border-b border-[hsl(var(--theme-accent-primary)/0.1)]">
                        <th className="px-5 py-3">Channel</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Members</th>
                        <th className="px-5 py-3">Messages</th>
                        <th className="px-5 py-3">Activity</th>
                        <th className="px-5 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--theme-accent-primary)/0.05)]">
                      {detail.channels.length === 0 ? (
                        <tr><td colSpan={6} className="px-5 py-10 text-center text-[hsl(var(--theme-text-muted))]">No channels</td></tr>
                      ) : detail.channels.sort((a, b) => b.message_count - a.message_count).map(ch => {
                        const lvl = activityLevel(ch.message_count);
                        return (
                          <tr key={ch.id} className="hover:bg-[hsl(var(--theme-accent-primary)/0.04)] transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4 text-[hsl(var(--theme-text-muted))]" />
                                <span className="text-sm font-medium">{ch.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 rounded bg-[hsl(var(--theme-bg-tertiary))] text-[10px] font-medium text-[hsl(var(--theme-text-muted))] uppercase">{ch.type}</span>
                            </td>
                            <td className="px-5 py-3 text-sm tabular-nums">{ch.member_count}</td>
                            <td className="px-5 py-3 text-sm tabular-nums">{ch.message_count.toLocaleString()}</td>
                            <td className="px-5 py-3">
                              <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold', lvl.cls)}>{lvl.label}</span>
                            </td>
                            <td className="px-5 py-3 text-xs text-[hsl(var(--theme-text-muted))]">
                              {ch.created_at ? new Date(ch.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─────────── SETTINGS TAB ─────────── */}
              {activeTab === 'settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start max-w-5xl">
                  {/* Left column: Edit + Danger Zone */}
                  <div className="space-y-6">
                  {/* Edit Section */}
                  <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl p-6 space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit Community</h3>
                    <div>
                      <label className="text-xs font-medium text-[hsl(var(--theme-text-muted))] mb-1.5 block">Name</label>
                      <input
                        className="w-full bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] rounded-xl px-4 h-10 text-sm focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))]"
                        value={editName || detail.name}
                        onChange={e => setEditName(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[hsl(var(--theme-text-muted))] mb-1.5 block">Description</label>
                      <textarea
                        className="w-full bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-[hsl(var(--theme-accent-primary))] resize-none"
                        value={editDesc !== '' || editName ? editDesc : (detail.description || '')}
                        onChange={e => { if (!editName) setEditName(detail.name); setEditDesc(e.target.value); }}
                        rows={3}
                      />
                    </div>
                    <button
                      onClick={() => { if (!editName) setEditName(detail.name); if (!editDesc && editDesc !== '') setEditDesc(detail.description || ''); setEditOpen(true); }}
                      className="h-10 px-6 rounded-xl bg-[hsl(var(--theme-accent-primary))] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Save Changes
                    </button>
                  </div>

                  {/* Danger Zone */}
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 space-y-3">
                    <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Danger Zone</h3>
                    <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                      Permanently delete this community and all its channels, messages, and member data. This cannot be undone.
                    </p>
                    <button
                      onClick={() => setDeleteOpen(true)}
                      className="h-10 px-6 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      Delete Community
                    </button>
                  </div>
                  </div>

                  {/* Right column: Community Details */}
                  <div className="bg-[hsl(var(--theme-bg-secondary)/0.7)] backdrop-blur-xl border border-[hsl(var(--theme-accent-primary)/0.1)] rounded-xl p-6 space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Community Details</h3>
                    {[
                      { label: 'ID', value: `#${detail.id}` },
                      { label: 'Created', value: detail.created_at ? new Date(detail.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A' },
                      { label: 'Owner', value: detail.owner?.display_name || detail.owner?.username || 'N/A' },
                      { label: 'Color', value: detail.color || '#8B5CF6' },
                      { label: 'Flagged Messages', value: String(detail.flagged_count) },
                      { label: 'Blocked Users', value: String(detail.blocked_count) },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-[hsl(var(--theme-text-muted))]">{row.label}</span>
                        <span className="font-medium">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Dialogs ── */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Community"
        message={`Permanently delete "${selectedCommunity?.name}"? All channels, messages, and member data will be removed. This cannot be undone.`}
        confirmLabel={actionLoading ? 'Deleting...' : 'Delete Permanently'}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={editOpen}
        title="Save Changes"
        message="Apply the updated name and description to this community?"
        confirmLabel={actionLoading ? 'Saving...' : 'Save'}
        onConfirm={handleEdit}
        onCancel={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={!!roleTarget}
        title="Change Role"
        message={roleTarget ? `Change ${roleTarget.display_name || roleTarget.username} from ${roleTarget.role} to ${roleTarget.role === 'admin' ? 'member' : 'admin'}?` : ''}
        confirmLabel={actionLoading ? 'Updating...' : 'Change Role'}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleTarget(null)}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Member"
        message={removeTarget ? `Remove ${removeTarget.display_name || removeTarget.username} from this community?` : ''}
        confirmLabel={actionLoading ? 'Removing...' : 'Remove'}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
        onConfirm={handleRemoveMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
