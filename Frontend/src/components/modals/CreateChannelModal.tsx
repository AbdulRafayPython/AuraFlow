import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Hash, Volume2, Plus } from "lucide-react";
import { channelService } from "@/services/channelService";
import { useNotifications } from "@/hooks/useNotifications";

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: number;
  onChannelCreated?: (channel: any) => void;
}

export default function CreateChannelModal({
  isOpen,
  onClose,
  communityId,
  onChannelCreated,
}: CreateChannelModalProps) {
  const { isDarkMode } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "text" as 'text' | 'voice',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border ${
          isDarkMode
            ? "bg-slate-900/95 border-slate-700/50 backdrop-blur-xl"
            : "bg-white/95 border-gray-200/70 backdrop-blur-xl"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-5 border-b ${
            isDarkMode ? "border-slate-700/70" : "border-gray-200/70"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <h2 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Create Channel
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className={`p-2 rounded-lg transition-all ${
              isDarkMode ? "hover:bg-slate-800" : "hover:bg-gray-100"
            } disabled:opacity-50`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Channel Type Selection */}
          <div className="space-y-3">
            <label className={`block text-sm font-semibold ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
              Channel Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "text" })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.type === "text"
                    ? isDarkMode
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-blue-500 bg-blue-50"
                    : isDarkMode
                    ? "border-slate-600 bg-slate-800/50 hover:border-slate-500"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <Hash className={`w-6 h-6 ${formData.type === "text" ? "text-blue-500" : isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
                <span className={`text-sm font-semibold ${formData.type === "text" ? (isDarkMode ? "text-blue-300" : "text-blue-700") : isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Text
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "voice" })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.type === "voice"
                    ? isDarkMode
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-purple-500 bg-purple-50"
                    : isDarkMode
                    ? "border-slate-600 bg-slate-800/50 hover:border-slate-500"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <Volume2 className={`w-6 h-6 ${formData.type === "voice" ? "text-purple-500" : isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
                <span className={`text-sm font-semibold ${formData.type === "voice" ? (isDarkMode ? "text-purple-300" : "text-purple-700") : isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Voice
                </span>
              </button>
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
              Channel Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={formData.type === "voice" ? "e.g., General Voice" : "e.g., general"}
              maxLength={50}
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? "bg-slate-800 border-slate-600 text-white placeholder-gray-500"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
              } disabled:opacity-50 ${errors.name ? (isDarkMode ? "border-red-500/50" : "border-red-400") : ""}`}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
            <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
              {formData.name.length}/50
            </p>
          </div>

          {/* Description */}
          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
              Description <span className={`font-normal ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>(Optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this channel about?"
              maxLength={200}
              rows={3}
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? "bg-slate-800 border-slate-600 text-white placeholder-gray-500"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
              } disabled:opacity-50 ${errors.description ? (isDarkMode ? "border-red-500/50" : "border-red-400") : ""}`}
            />
            {errors.description && (
              <p className="text-xs text-red-500 mt-1">{errors.description}</p>
            )}
            <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
              {formData.description.length}/200
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                isDarkMode
                  ? "bg-slate-800 hover:bg-slate-700 text-gray-200"
                  : "bg-gray-200 hover:bg-gray-300 text-gray-800"
              } disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.name.trim()}
              className="flex-1 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
