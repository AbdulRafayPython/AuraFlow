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

  if (!isOpen || !community) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border max-h-[90vh] overflow-y-auto ${
          isDarkMode
            ? "bg-slate-900/95 border-slate-700/50 backdrop-blur-xl"
            : "bg-white/95 border-gray-200/70 backdrop-blur-xl"
        }`}
      >
        {/* Header with Icon */}
        <div
          className={`p-6 border-b text-center ${
            isDarkMode ? "border-slate-700/70 bg-slate-800/50" : "border-gray-200/70 bg-gray-50"
          }`}
        >
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
          <h2 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {community.name}
          </h2>
          {community.description && (
            <p className={`text-sm mt-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              {community.description}
            </p>
          )}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-lg transition-all ${
              isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-gray-100"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Community Info */}
          <div className={`p-4 rounded-xl ${isDarkMode ? "bg-slate-800/50" : "bg-gray-50"}`}>
            <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
              YOUR ROLE
            </h3>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Community Role
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                isOwner
                  ? isDarkMode
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-amber-100 text-amber-700"
                  : isAdmin
                  ? isDarkMode
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-blue-100 text-blue-700"
                  : isDarkMode
                  ? "bg-slate-700 text-gray-300"
                  : "bg-gray-200 text-gray-700"
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
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                  isDarkMode
                    ? "bg-blue-600/10 hover:bg-blue-600/20 text-blue-400"
                    : "bg-blue-50 hover:bg-blue-100 text-blue-700"
                }`}
              >
                <Image className="w-4 h-4" />
                Customize Logo & Banner
              </button>
            </div>
          )}

          {/* Owner-only Actions */}
          {isOwner && (
            <div className="space-y-3 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                  isDarkMode
                    ? "bg-red-600/10 hover:bg-red-600/20 text-red-400"
                    : "bg-red-50 hover:bg-red-100 text-red-700"
                } disabled:opacity-50`}
              >
                <Trash2 className="w-4 h-4" />
                Delete Community
              </button>
              <p className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
                Permanently delete this community and all its channels. This cannot be undone.
              </p>
            </div>
          )}

          {/* Member Leave Action */}
          {!isOwner && (
            <div className="space-y-3 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => setShowLeaveConfirm(true)}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                  isDarkMode
                    ? "bg-orange-600/10 hover:bg-orange-600/20 text-orange-400"
                    : "bg-orange-50 hover:bg-orange-100 text-orange-700"
                } disabled:opacity-50`}
              >
                <LogOut className="w-4 h-4" />
                Leave Community
              </button>
              <p className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
                You will no longer have access to this community and its channels.
              </p>
            </div>
          )}

          {/* Admin Info (non-owner admins only) */}
          {isAdmin && !isOwner && (
            <div
              className={`flex items-start gap-3 p-3 rounded-lg ${
                isDarkMode ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"
              }`}
            >
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`} />
              <p className={`text-sm ${isDarkMode ? "text-blue-200" : "text-blue-800"}`}>
                As an admin, you can manage channels but cannot delete the community. Only the owner can delete it.
              </p>
            </div>
          )}

          {/* Owner Info */}
          {isOwner && (
            <div
              className={`flex items-start gap-3 p-3 rounded-lg ${
                isDarkMode ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"
              }`}
            >
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDarkMode ? "text-amber-400" : "text-amber-600"}`} />
              <p className={`text-sm ${isDarkMode ? "text-amber-200" : "text-amber-800"}`}>
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