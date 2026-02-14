// contexts/CallContext.tsx — 1-to-1 Audio/Video Call state management
// Orchestrates signaling (socket) + media (WebRTC) + UI state

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { callWebrtcService, type CallMediaType } from '@/services/callWebrtcService';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────
export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'rejected' | 'ended' | 'failed';

export interface CallPeer {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface CallContextType {
  // State
  callState: CallState;
  callId: string | null;
  callType: CallMediaType;
  remotePeer: CallPeer | null;
  isCaller: boolean;
  // Media
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  // Duration
  callDuration: number;
  // Actions
  initiateCall: (callee: CallPeer, type: CallMediaType) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Helper to get the active socket from socketService
  const getSocket = useCallback(() => {
    const s = socketService.getSocket();
    if (!s) console.warn('[CALL] Socket not available');
    return s;
  }, []);

  // Core state
  const [callState, setCallState] = useState<CallState>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [callType, setCallType] = useState<CallMediaType>('audio');
  const [remotePeer, setRemotePeer] = useState<CallPeer | null>(null);
  const [isCaller, setIsCaller] = useState(false);

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // Duration
  const [callDuration, setCallDuration] = useState(0);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs to avoid stale closures in socket handlers
  const callIdRef = useRef(callId);
  const callStateRef = useRef(callState);

  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // ── Cleanup helper ─────────────────────────────────────────────────
  const resetCallState = useCallback(() => {
    callWebrtcService.cleanup();
    setLocalStream(null);
    setRemoteStream(null);
    setIsMicOn(true);
    setIsCameraOn(true);
    setCallDuration(0);
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
  }, []);

  const goIdle = useCallback((delay = 2000) => {
    // Release media devices IMMEDIATELY so they're available for the next call
    callWebrtcService.cleanup();
    setLocalStream(null);
    setRemoteStream(null);
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }

    // Delay only the UI state reset (so user sees "Call ended" briefly)
    setTimeout(() => {
      setCallState('idle');
      setCallId(null);
      setRemotePeer(null);
      setIsCaller(false);
      setIsMicOn(true);
      setIsCameraOn(true);
      setCallDuration(0);
    }, delay);
  }, []);

  // ── Start duration timer ──────────────────────────────────────────
  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    if (durationRef.current) clearInterval(durationRef.current);
    durationRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  // ── Setup WebRTC (shared between caller & callee) ─────────────────
  const setupWebRTC = useCallback(async (type: CallMediaType, currentCallId: string) => {
    callWebrtcService.createConnection();

    callWebrtcService.onRemoteStream = (stream) => {
      console.log('[CALL] Got remote stream');
      setRemoteStream(stream);
    };

    callWebrtcService.onIceCandidate = (candidate) => {
      getSocket()?.emit('call:ice-candidate', {
        callId: currentCallId,
        candidate: candidate.toJSON(),
      });
    };

    callWebrtcService.onConnectionStateChange = (state) => {
      console.log('[CALL] Connection state:', state);
      if (state === 'connected') {
        setCallState('connected');
        startDurationTimer();
      } else if (state === 'failed') {
        setCallState('failed');
        goIdle();
      }
    };

    const stream = await callWebrtcService.getLocalStream(type);
    setLocalStream(stream);
    setIsMicOn(true);
    // Check if we actually got video (may have fallen back to audio-only)
    const hasVideo = stream.getVideoTracks().length > 0;
    setIsCameraOn(hasVideo);
    if (type === 'video' && !hasVideo) {
      console.warn('[CALL] Video requested but only audio available (camera fallback)');
    }
    callWebrtcService.addLocalTracks();

    return stream;
  }, [startDurationTimer, goIdle]);

  // ── Initiate call (caller) ────────────────────────────────────────
  const initiateCall = useCallback((callee: CallPeer, type: CallMediaType) => {
    if (callStateRef.current !== 'idle') return;

    setCallState('calling');
    setCallType(type);
    setRemotePeer(callee);
    setIsCaller(true);

    getSocket()?.emit('call:initiate', {
      callee: callee.username,
      type,
    });
  }, [getSocket]);

  // ── Accept call (callee) ──────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!callIdRef.current || callStateRef.current !== 'ringing') return;

    const currentCallId = callIdRef.current;

    try {
      // Set up WebRTC FIRST (get media + create connection + add tracks)
      await setupWebRTC(callType, currentCallId);
      // THEN tell the caller we're ready — so their SDP offer arrives
      // after our peer connection exists and has tracks
      getSocket()?.emit('call:accept', { callId: currentCallId });
    } catch (err: any) {
      console.error('[CALL] Accept media error:', err);
      const reason = err?.message === 'INSECURE_CONTEXT'
        ? 'Camera/microphone access requires HTTPS.\n\nAccess the app via https:// or use localhost.'
        : err?.message === 'PERMISSION_DENIED'
          ? 'Camera/microphone permission was denied. Please allow access and try again.'
          : `Could not access camera/microphone: ${err?.message || 'Unknown error'}`;
      setCallState('failed');
      getSocket()?.emit('call:end', { callId: currentCallId });
      goIdle();
      setTimeout(() => alert(reason), 100);
    }
  }, [callType, setupWebRTC, goIdle, getSocket]);

  // ── Reject call ───────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (callIdRef.current) {
      getSocket()?.emit('call:reject', { callId: callIdRef.current });
    }
    setCallState('rejected');
    goIdle();
  }, [goIdle, getSocket]);

  // ── End call ──────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (callIdRef.current) {
      getSocket()?.emit('call:end', { callId: callIdRef.current });
    }
    setCallState('ended');
    goIdle();
  }, [goIdle, getSocket]);

  // ── Toggle mic / camera ───────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const enabled = callWebrtcService.toggleMic();
    setIsMicOn(enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const enabled = callWebrtcService.toggleCamera();
    setIsCameraOn(enabled);
  }, []);

  // Track socket availability so listeners re-register when socket connects
  const [socketReady, setSocketReady] = useState(!!socketService.getSocket()?.connected);

  useEffect(() => {
    const s = socketService.getSocket();
    if (s?.connected) {
      setSocketReady(true);
    }
    const onConnect = () => setSocketReady(true);
    const onDisconnect = () => setSocketReady(false);
    s?.on('connect', onConnect);
    s?.on('disconnect', onDisconnect);

    // Poll briefly in case socket connects after mount but before listeners
    const poll = setInterval(() => {
      const sock = socketService.getSocket();
      if (sock?.connected && !socketReady) {
        setSocketReady(true);
        sock.on('connect', onConnect);
        sock.on('disconnect', onDisconnect);
      }
    }, 500);

    return () => {
      clearInterval(poll);
      s?.off('connect', onConnect);
      s?.off('disconnect', onDisconnect);
    };
  }, []);

  // ── Socket event listeners ────────────────────────────────────────
  useEffect(() => {
    if (!socketReady) return;

    // Incoming call notification (callee side)
    const onRinging = (data: { callId: string; caller: CallPeer; type: CallMediaType }) => {
      if (callStateRef.current !== 'idle') {
        // Auto-reject if already in a call
        getSocket()?.emit('call:reject', { callId: data.callId });
        return;
      }
      setCallId(data.callId);
      setCallType(data.type);
      setRemotePeer(data.caller);
      setIsCaller(false);
      setCallState('ringing');
    };

    // Caller gets confirmation + callId
    const onInitiated = async (data: { callId: string; callee: CallPeer; type: CallMediaType }) => {
      setCallId(data.callId);
      // Caller hasn't set up WebRTC yet — do it now
      try {
        await setupWebRTC(data.type, data.callId);
      } catch (err: any) {
        console.error('[CALL] Caller media error:', err);
        // Show a user-visible alert so they know what went wrong
        const reason = err?.message === 'INSECURE_CONTEXT'
          ? 'Camera/microphone access requires HTTPS.\n\nAccess the app via https:// or use localhost.'
          : err?.message === 'PERMISSION_DENIED'
            ? 'Camera/microphone permission was denied. Please allow access and try again.'
            : `Could not access camera/microphone: ${err?.message || 'Unknown error'}`;
        // End (not reject) — this is a technical failure, not a user rejection
        setCallState('failed');
        getSocket()?.emit('call:end', { callId: data.callId });
        goIdle();
        // Alert after state cleanup so UI updates first
        setTimeout(() => alert(reason), 100);
      }
    };

    // Callee accepted — caller sends SDP offer
    const onAccepted = async (data: { callId: string }) => {
      if (data.callId !== callIdRef.current) return;
      try {
        const offer = await callWebrtcService.createOffer();
        getSocket()?.emit('call:sdp-offer', { callId: data.callId, sdp: offer });
      } catch (err) {
        console.error('[CALL] Create offer error:', err);
      }
    };

    // Callee/caller rejected
    const onRejected = (data: { callId: string; by: string }) => {
      if (data.callId !== callIdRef.current) return;
      setCallState('rejected');
      goIdle();
    };

    // Call ended by other party
    const onEnded = (data: { callId: string; by: string; reason?: string }) => {
      if (data.callId !== callIdRef.current) return;
      setCallState('ended');
      goIdle();
    };

    // SDP offer received (callee side)
    const onSdpOffer = async (data: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.callId !== callIdRef.current) return;
      try {
        const answer = await callWebrtcService.handleOffer(data.sdp);
        getSocket()?.emit('call:sdp-answer', { callId: data.callId, sdp: answer });
      } catch (err) {
        console.error('[CALL] Handle offer error:', err);
      }
    };

    // SDP answer received (caller side)
    const onSdpAnswer = async (data: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.callId !== callIdRef.current) return;
      try {
        await callWebrtcService.handleAnswer(data.sdp);
      } catch (err) {
        console.error('[CALL] Handle answer error:', err);
      }
    };

    // ICE candidate
    const onIce = async (data: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (data.callId !== callIdRef.current) return;
      try {
        await callWebrtcService.addIceCandidate(data.candidate);
      } catch (err) {
        console.warn('[CALL] ICE candidate error:', err);
      }
    };

    // Error
    const onError = (data: { message: string }) => {
      console.error('[CALL] Server error:', data.message);
      if (callStateRef.current === 'calling') {
        setCallState('failed');
        goIdle();
      }
    };

    const s = getSocket();
    if (!s) return;

    s.on('call:ringing', onRinging);
    s.on('call:initiated', onInitiated);
    s.on('call:accepted', onAccepted);
    s.on('call:rejected', onRejected);
    s.on('call:ended', onEnded);
    s.on('call:sdp-offer', onSdpOffer);
    s.on('call:sdp-answer', onSdpAnswer);
    s.on('call:ice-candidate', onIce);
    s.on('call:error', onError);

    return () => {
      s.off('call:ringing', onRinging);
      s.off('call:initiated', onInitiated);
      s.off('call:accepted', onAccepted);
      s.off('call:rejected', onRejected);
      s.off('call:ended', onEnded);
      s.off('call:sdp-offer', onSdpOffer);
      s.off('call:sdp-answer', onSdpAnswer);
      s.off('call:ice-candidate', onIce);
      s.off('call:error', onError);
    };
  }, [setupWebRTC, goIdle, getSocket, socketReady]);

  // ── Cleanup on unmount / tab close ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (callIdRef.current) {
        getSocket()?.emit('call:end', { callId: callIdRef.current });
      }
      callWebrtcService.cleanup();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  return (
    <CallContext.Provider value={{
      callState,
      callId,
      callType,
      remotePeer,
      isCaller,
      localStream,
      remoteStream,
      isMicOn,
      isCameraOn,
      callDuration,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMic,
      toggleCamera,
    }}>
      {children}
    </CallContext.Provider>
  );
}
