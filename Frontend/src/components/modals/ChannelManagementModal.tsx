import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Hash, Volume2, Edit2, Trash2, AlertCircle } from "lucide-react";
import { channelService } from "@/services/channelService";
import { socketService } from "@/services/socketService";
import { useNotifications } from "@/hooks/useNotifications";
import { ConfirmDialog } from "./ConfirmDialog";

interface ChannelManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: {
    id: number;
    name: string;
    type: 'text' | 'voice';
    description?: string;
  } | null;
  communityId?: number;
  userRole?: 'admin' | 'owner' | 'member';
  onChannelUpdated?: (channel: any) => void;
  onChannelDeleted?: () => void;
}

export default function ChannelManagementModal({
  isOpen,
  onClose,
  channel,
  communityId,
  userRole,
  onChannelUpdated,
  onChannelDeleted,
}: ChannelManagementModalProps) {
  const { isDarkMode } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "text" as 'text' | 'voice',
  });

  useEffect(() => {
    if (channel) {
      setFormData({
        name: channel.name,
        description: channel.description || "",
        type: channel.type,
      });
      setIsEditing(false);
    }
  }, [channel, isOpen]);

  const isAdmin = userRole === "admin" || userRole === "owner";

  const handleSaveChanges = async () => {
    if (!channel || !isAdmin) return;

    if (!formData.name.trim()) {
      showError({ title: "Channel name cannot be empty" });
      return;
    }

    setIsLoading(true);
    try {
      const updated = await channelService.updateChannel(
        channel.id,
        formData.name,
        formData.description,
        formData.type
      );
      showSuccess({ title: `Channel "${updated.name}" updated successfully` });
      
      // Update local form data to reflect changes
      setFormData({
        name: updated.name,
        description: updated.description || "",
        type: (updated.type === 'text' || updated.type === 'voice') ? updated.type : 'text',
      });
      
      // Broadcast the channel update via socket
      if (socketService.isConnected()) {
        socketService.broadcastChannelUpdated(updated);
      }
      
      onChannelUpdated?.(updated);
      setIsEditing(false);
    } catch (error: any) {
      showError({ title: error.message || "Failed to update channel" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channel || !isAdmin) return;

    setIsLoading(true);
    try {
      await channelService.deleteChannel(channel.id);
      showSuccess({ title: "Channel deleted successfully" });
      
      // Broadcast the channel deletion via socket
      if (socketService.isConnected() && communityId) {
        socketService.broadcastChannelDeleted(channel.id, communityId);
      }
      
      onChannelDeleted?.();
      onClose();
    } catch (error: any) {
      showError({ title: error.message || "Failed to delete channel" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !channel) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl shadow-2xl border max-h-[90vh] overflow-y-auto bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b sticky top-0 border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))]">
          <div className="flex items-center gap-3">
            {channel.type === "voice" ? (
              <Volume2 className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
            ) : (
              <Hash className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
            )}
            <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
              Channel Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all hover:bg-[hsl(var(--theme-bg-hover))]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Channel Info */}
          <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))]">
            <div className="flex items-center gap-3 mb-3">
              {channel.type === "voice" ? (
                <Volume2 className="w-5 h-5 text-[hsl(var(--theme-accent-secondary))]" />
              ) : (
                <Hash className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
              )}
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--theme-text-secondary))]">
                  Channel Type
                </p>
                <p className="text-sm font-bold text-[hsl(var(--theme-text-primary))]">
                  {channel.type === "voice" ? "Voice Channel" : "Text Channel"}
                </p>
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--theme-text-muted))]">
              {channel.type === "voice"
                ? "Members can join to have voice conversations"
                : "Members can send text messages and files"}
            </p>
          </div>

          {/* Edit Mode */}
          {isEditing && isAdmin ? (
            <div className="space-y-4">
              {/* Channel Name */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))]"
                  placeholder="Channel name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]"
                  placeholder="Add a description..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] text-white transition-all disabled:opacity-50"
                >
                  {isLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Channel Name Display */}
              <div>
                <p className="text-xs font-semibold mb-1 text-[hsl(var(--theme-text-muted))]">
                  CHANNEL NAME
                </p>
                <p className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                  {formData.name}
                </p>
              </div>

              {/* Description Display */}
              {formData.description && (
                <div>
                  <p className="text-xs font-semibold mb-1 text-[hsl(var(--theme-text-muted))]">
                    DESCRIPTION
                  </p>
                  <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                    {formData.description}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && !isEditing && (
            <div className="space-y-3 pt-4 border-t border-[hsl(var(--theme-border-default))]">
              <button
                onClick={() => setIsEditing(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all bg-[hsl(var(--theme-accent-primary))]/10 hover:bg-[hsl(var(--theme-accent-primary))]/20 text-[hsl(var(--theme-accent-primary))]"
              >
                <Edit2 className="w-4 h-4" />
                Edit Channel
              </button>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all bg-red-500/10 hover:bg-red-500/20 text-red-400"
              >
                <Trash2 className="w-4 h-4" />
                Delete Channel
              </button>
            </div>
          )}

          {/* Permission Warning */}
          {!isAdmin && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-400" />
              <p className="text-sm text-yellow-200">
                Only channel admins can edit or delete this channel
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Channel?"
        description={`Are you sure you want to delete "${channel.name}"? This action cannot be undone. All messages in this channel will be permanently deleted.`}
        isDangerous={true}
        isLoading={isLoading}
        onConfirm={handleDeleteChannel}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
