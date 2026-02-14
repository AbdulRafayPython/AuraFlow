// components/voice/VoiceDock.tsx — Floating Voice Bar
// Persists while user browses text channels, DMs, etc.
import React from "react";
import { useVoice } from "@/contexts/VoiceContext";
import { getAvatarUrl } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  Maximize2,
  Radio,
} from "lucide-react";

export default function VoiceDock() {
  const {
    isInVoiceChannel,
    currentVoiceChannelName,
    voiceUsers,
    isAudioEnabled,
    isDeafened,
    speakingUsers,
    toggleAudio,
    toggleDeaf,
    leaveVoiceChannel,
    setVoiceRoomModalOpen,
  } = useVoice();

  if (!isInVoiceChannel) return null;

  // Show max 4 avatars
  const visibleUsers = voiceUsers.slice(0, 4);
  const extraCount = voiceUsers.length - visibleUsers.length;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-bottom-4 duration-300">
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl border border-[hsl(var(--theme-border-default)/0.3)] backdrop-blur-xl"
        style={{
          background: "hsl(var(--theme-bg-secondary) / 0.92)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px hsl(var(--theme-border-default) / 0.1)",
        }}
      >
        {/* Live indicator + Channel name */}
        <button
          onClick={() => setVoiceRoomModalOpen(true)}
          className="flex items-center gap-2 pr-3 border-r border-[hsl(var(--theme-border-default)/0.3)] hover:opacity-80 transition-opacity"
        >
          <div className="relative">
            <Radio className="w-4 h-4 text-green-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500">
              <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-60" />
            </span>
          </div>
          <span className="text-sm font-medium text-[hsl(var(--theme-text-primary))] max-w-[120px] truncate">
            {currentVoiceChannelName || "Voice"}
          </span>
        </button>

        {/* Participant Avatars */}
        <div className="flex items-center -space-x-2 pr-2 border-r border-[hsl(var(--theme-border-default)/0.3)]">
          {visibleUsers.map((user) => {
            const isSpeaking = speakingUsers.has(user.username);
            return (
              <div
                key={user.id}
                className={`relative w-8 h-8 rounded-full overflow-hidden ring-2 transition-all duration-200 ${
                  isSpeaking
                    ? "ring-[hsl(var(--theme-accent-primary))] scale-110 z-10 shadow-[0_0_10px_hsl(var(--theme-accent-primary)/0.4)]"
                    : "ring-[hsl(var(--theme-bg-secondary))]"
                }`}
                title={user.display_name}
              >
                {user.avatar_url ? (
                  <img
                    src={getAvatarUrl(user.avatar_url, user.username)}
                    alt={user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white text-[10px] font-bold">
                    {user.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
              </div>
            );
          })}
          {extraCount > 0 && (
            <div className="w-8 h-8 rounded-full flex items-center justify-center ring-2 ring-[hsl(var(--theme-bg-secondary))] bg-[hsl(var(--theme-bg-tertiary))] text-[10px] font-bold text-[hsl(var(--theme-text-muted))]">
              +{extraCount}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {/* Mic */}
          <button
            onClick={() => toggleAudio()}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              isAudioEnabled
                ? "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
            title={isAudioEnabled ? "Mute" : "Unmute"}
          >
            {isAudioEnabled ? (
              <Mic className="w-4 h-4" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
          </button>

          {/* Deafen */}
          <button
            onClick={() => toggleDeaf()}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              isDeafened
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
            }`}
            title={isDeafened ? "Undeafen" : "Deafen"}
          >
            {isDeafened ? (
              <HeadphoneOff className="w-4 h-4" />
            ) : (
              <Headphones className="w-4 h-4" />
            )}
          </button>

          {/* Expand */}
          <button
            onClick={() => setVoiceRoomModalOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] transition-all"
            title="Expand Voice Room"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Leave */}
          <button
            onClick={() => leaveVoiceChannel()}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/20"
            title="Leave Voice"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
