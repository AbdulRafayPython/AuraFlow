import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Settings, Trash2, LogOut, AlertCircle, Image } from "lucide-react";
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

export default function CommunityManagementModal({
  isOpen,
  onClose,
  community,
  userRole,
  onCommunityDeleted,
  onCommunityLeft,
  onCommunityUpdated,
}: CommunityManagementModalProps) {
  const { isDarkMode } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isOwner = userRole === "owner";
  const isAdmin = userRole === "admin" || userRole === "owner";

  const handleDeleteCommunity = async () => {
    if (!community || !isOwner) return;

    setIsLoading(true);
    try {
      await channelService.deleteCommunity(community.id);
      
      // Broadcast deletion event via socket
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
      
      // Socket broadcast will be handled by backend, which triggers RealtimeContext listener
      // The listener will remove the community and navigate to Home
      
      showSuccess({ title: "You have left the community" });
      onCommunityLeft?.();
      onClose();
    } catch (error: any) {
      showError({ title: error.message || "Failed to leave community" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !community) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md rounded-2xl shadow-2xl border max-h-[90vh] overflow-y-auto bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl">
        {/* Header with Icon */}
        <div className="p-6 border-b text-center border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))]">
          <div className="flex justify-center mb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-2xl text-white shadow-lg overflow-hidden"
              style={{ backgroundColor: !community.logo_url ? community.color : undefined }}
            >
              {community.logo_url ? (
                <img 
                  src={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}${community.logo_url}`} 
                  alt={community.name} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                community.icon
              )}
            </div>
          </div>
          <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
            {community.name}
          </h2>
          {community.description && (
            <p className="text-sm mt-2 text-[hsl(var(--theme-text-muted))]">
              {community.description}
            </p>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg transition-all hover:bg-[hsl(var(--theme-bg-hover))]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Community Info */}
          <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))]">
            <h3 className="text-sm font-semibold mb-3 text-[hsl(var(--theme-text-secondary))]">
              YOUR ROLE
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[hsl(var(--theme-text-muted))]">
                Community Role
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                isOwner
                  ? "bg-amber-500/20 text-amber-400"
                  : isAdmin
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]"
              }`}>
                {userRole === "owner" ? "Owner" : userRole === "admin" ? "Admin" : "Member"}
              </span>
            </div>
          </div>

          {/* Admin Actions - Settings */}
          {isAdmin && (
            <div className="space-y-3">
              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all bg-[hsl(var(--theme-accent-primary))]/10 hover:bg-[hsl(var(--theme-accent-primary))]/20 text-[hsl(var(--theme-accent-primary))]"
              >
                <Image className="w-4 h-4" />
                Customize Logo & Banner
              </button>
            </div>
          )}

          {/* Owner-only Actions */}
          {isOwner && (
            <div className="space-y-3 pt-4 border-t border-[hsl(var(--theme-border-default))]">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all bg-red-500/10 hover:bg-red-500/20 text-red-400 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete Community
              </button>
              <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                Permanently delete this community and all its channels. This cannot be undone.
              </p>
            </div>
          )}

          {/* Member Leave Action */}
          {!isOwner && (
            <div className="space-y-3 pt-4 border-t border-[hsl(var(--theme-border-default))]">
              <button
                onClick={() => setShowLeaveConfirm(true)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                Leave Community
              </button>
              <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                You will no longer have access to this community and its channels.
              </p>
            </div>
          )}

          {/* Admin Info (non-owner admins only) */}
          {isAdmin && !isOwner && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-400" />
              <p className="text-sm text-blue-200">
                As an admin, you can manage channels but cannot delete the community. Only the owner can delete it.
              </p>
            </div>
          )}

          {/* Owner Info */}
          {isOwner && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
              <p className="text-sm text-amber-200">
                As the owner, you cannot leave this community. You must delete it instead.
              </p>
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