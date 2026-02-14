// components/CommunityHeader.tsx - Professional community header with banner and logo
import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Settings, Users, Hash, ChevronDown, Crown, Shield } from "lucide-react";
import { Community, Channel } from "@/types";
import CommunitySettingsModal from "./modals/CommunitySettingsModal";
import { API_SERVER } from "@/config/api";

interface CommunityHeaderProps {
  community: Community;
  channels: Channel[];
  memberCount?: number;
  currentChannel?: Channel | null;
  onChannelSelect?: (channel: Channel) => void;
  onCommunityUpdated?: (community: Community) => void;
}

export default function CommunityHeader({
  community,
  channels,
  memberCount = 0,
  currentChannel,
  onChannelSelect,
  onCommunityUpdated,
}: CommunityHeaderProps) {
  const { isDarkMode } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [showChannels, setShowChannels] = useState(true);

  const isOwnerOrAdmin = community.role === 'owner' || community.role === 'admin';
  const logoUrl = community.logo_url ? `${API_SERVER}${community.logo_url}` : null;
  const bannerUrl = community.banner_url ? `${API_SERVER}${community.banner_url}` : null;

  const getRoleBadge = () => {
    if (community.role === 'owner') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isDarkMode ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"
        }`}>
          <Crown className="w-3 h-3" />
          Owner
        </span>
      );
    }
    if (community.role === 'admin') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isDarkMode ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"
        }`}>
          <Shield className="w-3 h-3" />
          Admin
        </span>
      );
    }
    return null;
  };

  const getInitials = () => {
    if (community.icon) return community.icon;
    return community.name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <div className={`flex flex-col ${isDarkMode ? "bg-slate-800/50" : "bg-gray-50"}`}>
        {/* Banner Section */}
        <div className="relative h-32 overflow-hidden">
          {bannerUrl ? (
            <img 
              src={bannerUrl} 
              alt={`${community.name} banner`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              className="w-full h-full"
              style={{ 
                background: `linear-gradient(135deg, ${community.color || '#8B5CF6'} 0%, ${community.color || '#8B5CF6'}88 100%)`
              }}
            />
          )}
          
          {/* Gradient Overlay */}
          <div className={`absolute inset-0 bg-gradient-to-t ${
            isDarkMode ? "from-slate-800/90 to-transparent" : "from-white/90 to-transparent"
          }`} />
          
          {/* Settings Button */}
          {isOwnerOrAdmin && (
            <button
              onClick={() => setShowSettings(true)}
              className={`absolute top-3 right-3 p-2 rounded-lg transition-all ${
                isDarkMode 
                  ? "bg-slate-900/50 hover:bg-slate-900/70 text-white" 
                  : "bg-white/50 hover:bg-white/70 text-gray-700"
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Community Info */}
        <div className="relative px-4 pb-4">
          {/* Logo */}
          <div className="absolute -top-10 left-4">
            <div 
              className={`w-20 h-20 rounded-2xl border-4 flex items-center justify-center overflow-hidden shadow-xl ${
                isDarkMode ? "border-slate-800 bg-slate-700" : "border-white bg-gray-100"
              }`}
              style={{ backgroundColor: !logoUrl ? (community.color || '#8B5CF6') : undefined }}
            >
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={`${community.name} logo`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white text-xl font-bold">
                  {getInitials()}
                </span>
              )}
            </div>
          </div>

          {/* Name and Info */}
          <div className="pt-12 pl-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {community.name}
              </h2>
              {getRoleBadge()}
            </div>
            
            {community.description && (
              <p className={`text-sm mt-1 line-clamp-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                {community.description}
              </p>
            )}
            
            <div className={`flex items-center gap-4 mt-2 text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {memberCount} members
              </span>
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" />
                {channels.length} channels
              </span>
            </div>
          </div>
        </div>

        {/* Channels Section */}
        <div className={`border-t ${isDarkMode ? "border-slate-700/50" : "border-gray-200"}`}>
          <button
            onClick={() => setShowChannels(!showChannels)}
            className={`w-full px-4 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider transition-colors ${
              isDarkMode 
                ? "text-gray-400 hover:text-gray-300" 
                : "text-gray-600 hover:text-gray-700"
            }`}
          >
            <span>Text Channels</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showChannels ? "" : "-rotate-90"}`} />
          </button>
          
          {showChannels && (
            <div className="px-2 pb-2 space-y-0.5">
              {channels.filter(ch => ch.type === 'text').map(channel => (
                <button
                  key={channel.id}
                  onClick={() => onChannelSelect?.(channel)}
                  className={`w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-all ${
                    currentChannel?.id === channel.id
                      ? isDarkMode
                        ? "bg-slate-700 text-white"
                        : "bg-blue-50 text-blue-700"
                      : isDarkMode
                        ? "text-gray-400 hover:text-gray-200 hover:bg-slate-700/50"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <Hash className="w-4 h-4 flex-shrink-0 opacity-60" />
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Voice Channels Section */}
        {channels.some(ch => ch.type === 'voice') && (
          <div className={`border-t ${isDarkMode ? "border-slate-700/50" : "border-gray-200"}`}>
            <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}>
              Voice Channels
            </div>
            <div className="px-2 pb-2 space-y-0.5">
              {channels.filter(ch => ch.type === 'voice').map(channel => (
                <button
                  key={channel.id}
                  onClick={() => onChannelSelect?.(channel)}
                  className={`w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-all ${
                    currentChannel?.id === channel.id
                      ? isDarkMode
                        ? "bg-slate-700 text-white"
                        : "bg-blue-50 text-blue-700"
                      : isDarkMode
                        ? "text-gray-400 hover:text-gray-200 hover:bg-slate-700/50"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-lg">🎤</span>
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
    </>
  );
}
