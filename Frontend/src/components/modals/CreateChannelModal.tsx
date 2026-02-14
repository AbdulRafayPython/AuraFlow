import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Hash, Volume2, Plus, AlertCircle, Radio } from "lucide-react";
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
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Update channel type when current channel type changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: "",
        description: "",
        type: currentChannelType,
      });
      setErrors({});
      // Auto-focus name input after modal animation
      setTimeout(() => nameInputRef.current?.focus(), 200);
    }
  }, [currentChannelType, isOpen]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      newErrors.name = "Channel name is required";
    } else if (trimmedName.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      newErrors.name = "Only letters, numbers, spaces, hyphens and underscores";
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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const isFormValid = formData.name.trim().length >= 2;

  const channelTypes = [
    {
      value: "text" as const,
      icon: Hash,
      label: "Text Channel",
      description: "Send messages, images, and files",
    },
    {
      value: "voice" as const,
      icon: Radio,
      label: "Voice Channel",
      description: "Talk with your community in real time",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[250] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200 bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default)/0.5)]"
        style={{
          boxShadow: "0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px hsl(var(--theme-border-default) / 0.1)",
        }}
      >
        {/* Accent top bar */}
        <div className="h-0.5" style={{ background: "var(--theme-accent-gradient)" }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[hsl(var(--theme-accent-primary)/0.12)]">
              <Plus className="w-4.5 h-4.5 text-[hsl(var(--theme-accent-primary))]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))] leading-tight">
                Create Channel
              </h2>
              <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                Add a new channel to your community
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] disabled:opacity-50"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          {/* Channel Type Selection — Card-style */}
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider mb-2.5">
              Channel Type
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              {channelTypes.map((ct) => {
                const selected = formData.type === ct.value;
                const Icon = ct.icon;
                return (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: ct.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setFormData({ ...formData, type: ct.value });
                      }
                    }}
                    aria-pressed={selected}
                    className={`relative p-3.5 rounded-xl border-2 transition-all duration-150 flex flex-col items-center gap-2 text-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--theme-accent-primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--theme-bg-elevated))] ${
                      selected
                        ? "border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary)/0.08)] shadow-[0_0_0_1px_hsl(var(--theme-accent-primary)/0.15)]"
                        : "border-[hsl(var(--theme-border-default)/0.6)] bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:border-[hsl(var(--theme-text-muted)/0.4)] hover:bg-[hsl(var(--theme-bg-secondary))]"
                    }`}
                  >
                    {/* Selection dot */}
                    <div
                      className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full transition-all duration-150 ${
                        selected
                          ? "bg-[hsl(var(--theme-accent-primary))] shadow-[0_0_6px_hsl(var(--theme-accent-primary)/0.5)]"
                          : "bg-[hsl(var(--theme-text-muted)/0.2)]"
                      }`}
                    />

                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-150 ${
                        selected
                          ? "bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]"
                          : "bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))]"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p
                        className={`text-[13px] font-semibold leading-tight transition-colors duration-150 ${
                          selected
                            ? "text-[hsl(var(--theme-accent-primary))]"
                            : "text-[hsl(var(--theme-text-primary))]"
                        }`}
                      >
                        {ct.label}
                      </p>
                      <p className="text-[10px] mt-0.5 text-[hsl(var(--theme-text-muted))] leading-snug">
                        {ct.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Channel Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="channel-name"
              className="text-[13px] font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider flex items-center justify-between"
            >
              <span>
                Channel Name <span className="text-red-400">*</span>
              </span>
              <span
                className={`text-[10px] font-normal normal-case tracking-normal ${
                  formData.name.length > 45
                    ? "text-amber-400"
                    : "text-[hsl(var(--theme-text-muted))]"
                }`}
              >
                {formData.name.length}/50
              </span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--theme-text-muted))]">
                {formData.type === "voice" ? (
                  <Radio className="w-4 h-4" />
                ) : (
                  <Hash className="w-4 h-4" />
                )}
              </div>
              <input
                ref={nameInputRef}
                id="channel-name"
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: "" });
                }}
                placeholder={
                  formData.type === "voice" ? "e.g. Team Huddle" : "e.g. general"
                }
                maxLength={50}
                disabled={isLoading}
                autoComplete="off"
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)] focus:border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary)/0.7)] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted)/0.6)] disabled:opacity-50 ${
                  errors.name
                    ? "border-red-400/60 focus:ring-red-400/30 focus:border-red-400"
                    : "border-[hsl(var(--theme-border-default)/0.6)]"
                }`}
              />
            </div>
            {errors.name && (
              <p className="flex items-center gap-1 text-[11px] text-red-400">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              htmlFor="channel-desc"
              className="text-[13px] font-semibold text-[hsl(var(--theme-text-secondary))] uppercase tracking-wider flex items-center justify-between"
            >
              <span>
                Description{" "}
                <span className="font-normal normal-case tracking-normal text-[hsl(var(--theme-text-muted))]">
                  — optional
                </span>
              </span>
              {formData.description.length > 0 && (
                <span
                  className={`text-[10px] font-normal normal-case tracking-normal ${
                    formData.description.length > 180
                      ? "text-amber-400"
                      : "text-[hsl(var(--theme-text-muted))]"
                  }`}
                >
                  {formData.description.length}/200
                </span>
              )}
            </label>
            <textarea
              id="channel-desc"
              value={formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value });
                if (errors.description) setErrors({ ...errors, description: "" });
              }}
              placeholder="What's this channel about?"
              maxLength={200}
              rows={2}
              disabled={isLoading}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none transition-all focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)] focus:border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary)/0.7)] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted)/0.6)] disabled:opacity-50 ${
                errors.description
                  ? "border-red-400/60 focus:ring-red-400/30 focus:border-red-400"
                  : "border-[hsl(var(--theme-border-default)/0.6)]"
              }`}
            />
            {errors.description && (
              <p className="flex items-center gap-1 text-[11px] text-red-400">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {errors.description}
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[hsl(var(--theme-border-default)/0.3)]" />

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border bg-transparent hover:bg-[hsl(var(--theme-bg-hover))] border-[hsl(var(--theme-border-default)/0.5)] text-[hsl(var(--theme-text-secondary))] disabled:opacity-50 active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{
                background: isFormValid && !isLoading
                  ? "var(--theme-accent-gradient)"
                  : "hsl(var(--theme-text-muted) / 0.3)",
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                `Create ${formData.type === "voice" ? "Voice" : "Text"} Channel`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
