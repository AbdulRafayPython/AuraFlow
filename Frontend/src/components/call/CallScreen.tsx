// components/call/CallScreen.tsx — Premium in-call UI for audio & video
// Handles connected + ended + failed states

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2 } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { getAvatarUrl } from '@/lib/utils';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const CallScreen: React.FC = () => {
  const {
    callState, callType, remotePeer,
    localStream, remoteStream,
    isMicOn, isCameraOn,
    callDuration,
    endCall, toggleMic, toggleCamera,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [visible, setVisible] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate in
  useEffect(() => {
    if (callState === 'connected') {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [callState]);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  // Attach remote stream to video element
  // Depends on callState because the <video> element only mounts when callState === 'connected',
  // but remoteStream arrives during 'connecting' (via ontrack). Without callState dependency,
  // the effect runs when the video element doesn't exist yet and never re-runs.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // Ensure playback (handle autoplay policies)
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, callState]);

  // Auto-hide controls in video mode
  useEffect(() => {
    if (callType !== 'video') return;
    const resetTimer = () => {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    };
    resetTimer();
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [callType, callState]);

  // Only render for connected/ended/failed states
  if (!['connected', 'ended', 'failed'].includes(callState)) return null;
  if (!remotePeer) return null;

  const avatarUrl = getAvatarUrl(remotePeer.avatar_url, remotePeer.username);
  const isVideo = callType === 'video';
  const isActive = callState === 'connected';

  // ── Audio Call UI ─────────────────────────────────────────────────
  if (!isVideo) {
    return (
      <div
        className={`fixed inset-0 z-[200] flex flex-col items-center justify-center transition-all duration-500 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900" />

        {/* Subtle radial glow behind avatar */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative flex flex-col items-center gap-6">
          {/* Avatar with voice indicator */}
          <div className="relative">
            {isActive && (
              <>
                <div className="absolute inset-0 -m-4 rounded-full border-2 border-emerald-400/30 animate-[voicePulse_2.5s_ease-in-out_infinite]" />
                <div className="absolute inset-0 -m-8 rounded-full border border-emerald-400/15 animate-[voicePulse_2.5s_ease-in-out_infinite_0.5s]" />
              </>
            )}
            <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-white/10 shadow-2xl">
              <img src={avatarUrl} alt={remotePeer.display_name} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Name + status */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-white">{remotePeer.display_name}</h2>
            <p className="text-white/50 text-sm">@{remotePeer.username}</p>
          </div>

          {/* Duration / Status */}
          <div className="flex items-center gap-2">
            {isActive ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/80 text-lg font-mono tracking-wider">
                  {formatDuration(callDuration)}
                </span>
              </>
            ) : (
              <span className="text-white/50 text-base">
                {callState === 'ended' ? 'Call ended' : 'Call failed'}
              </span>
            )}
          </div>

          {/* Controls */}
          {isActive && (
            <div className="flex items-center gap-6 mt-8">
              {/* Mute */}
              <button
                onClick={toggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
                  isMicOn
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-red-500/90 hover:bg-red-400 text-white'
                }`}
              >
                {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </button>

              {/* End call */}
              <button
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <PhoneOff className="w-7 h-7 text-white" />
              </button>

              {/* Placeholder for symmetry */}
              <div className="w-14 h-14" />
            </div>
          )}
        </div>

        <style>{`
          @keyframes voicePulse {
            0%, 100% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.08); opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  // ── Video Call UI ─────────────────────────────────────────────────
  return (
    <div
      className={`fixed inset-0 z-[200] bg-black flex items-center justify-center transition-all duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseMove={() => setShowControls(true)}
    >
      {/* Remote video (full screen) */}
      {remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-white/10">
            <img src={avatarUrl} alt={remotePeer.display_name} className="w-full h-full object-cover" />
          </div>
          <p className="text-white/60 text-sm">Connecting video…</p>
        </div>
      )}

      {/* Local video preview (picture-in-picture corner) */}
      {localStream && (
        <div className="absolute top-6 right-6 w-40 h-28 sm:w-52 sm:h-36 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/10 z-10">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!isCameraOn ? 'hidden' : ''}`}
          />
          {!isCameraOn && (
            <div className="w-full h-full bg-slate-800 flex items-center justify-center">
              <VideoOff className="w-6 h-6 text-white/40" />
            </div>
          )}
        </div>
      )}

      {/* Top bar — name & duration */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white/20">
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">{remotePeer.display_name}</p>
            {isActive && (
              <p className="text-emerald-400/80 text-xs font-mono">{formatDuration(callDuration)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom control bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 pb-8 pt-6 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-center transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-5">
          {/* Mic toggle */}
          <button
            onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
              isMicOn
                ? 'bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm'
                : 'bg-red-500/90 hover:bg-red-400 text-white'
            }`}
            title={isMicOn ? 'Mute' : 'Unmute'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleCamera}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
              isCameraOn
                ? 'bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm'
                : 'bg-red-500/90 hover:bg-red-400 text-white'
            }`}
            title={isCameraOn ? 'Camera Off' : 'Camera On'}
          >
            {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* End call */}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/40 transition-all duration-200 hover:scale-110 active:scale-95"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Status overlay for ended/failed */}
      {!isActive && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
          <p className="text-white/70 text-xl font-medium">
            {callState === 'ended' ? 'Call ended' : 'Call failed'}
          </p>
        </div>
      )}
    </div>
  );
};

export default CallScreen;

/**
 * Always-mounted component that plays remote audio/video stream.
 * Must live outside CallScreen since CallScreen only renders when callState === 'connected',
 * but the remote stream arrives during 'connecting' (via ontrack) before state transitions.
 */
export const CallAudioRenderer: React.FC = () => {
  const { remoteStream, callState } = useCall();
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.play().catch(err => {
        console.warn('[CALL] Audio autoplay blocked, retrying:', err);
        // Retry on user interaction
        const retry = () => {
          audioRef.current?.play().catch(() => {});
          document.removeEventListener('click', retry);
        };
        document.addEventListener('click', retry, { once: true });
      });
    }
    // Cleanup: stop playback when stream is gone
    return () => {
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    };
  }, [remoteStream]);

  // Always rendered, hidden audio element
  if (callState === 'idle') return null;

  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
};
