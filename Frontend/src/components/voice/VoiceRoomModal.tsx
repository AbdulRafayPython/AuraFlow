// components/voice/VoiceRoomModal.tsx — Expanded Voice Room View
// Original premium design — NOT a Discord clone
import React from "react";
import { useVoice } from "@/contexts/VoiceContext";
import { getAvatarUrl } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  X,
  Radio,
  Users,
} from "lucide-react";

export default function VoiceRoomModal() {
  const {
    isInVoiceChannel,
    currentVoiceChannelName,
    voiceUsers,
    isAudioEnabled,
    isDeafened,
    speakingUsers,
    isVoiceRoomModalOpen,
    setVoiceRoomModalOpen,
    toggleAudio,
    toggleDeaf,
    leaveVoiceChannel,
  } = useVoice();

  if (!isVoiceRoomModalOpen || !isInVoiceChannel) return null;

  const currentUsername = localStorage.getItem("username");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setVoiceRoomModalOpen(false)}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl border border-[hsl(var(--theme-border-default)/0.3)]"
        style={{ background: "hsl(var(--theme-bg-secondary))" }}
      >
        {/* Top gradient bar */}
        <div
          className="h-1"
          style={{ background: "var(--theme-accent-gradient)" }}
        />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[hsl(var(--theme-accent-primary)/0.15)]">
                <Radio className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
              </div>
              {/* Live pulse */}
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[hsl(var(--theme-bg-secondary))]">
                <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                {currentVoiceChannelName || "Voice Room"}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--theme-text-muted))]">
                <Users className="w-3 h-3" />
                <span>
                  {voiceUsers.length} participant{voiceUsers.length !== 1 ? "s" : ""}
                </span>
                <span className="inline-block w-1 h-1 rounded-full bg-green-500" />
                <span className="text-green-400">Live</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setVoiceRoomModalOpen(false)}
            className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Participant Grid */}
        <div className="px-6 pb-4 max-h-[50vh] overflow-y-auto">
          {voiceUsers.length === 0 ? (
            <div className="text-center py-12 text-[hsl(var(--theme-text-muted))]">
              <Radio className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Waiting for participants...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {voiceUsers.map((user) => {
                const isSpeaking = speakingUsers.has(user.username);
                const isMe = user.username === currentUsername;

                return (
                  <div
                    key={user.id}
                    className={`relative group rounded-xl p-4 flex flex-col items-center gap-2 transition-all duration-300 ${
                      isSpeaking
                        ? "ring-2 ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary)/0.08)]"
                        : "bg-[hsl(var(--theme-bg-tertiary)/0.5)] hover:bg-[hsl(var(--theme-bg-tertiary))]"
                    }`}
                  >
                    {/* Avatar with speaking ring */}
                    <div className="relative">
                      <div
                        className={`w-16 h-16 rounded-full overflow-hidden transition-all duration-300 ${
                          isSpeaking
                            ? "ring-[3px] ring-[hsl(var(--theme-accent-primary))] shadow-[0_0_20px_hsl(var(--theme-accent-primary)/0.3)]"
                            : "ring-2 ring-transparent"
                        }`}
                      >
                        {user.avatar_url ? (
                          <img
                            src={getAvatarUrl(user.avatar_url, user.username)}
                            alt={user.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white font-bold text-lg">
                            {user.display_name?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                      </div>

                      {/* Speaking wave animation */}
                      {isSpeaking && (
                        <div className="absolute -inset-1 rounded-full pointer-events-none">
                          <div className="absolute inset-0 rounded-full border-2 border-[hsl(var(--theme-accent-primary)/0.5)] animate-[voicePulse_1.5s_ease-out_infinite]" />
                        </div>
                      )}

                      {/* Mute/Deaf badges */}
                      {(user.is_muted || user.is_deaf) && (
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center bg-red-500/90 text-white shadow-lg">
                          {user.is_deaf ? (
                            <HeadphoneOff className="w-3 h-3" />
                          ) : (
                            <MicOff className="w-3 h-3" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="text-center w-full">
                      <p className="text-sm font-medium truncate text-[hsl(var(--theme-text-primary))]">
                        {user.display_name}
                        {isMe && (
                          <span className="text-[10px] ml-1 text-[hsl(var(--theme-text-muted))]">
                            (you)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div
          className="px-6 py-4 border-t border-[hsl(var(--theme-border-default)/0.3)] flex items-center justify-center gap-3"
          style={{ background: "hsl(var(--theme-bg-primary) / 0.5)" }}
        >
          {/* Mic toggle */}
          <button
            onClick={() => toggleAudio()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isAudioEnabled
                ? "bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))]"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
            title={isAudioEnabled ? "Mute" : "Unmute"}
          >
            {isAudioEnabled ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
          </button>

          {/* Deafen toggle */}
          <button
            onClick={() => toggleDeaf()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isDeafened
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))]"
            }`}
            title={isDeafened ? "Undeafen" : "Deafen"}
          >
            {isDeafened ? (
              <HeadphoneOff className="w-5 h-5" />
            ) : (
              <Headphones className="w-5 h-5" />
            )}
          </button>

          {/* Leave */}
          <button
            onClick={() => {
              leaveVoiceChannel();
              setVoiceRoomModalOpen(false);
            }}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/20"
            title="Leave Voice"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        {/* Animation keyframes */}
        <style>{`
          @keyframes voicePulse {
            0% { transform: scale(1); opacity: 0.6; }
            100% { transform: scale(1.3); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
