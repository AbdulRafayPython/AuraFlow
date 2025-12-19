import React, { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useVoice } from "@/contexts/VoiceContext";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Phone,
  Users,
  Settings,
} from "lucide-react";

interface VoiceChannelViewProps {
  channelId: number;
  channelName: string;
  onClose?: () => void;
}

export default function VoiceChannelView({
  channelId,
  channelName,
  onClose,
}: VoiceChannelViewProps) {
  const { isDarkMode } = useTheme();
  const {
    isInVoiceChannel,
    voiceUsers,
    isAudioEnabled,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleAudio,
    toggleDeaf,
    getChannelMembers,
  } = useVoice();

  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInVoiceChannel && voiceUsers.length === 0) {
      getChannelMembers(channelId);
    }
  }, [isInVoiceChannel, channelId, voiceUsers.length, getChannelMembers]);

  const handleJoinChannel = async () => {
    try {
      setIsJoining(true);
      setError(null);
      await joinVoiceChannel(channelId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to join voice channel";
      setError(errorMessage);
      console.error("[VOICE_UI] Error joining channel:", err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveChannel = async () => {
    try {
      await leaveVoiceChannel();
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error("[VOICE_UI] Error leaving channel:", err);
    }
  };

  return (
    <div
      className={`flex flex-col h-full ${
        isDarkMode ? "bg-slate-900" : "bg-white"
      }`}
    >
      {/* Header */}
      <div
        className={`px-6 py-4 border-b ${
          isDarkMode
            ? "bg-slate-800/50 border-slate-700"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              🎤 {channelName}
            </h2>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Voice Channel
            </p>
          </div>
          <button
            onClick={() => {
              if (isInVoiceChannel) {
                handleLeaveChannel();
              } else if (onClose) {
                onClose();
              }
            }}
            className={`text-2xl transition-colors ${
              isDarkMode
                ? "text-gray-400 hover:text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
            title="Close voice channel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!isInVoiceChannel ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                isDarkMode ? "bg-slate-800" : "bg-gray-100"
              }`}
            >
              <Mic className="w-10 h-10 text-blue-500" />
            </div>
            <h3
              className={`text-xl font-semibold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Join Voice Channel
            </h3>
            <p
              className={`text-center mb-6 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Click below to join the voice channel and start communicating with
              your team
            </p>
            <button
              onClick={handleJoinChannel}
              disabled={isJoining}
              className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
                isJoining
                  ? "opacity-50 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              <Phone className="w-5 h-5" />
              {isJoining ? "Connecting..." : "Join Channel"}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Users in Channel */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-500" />
                <h3
                  className={`font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Active Users ({voiceUsers.length})
                </h3>
              </div>

              <div className="space-y-2">
                {voiceUsers.length === 0 ? (
                  <p
                    className={`text-center py-8 ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    No other users in this channel
                  </p>
                ) : (
                  voiceUsers.map((user, index) => (
                    <div
                      key={`${channelId}-${user.id}-${user.username}`}
                      className={`p-3 rounded-lg flex items-center justify-between ${
                        isDarkMode ? "bg-slate-800" : "bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.display_name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                            {user.display_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <p
                            className={`font-medium ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {user.display_name}
                          </p>
                          <p
                            className={`text-xs ${
                              isDarkMode ? "text-gray-500" : "text-gray-500"
                            }`}
                          >
                            @{user.username}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {user.is_muted && (
                          <MicOff className="w-4 h-4 text-red-500" />
                        )}
                        {user.is_deaf && (
                          <VolumeX className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Controls */}
      {isInVoiceChannel && (
        <div
          className={`px-6 py-4 border-t ${
            isDarkMode
              ? "bg-slate-800/50 border-slate-700"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            {/* Microphone Toggle */}
            <button
              onClick={toggleAudio}
              className={`p-3 rounded-full transition-all ${
                isAudioEnabled
                  ? isDarkMode
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-green-500 hover:bg-green-600 text-white"
                  : isDarkMode
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-red-500 hover:bg-red-600 text-white"
              }`}
              title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
            >
              {isAudioEnabled ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>

            {/* Deaf Toggle */}
            <button
              onClick={toggleDeaf}
              className={`p-3 rounded-full transition-all ${
                isDeafened
                  ? isDarkMode
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-red-500 hover:bg-red-600 text-white"
                  : isDarkMode
                    ? "bg-slate-700 hover:bg-slate-600 text-gray-300"
                    : "bg-gray-300 hover:bg-gray-400 text-gray-700"
              }`}
              title={isDeafened ? "Undeafen" : "Deafen"}
            >
              {isDeafened ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>

            {/* Settings */}
            <button
              className={`p-3 rounded-full transition-all ${
                isDarkMode
                  ? "bg-slate-700 hover:bg-slate-600 text-gray-300"
                  : "bg-gray-300 hover:bg-gray-400 text-gray-700"
              }`}
              title="Voice Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Leave Channel */}
            <button
              onClick={handleLeaveChannel}
              className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all"
              title="Leave Channel"
            >
              <Phone className="w-5 h-5 transform rotate-[225deg]" />
            </button>
          </div>

          <div className="flex gap-2 text-xs">
            <span
              className={`flex-1 text-center py-2 rounded ${
                isAudioEnabled
                  ? isDarkMode
                    ? "bg-green-600/20 text-green-400"
                    : "bg-green-50 text-green-700"
                  : isDarkMode
                    ? "bg-red-600/20 text-red-400"
                    : "bg-red-50 text-red-700"
              }`}
            >
              {isAudioEnabled ? "Microphone ON" : "Microphone OFF"}
            </span>
            <span
              className={`flex-1 text-center py-2 rounded ${
                isDeafened
                  ? isDarkMode
                    ? "bg-red-600/20 text-red-400"
                    : "bg-red-50 text-red-700"
                  : isDarkMode
                    ? "bg-green-600/20 text-green-400"
                    : "bg-green-50 text-green-700"
              }`}
            >
              {isDeafened ? "Deafened" : "Listening"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
