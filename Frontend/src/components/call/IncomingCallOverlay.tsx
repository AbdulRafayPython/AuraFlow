// components/call/IncomingCallOverlay.tsx — Premium incoming call notification
// Full-screen overlay with blur, animated ring pulse, elegant accept/reject

import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { getAvatarUrl } from '@/lib/utils';

const IncomingCallOverlay: React.FC = () => {
  const { callState, callType, remotePeer, acceptCall, rejectCall } = useCall();
  const [visible, setVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Animate in
  useEffect(() => {
    if (callState === 'ringing') {
      requestAnimationFrame(() => setVisible(true));
      // Play ringtone
      try {
        audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==');
        audioRef.current.loop = true;
        audioRef.current.volume = 0.4;
        audioRef.current.play().catch(() => {});
      } catch {}
    } else {
      setVisible(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [callState]);

  if (callState !== 'ringing' || !remotePeer) return null;

  const isVideo = callType === 'video';
  const avatarUrl = getAvatarUrl(remotePeer.avatar_url, remotePeer.username);

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center transition-all duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

      {/* Content */}
      <div
        className={`relative flex flex-col items-center gap-8 transition-all duration-300 ${
          visible ? 'translate-y-0 scale-100' : 'translate-y-8 scale-95'
        }`}
      >
        {/* Pulsing ring around avatar */}
        <div className="relative">
          {/* Outer pulse ring */}
          <div className="absolute inset-0 -m-6 rounded-full bg-emerald-500/20 animate-[callRingPulse_2s_ease-in-out_infinite]" />
          <div className="absolute inset-0 -m-3 rounded-full bg-emerald-500/10 animate-[callRingPulse_2s_ease-in-out_infinite_0.5s]" />

          {/* Avatar */}
          <div className="relative w-28 h-28 rounded-full ring-4 ring-white/20 shadow-2xl overflow-hidden">
            <img
              src={avatarUrl}
              alt={remotePeer.display_name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Call type badge */}
          <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg ring-4 ring-black/40">
            {isVideo ? (
              <Video className="w-4 h-4 text-white" />
            ) : (
              <Phone className="w-4 h-4 text-white" />
            )}
          </div>
        </div>

        {/* Caller info */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {remotePeer.display_name}
          </h2>
          <p className="text-white/60 text-sm font-medium">
            @{remotePeer.username}
          </p>
          <p className="text-white/80 text-base font-medium animate-pulse">
            Incoming {isVideo ? 'Video' : 'Audio'} Call…
          </p>
        </div>

        {/* Accept / Reject buttons */}
        <div className="flex items-center gap-12 mt-4">
          {/* Reject */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={rejectCall}
              className="group w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all duration-200 hover:scale-110 active:scale-95"
            >
              <PhoneOff className="w-7 h-7 text-white transition-transform duration-200 group-hover:rotate-[135deg]" />
            </button>
            <span className="text-white/60 text-xs font-medium">Decline</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={acceptCall}
              className="group w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:scale-110 active:scale-95 animate-[callBounce_1.5s_ease-in-out_infinite]"
            >
              {isVideo ? (
                <Video className="w-7 h-7 text-white" />
              ) : (
                <Phone className="w-7 h-7 text-white" />
              )}
            </button>
            <span className="text-white/60 text-xs font-medium">Accept</span>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes callRingPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.25); opacity: 0; }
        }
        @keyframes callBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
};

export default IncomingCallOverlay;
