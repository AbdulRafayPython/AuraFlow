import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Hash, Volume2, Edit2, Trash2, AlertCircle } from "lucide-react";
import { channelService } from "@/services/channelService";
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
  userRole?: 'admin' | 'owner' | 'member';
  onChannelUpdated?: (channel: any) => void;
  onChannelDeleted?: () => void;
}

export default function ChannelManagementModal({
  isOpen,
  onClose,
  channel,
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border max-h-[90vh] overflow-y-auto ${
          isDarkMode
            ? "bg-slate-900/95 border-slate-700/50 backdrop-blur-xl"
            : "bg-white/95 border-gray-200/70 backdrop-blur-xl"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-5 border-b sticky top-0 ${
            isDarkMode ? "border-slate-700/70 bg-slate-800/50" : "border-gray-200/70 bg-white/50"
          }`}
        >
          <div className="flex items-center gap-3">
            {channel.type === "voice" ? (
              <Volume2 className="w-5 h-5 text-blue-500" />
            ) : (
              <Hash className="w-5 h-5 text-blue-500" />
            )}
            <h2 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Channel Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-all ${
              isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-gray-100"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Channel Info */}
          <div className={`p-4 rounded-xl ${isDarkMode ? "bg-slate-800/50" : "bg-gray-50"}`}>
            <div className="flex items-center gap-3 mb-3">
              {channel.type === "voice" ? (
                <Volume2 className="w-5 h-5 text-purple-500" />
              ) : (
                <Hash className="w-5 h-5 text-blue-500" />
              )}
              <div>
                <p className={`text-sm font-semibold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Channel Type
                </p>
                <p className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {channel.type === "voice" ? "Voice Channel" : "Text Channel"}
                </p>
              </div>
            </div>
            <p className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
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
                <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                  Channel Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  placeholder="Channel name"
                />
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-600 text-white placeholder-gray-500"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                  }`}
                  placeholder="Add a description..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isLoading}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    isDarkMode
                      ? "bg-slate-700 hover:bg-slate-600 text-gray-200"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                  } disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-50"
                >
                  {isLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Channel Name Display */}
              <div>
                <p className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  CHANNEL NAME
                </p>
                <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {channel.name}
                </p>
              </div>

              {/* Description Display */}
              {channel.description && (
                <div>
                  <p className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    DESCRIPTION
                  </p>
                  <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    {channel.description}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && !isEditing && (
            <div className="space-y-3 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => setIsEditing(true)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  isDarkMode
                    ? "bg-blue-600/10 hover:bg-blue-600/20 text-blue-400"
                    : "bg-blue-50 hover:bg-blue-100 text-blue-700"
                }`}
              >
                <Edit2 className="w-4 h-4" />
                Edit Channel
              </button>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  isDarkMode
                    ? "bg-red-600/10 hover:bg-red-600/20 text-red-400"
                    : "bg-red-50 hover:bg-red-100 text-red-700"
                }`}
              >
                <Trash2 className="w-4 h-4" />
                Delete Channel
              </button>
            </div>
          )}

          {/* Permission Warning */}
          {!isAdmin && (
            <div
              className={`flex items-start gap-3 p-3 rounded-lg ${
                isDarkMode ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-yellow-50 border border-yellow-200"
              }`}
            >
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDarkMode ? "text-yellow-400" : "text-yellow-600"}`} />
              <p className={`text-sm ${isDarkMode ? "text-yellow-200" : "text-yellow-800"}`}>
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
