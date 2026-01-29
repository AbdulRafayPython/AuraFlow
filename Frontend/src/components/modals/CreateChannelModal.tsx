import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Hash, Volume2, Plus } from "lucide-react";
import { channelService } from "@/services/channelService";
import { socketService } from "@/services/socketService";
import { useNotifications } from "@/hooks/useNotifications";

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: number;
  currentChannelType?: 'text' | 'voice';
  onChannelCreated?: (channel: any) => void;
}

export default function CreateChannelModal({
  isOpen,
  onClose,
  communityId,
  currentChannelType = 'text',
  onChannelCreated,
}: CreateChannelModalProps) {
  const { isDarkMode } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: 'text' as 'text' | 'voice',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update channel type when current channel type changes or modal opens
  useEffect(() => {
    setFormData({
      name: "",
      description: "",
      type: currentChannelType,
    });
    setErrors({});
  }, [currentChannelType]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "Channel name is required";
    }
    if (formData.name.length > 50) {
      newErrors.name = "Channel name must be 50 characters or less";
    }
    if (formData.description.length > 200) {
      newErrors.description = "Description must be 200 characters or less";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const channel = await channelService.createChannel(
        communityId,
        formData.name,
        formData.type,
        formData.description
      );
      
      showSuccess({ title: `Channel "${channel.name}" created successfully` });
      
      // Broadcast the channel creation via socket
      if (socketService.isConnected()) {
        socketService.broadcastChannelCreated({
          ...channel,
          community_id: communityId,
        });
      }
      
      // Call the callback with the new channel
      onChannelCreated?.(channel);
      
      // Reset form
      setFormData({
        name: "",
        description: "",
        type: "text",
      });
      setErrors({});
      onClose();
    } catch (error: any) {
      showError({ title: error.message || "Failed to create channel" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md rounded-2xl shadow-2xl border bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--theme-border-default))]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
              Create Channel
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-lg transition-all hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Channel Type Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
              Channel Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "text" })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.type === "text"
                    ? "border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary))]/10"
                    : "border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] hover:border-[hsl(var(--theme-border-subtle))]"
                }`}
              >
                <Hash className={`w-6 h-6 ${formData.type === "text" ? "text-[hsl(var(--theme-accent-primary))]" : "text-[hsl(var(--theme-text-muted))]"}`} />
                <span className={`text-sm font-semibold ${formData.type === "text" ? "text-[hsl(var(--theme-accent-primary))]" : "text-[hsl(var(--theme-text-secondary))]"}`}>
                  Text
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "voice" })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.type === "voice"
                    ? "border-[hsl(var(--theme-accent-secondary))] bg-[hsl(var(--theme-accent-secondary))]/10"
                    : "border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] hover:border-[hsl(var(--theme-border-subtle))]"
                }`}
              >
                <Volume2 className={`w-6 h-6 ${formData.type === "voice" ? "text-[hsl(var(--theme-accent-secondary))]" : "text-[hsl(var(--theme-text-muted))]"}`} />
                <span className={`text-sm font-semibold ${formData.type === "voice" ? "text-[hsl(var(--theme-accent-secondary))]" : "text-[hsl(var(--theme-text-secondary))]"}`}>
                  Voice
                </span>
              </button>
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
              Channel Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={formData.type === "voice" ? "e.g., General Voice" : "e.g., general"}
              maxLength={50}
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] disabled:opacity-50 ${errors.name ? "border-red-500/50" : ""}`}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
            <p className="text-xs mt-1 text-[hsl(var(--theme-text-muted))]">
              {formData.name.length}/50
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-[hsl(var(--theme-text-primary))]">
              Description <span className="font-normal text-[hsl(var(--theme-text-muted))]">(Optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this channel about?"
              maxLength={200}
              rows={3}
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] disabled:opacity-50 ${errors.description ? "border-red-500/50" : ""}`}
            />
            {errors.description && (
              <p className="text-xs text-red-500 mt-1">{errors.description}</p>
            )}
            <p className="text-xs mt-1 text-[hsl(var(--theme-text-muted))]">
              {formData.description.length}/200
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-lg font-semibold transition-all bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.name.trim()}
              className="flex-1 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
