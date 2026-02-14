// components/call/OutgoingCallOverlay.tsx — "Calling…" / "Ringing…" overlay for the caller
// Shows while waiting for the callee to accept/reject

import React, { useEffect, useState } from 'react';
import { PhoneOff, Phone, Video } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { getAvatarUrl } from '@/lib/utils';

const OutgoingCallOverlay: React.FC = () => {
  const { callState, callType, remotePeer, endCall } = useCall();
  const [visible, setVisible] = useState(false);
  const [dots, setDots] = useState('');

  // Animate in
  useEffect(() => {
    if (callState === 'calling') {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [callState]);

  // Animated dots
  useEffect(() => {
    if (callState !== 'calling') return;
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [callState]);

  if (callState !== 'calling' || !remotePeer) return null;

  const isVideo = callType === 'video';
  const avatarUrl = getAvatarUrl(remotePeer.avatar_url, remotePeer.username);

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center transition-all duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

      {/* Content */}
      <div
        className={`relative flex flex-col items-center gap-8 transition-all duration-300 ${
          visible ? 'translate-y-0 scale-100' : 'translate-y-8 scale-95'
        }`}
      >
        {/* Avatar with subtle pulse */}
        <div className="relative">
          <div className="absolute inset-0 -m-4 rounded-full bg-blue-500/15 animate-ping" style={{ animationDuration: '2s' }} />

          <div className="relative w-28 h-28 rounded-full ring-4 ring-white/15 shadow-2xl overflow-hidden">
            <img
              src={avatarUrl}
              alt={remotePeer.display_name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center shadow-lg ring-4 ring-black/40">
            {isVideo ? <Video className="w-4 h-4 text-white" /> : <Phone className="w-4 h-4 text-white" />}
          </div>
        </div>

        {/* Info */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {remotePeer.display_name}
          </h2>
          <p className="text-white/60 text-sm font-medium">@{remotePeer.username}</p>
          <p className="text-white/70 text-base font-medium">
            Calling{dots}
          </p>
        </div>

        {/* Cancel button */}
        <div className="flex flex-col items-center gap-2 mt-4">
          <button
            onClick={endCall}
            className="group w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all duration-200 hover:scale-110 active:scale-95"
          >
            <PhoneOff className="w-7 h-7 text-white transition-transform duration-200 group-hover:rotate-[135deg]" />
          </button>
          <span className="text-white/60 text-xs font-medium">Cancel</span>
        </div>
      </div>
    </div>
  );
};

export default OutgoingCallOverlay;
