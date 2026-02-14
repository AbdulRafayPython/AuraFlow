import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { voiceService, VoiceUser } from "@/services/voiceService";
import { webrtcService } from "@/services/webrtcService";
import { socketService } from "@/services/socketService";
import { useAuth } from "@/contexts/AuthContext";

interface VoiceContextType {
  isInVoiceChannel: boolean;
  currentVoiceChannel: number | null;
  currentVoiceChannelName: string | null;
  voiceUsers: VoiceUser[];
  isAudioEnabled: boolean;
  isDeafened: boolean;
  localStream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  speakingUsers: Set<string>;
  isVoiceRoomModalOpen: boolean;
  
  joinVoiceChannel: (channelId: number, channelName?: string) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleAudio: () => Promise<void>;
  toggleDeaf: () => Promise<void>;
  muteUser: (userId: number) => void;
  unmuteUser: (userId: number) => void;
  getChannelMembers: (channelId: number) => Promise<VoiceUser[]>;
  setVoiceRoomModalOpen: (open: boolean) => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useVoice must be used within VoiceProvider");
  }
  return context;
};

interface VoiceProviderProps {
  children: React.ReactNode;
}

export const VoiceProvider: React.FC<VoiceProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [isInVoiceChannel, setIsInVoiceChannel] = useState(false);
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<number | null>(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState<string | null>(null);
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [isVoiceRoomModalOpen, setVoiceRoomModalOpen] = useState(false);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentVoiceChannelRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingIntervalRef = useRef<number | null>(null);
  const wasSpeakingRef = useRef(false);

  // Keep ref in sync with state so socket closures always read current value
  useEffect(() => {
    currentVoiceChannelRef.current = currentVoiceChannel;
  }, [currentVoiceChannel]);

  // Track socket availability — same pattern as the working CallContext
  const [socketReady, setSocketReady] = useState(!!socketService.getSocket()?.connected);

  useEffect(() => {
    const s = socketService.getSocket();
    if (s?.connected) setSocketReady(true);
    const onConnect = () => setSocketReady(true);
    const onDisconnect = () => setSocketReady(false);
    s?.on("connect", onConnect);
    s?.on("disconnect", onDisconnect);

    // Poll briefly in case socket connects after mount but before listeners
    const poll = setInterval(() => {
      const sock = socketService.getSocket();
      if (sock?.connected && !socketReady) {
        setSocketReady(true);
        sock.on("connect", onConnect);
        sock.on("disconnect", onDisconnect);
      }
    }, 500);

    return () => {
      clearInterval(poll);
      s?.off("connect", onConnect);
      s?.off("disconnect", onDisconnect);
    };
  }, []);

  const joinVoiceChannel = useCallback(
    async (channelId: number, channelName?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        console.log(`[VOICE] Attempting to join voice channel ${channelId}`);
        
        // Request microphone access first
        console.log("[VOICE] Requesting microphone access");
        const stream = await voiceService.requestMicrophoneAccess();
        
        console.log("[VOICE] Microphone access granted");
        console.log("[VOICE] Audio tracks:", stream.getAudioTracks().length);
        
        // Log audio track status
        stream.getAudioTracks().forEach((track, idx) => {
          console.log(`[VOICE] 🎤 Track ${idx}:`, {
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted,
          });
        });
        
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Join via service
        console.log("[VOICE] Calling voiceService.joinVoiceChannel");
        await voiceService.joinVoiceChannel(channelId);

        // Fetch members and set up WebRTC connections
        const members = await voiceService.getChannelMembers(channelId);
        console.log(`[VOICE] Got ${members.length} members, setting up WebRTC`);
        
        // Get current user info from AuthContext
        const currentUsername = user?.username;
        const currentUserId = user?.id || 0;
        
        // Create peer connections for all existing members (excluding self)
        // COLLISION DETECTION: Only send offer if OUR ID is higher than the peer's.
        // The peer's onUserJoined handler uses the same rule, so exactly ONE side offers.
        for (const member of members) {
          if (member.username !== currentUsername) {
            // IMPORTANT: Use username as the peer identifier
            const peerUsername = member.username;
            const shouldSendOffer = currentUserId > member.id;
            
            if (!webrtcService.hasPeerConnection(peerUsername)) {
              console.log(`[VOICE] 🔗 Creating peer connection for ${peerUsername} (shouldSendOffer=${shouldSendOffer}, me=${currentUserId} vs them=${member.id})`);
              const pc = webrtcService.createPeerConnection(peerUsername, (candidate) => {
                // Send ICE candidate to remote peer
                voiceService.sendIceCandidate(channelId, peerUsername, candidate);
              });

              // Add local stream to peer connection
              if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks();
                console.log(`[VOICE] 🎵 Adding ${audioTracks.length} audio tracks to ${peerUsername}`);
                
                audioTracks.forEach((track, idx) => {
                  const sender = pc.addTrack(track, localStreamRef.current!);
                  console.log(`[VOICE] ✅ Track ${idx} added to ${peerUsername}`, {
                    enabled: track.enabled,
                    readyState: track.readyState,
                  });
                });
              }

              // Only create offer if our ID is higher (collision avoidance)
              if (shouldSendOffer) {
                try {
                  console.log(`[VOICE] 📤 Creating offer for ${peerUsername}`);
                  const offer = await webrtcService.createOffer(peerUsername);
                  console.log(`[VOICE] 📤 Sending offer to ${peerUsername}`);
                  voiceService.sendOffer(channelId, peerUsername, offer);
                } catch (error) {
                  console.error(`[VOICE] ❌ Error creating offer for ${peerUsername}:`, error);
                }
              } else {
                console.log(`[VOICE] ⏳ Waiting for offer from ${peerUsername} (they have higher ID: ${member.id} > ${currentUserId})`);
              }
            }
          }
        }

        setCurrentVoiceChannel(channelId);
        currentVoiceChannelRef.current = channelId; // Update ref immediately for socket closures
        setCurrentVoiceChannelName(channelName || null);
        setIsInVoiceChannel(true);
        setVoiceUsers(members);
        
        // Start speaking detection
        startSpeakingDetection(stream, channelId);

        console.log(`[VOICE] ✅ Successfully joined channel ${channelId}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to join voice channel";
        console.error("[VOICE] ❌ Join error:", errorMsg);
        setError(errorMsg);
        
        // Clean up on error
        if (localStreamRef.current) {
          voiceService.stopAudioStream(localStreamRef.current);
          localStreamRef.current = null;
          setLocalStream(null);
        }
        
        webrtcService.closeAllConnections();
        
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const leaveVoiceChannel = useCallback(async () => {
    try {
      if (currentVoiceChannel) {
        console.log(`[VOICE] Leaving voice channel ${currentVoiceChannel}`);
        
        // Stop speaking detection
        stopSpeakingDetection();
        
        // Close all peer connections
        webrtcService.closeAllConnections();

        // Stop audio stream
        if (localStreamRef.current) {
          voiceService.stopAudioStream(localStreamRef.current);
          localStreamRef.current = null;
          setLocalStream(null);
        }

        // Emit leave event
        voiceService.leaveVoiceChannel(currentVoiceChannel);

        setCurrentVoiceChannel(null);
        setCurrentVoiceChannelName(null);
        setIsInVoiceChannel(false);
        setVoiceUsers([]);
        setSpeakingUsers(new Set());
        setError(null);
        setVoiceRoomModalOpen(false);

        console.log("[VOICE] ✅ Left voice channel");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to leave voice channel";
      console.error("[VOICE] ❌ Leave error:", errorMsg);
      setError(errorMsg);
    }
  }, [currentVoiceChannel]);

  const toggleAudio = useCallback(async () => {
    try {
      if (localStreamRef.current && currentVoiceChannel) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        const newState = !isAudioEnabled;

        audioTracks.forEach((track) => {
          track.enabled = newState;
          console.log(`[VOICE] 🎤 Track ${track.id} enabled:`, newState);
        });

        setIsAudioEnabled(newState);
        voiceService.toggleMicrophone(currentVoiceChannel, !newState);

        console.log(`[VOICE] Audio ${newState ? "enabled" : "disabled"}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to toggle audio";
      console.error("[VOICE] ❌ Toggle audio error:", errorMsg);
      setError(errorMsg);
    }
  }, [isAudioEnabled, currentVoiceChannel]);

  const toggleDeaf = useCallback(async () => {
    try {
      if (currentVoiceChannel) {
        const newDeafState = !isDeafened;
        setIsDeafened(newDeafState);
        voiceService.toggleDeafen(currentVoiceChannel, newDeafState, !isAudioEnabled);

        console.log(`[VOICE] Deafened: ${newDeafState}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to toggle deafen";
      console.error("[VOICE] ❌ Toggle deafen error:", errorMsg);
      setError(errorMsg);
    }
  }, [isDeafened, isAudioEnabled, currentVoiceChannel]);

  const muteUser = useCallback((userId: number) => {
    setVoiceUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, is_muted: true } : user
      )
    );
  }, []);

  const unmuteUser = useCallback((userId: number) => {
    setVoiceUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, is_muted: false } : user
      )
    );
  }, []);

  const getChannelMembers = useCallback(
    async (channelId: number): Promise<VoiceUser[]> => {
      try {
        const members = await voiceService.getChannelMembers(channelId);
        setVoiceUsers(members);
        return members;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to get channel members";
        console.error("[VOICE] ❌ Get members error:", errorMsg);
        setError(errorMsg);
        return [];
      }
    },
    []
  );

  // Speaking detection via AudioContext/AnalyserNode
  const startSpeakingDetection = useCallback((stream: MediaStream, channelId: number) => {
    try {
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const SPEAKING_THRESHOLD = 15; // Adjust sensitivity
      
      speakingIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
        const isSpeaking = average > SPEAKING_THRESHOLD;
        
        if (isSpeaking !== wasSpeakingRef.current) {
          wasSpeakingRef.current = isSpeaking;
          const myUsername = user?.username;
          
          // Update local speaking state
          setSpeakingUsers(prev => {
            const next = new Set(prev);
            if (isSpeaking && myUsername) next.add(myUsername);
            else if (myUsername) next.delete(myUsername);
            return next;
          });
          
          // Emit to server
          voiceService.emitSpeaking(channelId, isSpeaking);
        }
      }, 100);
    } catch (err) {
      console.error("[VOICE] Speaking detection init error:", err);
    }
  }, []);

  const stopSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    wasSpeakingRef.current = false;
  }, []);

  // ── Socket event listeners — only register when socket is ready ──
  useEffect(() => {
    if (!socketReady) return;
    const sock = socketService.getSocket();
    if (!sock) return;

    const currentUsername = user?.username || null;
    const currentUserId = user?.id || 0;

    console.log("[VOICE] Setting up socket listeners (socketReady=true)");

    // ── Presence events ──

    const onMembersUpdate = (data: any) => {
      console.log("[VOICE] 👥 Members updated:", data.members?.length);
      const members = (data.members || []).map((m: any) => ({
        ...m,
        is_muted: m.is_muted || false,
        is_deaf: m.is_deaf || false,
      }));
      setVoiceUsers(members);
    };

    const onUserJoined = (data: any) => {
      const channelId = currentVoiceChannelRef.current;
      console.log("[VOICE] 🆕 User joined:", data.username, "ID:", data.user_id, "| my channel:", channelId);

      // Only set up WebRTC if WE are currently in a voice channel
      if (channelId && data.username !== currentUsername) {
        const peerUsername = data.username;
        const newUserId = data.user_id;

        // Collision detection: only the user with HIGHER ID sends offer
        const shouldSendOffer = currentUserId > newUserId;
        console.log(`[VOICE] Should send offer: ${shouldSendOffer} (${currentUserId} > ${newUserId})`);

        if (!webrtcService.hasPeerConnection(peerUsername)) {
          console.log(`[VOICE] 🔗 Creating peer for new user ${peerUsername}`);

          const pc = webrtcService.createPeerConnection(peerUsername, (candidate) => {
            const ch = currentVoiceChannelRef.current;
            if (ch) voiceService.sendIceCandidate(ch, peerUsername, candidate);
          });

          // Add local stream to peer connection
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
              pc.addTrack(track, localStreamRef.current!);
            });
            console.log(`[VOICE] 🎵 Added audio tracks to ${peerUsername}`);
          }

          if (shouldSendOffer) {
            (async () => {
              try {
                const offer = await webrtcService.createOffer(peerUsername);
                const ch = currentVoiceChannelRef.current;
                if (ch) voiceService.sendOffer(ch, peerUsername, offer);
              } catch (error) {
                console.error(`[VOICE] ❌ Error creating offer for ${peerUsername}:`, error);
              }
            })();
          } else {
            console.log(`[VOICE] ⏳ Waiting for offer from ${peerUsername} (they have higher ID)`);
          }
        }
      }

      setVoiceUsers((prev) => {
        if (!prev.some((u) => u.id === data.user_id)) {
          return [...prev, {
            id: data.user_id,
            username: data.username,
            display_name: data.display_name,
            avatar_url: data.avatar_url,
            is_muted: false,
            is_deaf: false,
          }];
        }
        return prev;
      });
    };

    const onUserLeft = (data: any) => {
      console.log("[VOICE] 👋 User left:", data.username);
      setVoiceUsers((prev) => prev.filter((u) => u.username !== data.username));
      webrtcService.closePeerConnection(data.username);
    };

    const onVoiceStateUpdate = (data: any) => {
      console.log("[VOICE] 🔄 State update:", data.username);
      setVoiceUsers((prev) =>
        prev.map((user) =>
          user.username === data.username
            ? { ...user, is_muted: data.is_muted, is_deaf: data.is_deaf }
            : user
        )
      );
    };

    const onVoiceError = (data: { message: string }) => {
      console.error("[VOICE] ❌ Error:", data.message);
      setError(data.message);
    };

    const onSpeaking = (data: { username: string; is_speaking: boolean }) => {
      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        if (data.is_speaking) next.add(data.username);
        else next.delete(data.username);
        return next;
      });
    };

    // ── WebRTC signaling events ──
    // CRITICAL: Filter by `target` field so we only process messages meant for us

    const onReceiveOffer = async (data: { from: string; offer: RTCSessionDescriptionInit; channel_id: number; target?: string }) => {
      // Ignore if not targeted at us
      if (data.target && data.target !== currentUsername) return;
      const channelId = currentVoiceChannelRef.current;
      if (!channelId) return;

      console.log("[VOICE] 📥 Received offer from:", data.from);
      try {
        const peerUsername = data.from;

        if (!webrtcService.hasPeerConnection(peerUsername)) {
          console.log(`[VOICE] 🔗 Creating peer for offer from ${peerUsername}`);
          const pc = webrtcService.createPeerConnection(peerUsername, (candidate) => {
            const ch = currentVoiceChannelRef.current;
            if (ch) voiceService.sendIceCandidate(ch, peerUsername, candidate);
          });

          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
              pc.addTrack(track, localStreamRef.current!);
            });
            console.log(`[VOICE] 🎵 Added audio tracks for ${peerUsername}`);
          }
        }

        const answer = await webrtcService.handleOffer(peerUsername, data.offer);
        console.log(`[VOICE] 📤 Sending answer to ${peerUsername}`);
        voiceService.sendAnswer(channelId, peerUsername, answer);
      } catch (error) {
        console.error("[VOICE] ❌ Error handling offer:", error);
      }
    };

    const onReceiveAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit; target?: string }) => {
      if (data.target && data.target !== currentUsername) return;
      console.log("[VOICE] 📥 Received answer from:", data.from);
      try {
        await webrtcService.handleAnswer(data.from, data.answer);
        console.log(`[VOICE] ✅ Answer handled from ${data.from}`);
      } catch (error) {
        console.error("[VOICE] ❌ Error handling answer:", error);
      }
    };

    const onReceiveIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit; target?: string }) => {
      if (data.target && data.target !== currentUsername) return;
      try {
        await webrtcService.addIceCandidate(data.from, data.candidate);
      } catch (error) {
        console.error("[VOICE] ❌ Error adding ICE candidate:", error);
      }
    };

    // Register all listeners directly on the socket
    sock.on("voice_members_update", onMembersUpdate);
    sock.on("user_joined_voice", onUserJoined);
    sock.on("user_left_voice", onUserLeft);
    sock.on("voice_state_update", onVoiceStateUpdate);
    sock.on("voice_error", onVoiceError);
    sock.on("voice:speaking", onSpeaking);
    sock.on("receive_offer", onReceiveOffer);
    sock.on("receive_answer", onReceiveAnswer);
    sock.on("receive_ice_candidate", onReceiveIceCandidate);

    return () => {
      sock.off("voice_members_update", onMembersUpdate);
      sock.off("user_joined_voice", onUserJoined);
      sock.off("user_left_voice", onUserLeft);
      sock.off("voice_state_update", onVoiceStateUpdate);
      sock.off("voice_error", onVoiceError);
      sock.off("voice:speaking", onSpeaking);
      sock.off("receive_offer", onReceiveOffer);
      sock.off("receive_answer", onReceiveAnswer);
      sock.off("receive_ice_candidate", onReceiveIceCandidate);
    };
  }, [socketReady, user]);

  // ── Cleanup on tab close / refresh ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      const ch = currentVoiceChannelRef.current;
      if (ch) {
        socketService.getSocket()?.emit("leave_voice_channel", { channel_id: ch });
      }
      webrtcService.closeAllConnections();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const value: VoiceContextType = {
    isInVoiceChannel,
    currentVoiceChannel,
    currentVoiceChannelName,
    voiceUsers,
    isAudioEnabled,
    isDeafened,
    localStream,
    isLoading,
    error,
    speakingUsers,
    isVoiceRoomModalOpen,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleAudio,
    toggleDeaf,
    muteUser,
    unmuteUser,
    getChannelMembers,
    setVoiceRoomModalOpen,
  };

  return (
    <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
  );
};