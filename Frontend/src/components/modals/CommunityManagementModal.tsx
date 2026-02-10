import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { 
  X, Trash2, LogOut, AlertCircle, Image, Crown, Shield, User,
  BarChart3, Users, Hash, MessageSquare, ChevronRight, Palette,
  Bell, Link2, Copy, Check, ExternalLink, Settings2, ShieldCheck,
  TrendingUp, Activity, UserCog, Calendar
} from "lucide-react";
import { channelService } from "@/services/channelService";
import { useNotifications } from "@/hooks/useNotifications";
import { ConfirmDialog } from "./ConfirmDialog";
import CommunitySettingsModal from "./CommunitySettingsModal";
import { Community } from "@/types";

interface CommunityManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  community: Community | null;
  userRole?: 'owner' | 'admin' | 'member';
  onCommunityDeleted?: () => void;
  onCommunityLeft?: () => void;
  onCommunityUpdated?: (community: Community) => void;
}

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export default function CommunityManagementModal({
  isOpen,
  onClose,
  community,
  userRole,
  onCommunityDeleted,
  onCommunityLeft,
  onCommunityUpdated,
}: CommunityManagementModalProps) {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [activeSection, setActiveSection] = useState<'overview' | 'management' | 'danger'>('overview');

  const isOwner = userRole === "owner";
  const isAdmin = userRole === "admin" || userRole === "owner";

  // Reset section when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSection('overview');
      setCopiedInvite(false);
    }
  }, [isOpen]);

  const handleDeleteCommunity = async () => {
    if (!community || !isOwner) return;

    setIsLoading(true);
    try {
      await channelService.deleteCommunity(community.id);
      
      const { socketService } = await import('@/services/socketService');
      if (socketService.isConnected()) {
        socketService.broadcastCommunityDeleted(community.id);
      }
      
      showSuccess({ title: "Community deleted successfully" });
      onCommunityDeleted?.();
      onClose();
    } catch (error: any) {
      showError({ title: error.message || "Failed to delete community" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveCommunity = async () => {
    if (!community) return;

    setIsLoading(true);
    try {
      await channelService.leaveCommunity(community.id);
      showSuccess({ title: "You have left the community" });
      onCommunityLeft?.();
      onClose();
    } catch (error: any) {
      showError({ title: error.message || "Failed to leave community" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdminDashboard = () => {
    if (!community) return;
    localStorage.setItem('selectedDashboardCommunity', community.id.toString());
    onClose();
    // Use window.location for reliable navigation from modal
    window.location.href = '/admin';
  };

  const handleCopyInviteLink = async () => {
    if (!community) return;
    const inviteLink = `${window.location.origin}/invite/${community.id}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInvite(true);
      showSuccess({ title: "Invite link copied!" });
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      showError({ title: "Failed to copy link" });
    }
  };

  const getRoleBadge = () => {
    if (isOwner) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30">
          <Crown className="w-3.5 h-3.5" />
          Owner
        </span>
      );
    }
    if (userRole === 'admin') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/30">
          <Shield className="w-3.5 h-3.5" />
          Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))]">
        <User className="w-3.5 h-3.5" />
        Member
      </span>
    );
  };

  if (!isOpen || !community) return null;

  const logoUrl = community.logo_url ? `${API_BASE}${community.logo_url}` : null;
  const bannerUrl = community.banner_url ? `${API_BASE}${community.banner_url}` : null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]">
        
        {/* Banner & Header */}
        <div className="relative">
          {/* Banner */}
          <div className="h-24 overflow-hidden">
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div 
                className="w-full h-full"
                style={{ 
                  background: `linear-gradient(135deg, ${community.color || '#8B5CF6'} 0%, ${community.color || '#8B5CF6'}66 50%, ${community.color || '#8B5CF6'}33 100%)`
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--theme-bg-elevated))] via-transparent to-transparent" />
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-all backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Community Logo & Info */}
          <div className="relative px-5 pb-4 -mt-10">
            <div className="flex items-end gap-4">
              {/* Logo */}
              <div 
                className="w-20 h-20 rounded-2xl border-4 border-[hsl(var(--theme-bg-elevated))] flex items-center justify-center overflow-hidden shadow-xl flex-shrink-0"
                style={{ backgroundColor: !logoUrl ? (community.color || '#8B5CF6') : 'hsl(var(--theme-bg-secondary))' }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={community.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-2xl font-bold">
                    {community.icon || community.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name & Role */}
              <div className="flex-1 min-w-0 pb-1">
                <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))] truncate">
                  {community.name}
                </h2>
                <div className="mt-1">
                  {getRoleBadge()}
                </div>
              </div>
            </div>

            {/* Description */}
            {community.description && (
              <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-3 line-clamp-2">
                {community.description}
              </p>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 border-b border-[hsl(var(--theme-border-default))]">
          <div className="flex gap-1">
            {['overview', 'management', 'danger'].map((section) => {
              // Hide management tab for non-admins
              if (section === 'management' && !isAdmin) return null;
              
              const isActive = activeSection === section;
              const labels: Record<string, { label: string; icon: React.ReactNode }> = {
                overview: { label: 'Overview', icon: <Activity className="w-4 h-4" /> },
                management: { label: 'Management', icon: <Settings2 className="w-4 h-4" /> },
                danger: { label: isOwner ? 'Danger Zone' : 'Leave', icon: isOwner ? <AlertCircle className="w-4 h-4" /> : <LogOut className="w-4 h-4" /> },
              };
              
              return (
                <button
                  key={section}
                  onClick={() => setActiveSection(section as typeof activeSection)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                    isActive
                      ? 'border-[hsl(var(--theme-accent-primary))] text-[hsl(var(--theme-accent-primary))]'
                      : 'border-transparent text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                  }`}
                >
                  {labels[section].icon}
                  {labels[section].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5 max-h-[50vh] overflow-y-auto">
          
          {/* Overview Section */}
          {activeSection === 'overview' && (
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary))] text-center">
                  <Users className="w-5 h-5 mx-auto mb-1.5 text-blue-400" />
                  <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                    {community.member_count ?? '-'}
                  </div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">Members</div>
                </div>
                <div className="p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary))] text-center">
                  <Hash className="w-5 h-5 mx-auto mb-1.5 text-emerald-400" />
                  <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                    {community.channel_count ?? '-'}
                  </div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">Channels</div>
                </div>
                <div className="p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary))] text-center">
                  <Calendar className="w-5 h-5 mx-auto mb-1.5 text-purple-400" />
                  <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                    {community.created_at ? new Date(community.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                  </div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">Created</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] px-1">
                  Quick Actions
                </h3>
                
                {/* Invite Link */}
                <button
                  onClick={handleCopyInviteLink}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                    {copiedInvite ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : (
                      <Link2 className="w-5 h-5 text-indigo-400" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                      {copiedInvite ? 'Copied!' : 'Copy Invite Link'}
                    </div>
                    <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                      Share this community with others
                    </div>
                  </div>
                  <Copy className="w-4 h-4 text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-text-primary))] transition-colors" />
                </button>
              </div>

              {/* Community Info Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[hsl(var(--theme-bg-secondary))] to-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))]">
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: community.color || '#8B5CF6' }}
                  />
                  <span className="text-xs font-medium text-[hsl(var(--theme-text-muted))]">
                    Community Theme
                  </span>
                </div>
                <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                  {community.description || 'No description set for this community.'}
                </p>
              </div>
            </div>
          )}

          {/* Management Section (Admin/Owner Only) */}
          {activeSection === 'management' && isAdmin && (
            <div className="space-y-4">
              {/* Admin Dashboard - Primary CTA */}
              <button
                onClick={handleOpenAdminDashboard}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border border-emerald-500/20 hover:border-emerald-500/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-base font-semibold text-emerald-400">
                      Admin Dashboard
                    </div>
                    <div className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                      Analytics, Moderation & Community Health
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Management Options */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] px-1">
                  Community Settings
                </h3>

                {/* Customize Appearance */}
                <button
                  onClick={() => setShowSettings(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Palette className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                      Customize Appearance
                    </div>
                    <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                      Logo, banner, name & description
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--theme-text-muted))] group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* Dashboard Features Preview */}
              <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3">
                  Dashboard Features
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: TrendingUp, label: 'Analytics', color: 'text-blue-400' },
                    { icon: ShieldCheck, label: 'Moderation', color: 'text-orange-400' },
                    { icon: Users, label: 'Members', color: 'text-purple-400' },
                    { icon: Activity, label: 'Health', color: 'text-emerald-400' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--theme-bg-tertiary))]">
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                      <span className="text-xs text-[hsl(var(--theme-text-secondary))]">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Role Info */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[hsl(var(--theme-accent-primary))]/5 border border-[hsl(var(--theme-accent-primary))]/20">
                <Crown className="w-5 h-5 flex-shrink-0 mt-0.5 text-[hsl(var(--theme-accent-primary))]" />
                <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                  {isOwner 
                    ? "As the owner, you have full control over this community including all management features."
                    : "As an admin, you can manage community settings and access the admin dashboard."}
                </p>
              </div>
            </div>
          )}

          {/* Danger Zone Section */}
          {activeSection === 'danger' && (
            <div className="space-y-4">
              {/* Warning Banner */}
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-400">
                      {isOwner ? 'Danger Zone' : 'Leave Community'}
                    </h4>
                    <p className="text-xs text-red-300/80 mt-1">
                      {isOwner 
                        ? 'Actions here are permanent and cannot be undone.'
                        : 'You can leave this community at any time.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Delete Community (Owner Only) */}
              {isOwner && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 transition-all disabled:opacity-50 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-red-400">
                        Delete Community
                      </div>
                      <div className="text-xs text-red-300/60">
                        Permanently delete all data
                      </div>
                    </div>
                  </button>
                  
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] px-1">
                    This will permanently delete <strong>{community.name}</strong>, including all channels, messages, and member data. This action cannot be undone.
                  </p>

                  {/* Owner Info */}
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Crown className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
                    <p className="text-sm text-amber-200/80">
                      As the owner, you cannot leave this community. Transfer ownership or delete the community instead.
                    </p>
                  </div>
                </div>
              )}

              {/* Leave Community (Non-Owner) */}
              {!isOwner && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 hover:border-orange-500/30 transition-all disabled:opacity-50 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <LogOut className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-orange-400">
                        Leave Community
                      </div>
                      <div className="text-xs text-orange-300/60">
                        You can rejoin anytime with an invite
                      </div>
                    </div>
                  </button>
                  
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] px-1">
                    You will lose access to all channels and conversations in <strong>{community.name}</strong>. You can rejoin later if you have an invite link.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Community?"
        description={`Are you sure you want to permanently delete "${community?.name}"? All channels, messages, and member data will be permanently deleted. This action cannot be undone.`}
        isDangerous={true}
        isLoading={isLoading}
        onConfirm={handleDeleteCommunity}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Leave Confirmation */}
      <ConfirmDialog
        isOpen={showLeaveConfirm}
        title="Leave Community?"
        description={`Are you sure you want to leave "${community?.name}"? You will no longer have access to this community and its channels.`}
        isDangerous={false}
        isLoading={isLoading}
        onConfirm={handleLeaveCommunity}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      {/* Settings Modal */}
      <CommunitySettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        community={community}
        onCommunityUpdated={(updated) => {
          onCommunityUpdated?.(updated);
          setShowSettings(false);
        }}
      />
    </div>
  );
}