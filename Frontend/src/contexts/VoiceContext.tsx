import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { voiceService, VoiceUser } from "@/services/voiceService";
import { webrtcService } from "@/services/webrtcService";

interface VoiceContextType {
  isInVoiceChannel: boolean;
  currentVoiceChannel: number | null;
  voiceUsers: VoiceUser[];
  isAudioEnabled: boolean;
  isDeafened: boolean;
  localStream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  
  joinVoiceChannel: (channelId: number) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleAudio: () => Promise<void>;
  toggleDeaf: () => Promise<void>;
  muteUser: (userId: number) => void;
  unmuteUser: (userId: number) => void;
  getChannelMembers: (channelId: number) => Promise<VoiceUser[]>;
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
  const [isInVoiceChannel, setIsInVoiceChannel] = useState(false);
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<number | null>(null);
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);

  const joinVoiceChannel = useCallback(
    async (channelId: number) => {
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
        
        // Get current user info
        const currentUsername = localStorage.getItem("username");
        
        // Create peer connections for all existing members (excluding self)
        for (const member of members) {
          if (member.username !== currentUsername) {
            // IMPORTANT: Use username as the peer identifier
            const peerUsername = member.username;
            
            if (!webrtcService.hasPeerConnection(peerUsername)) {
              console.log(`[VOICE] 🔗 Creating peer connection for ${peerUsername}`);
              const pc = webrtcService.createPeerConnection(peerUsername, (candidate) => {
                // Send ICE candidate to remote peer
                voiceService.sendIceCandidate(channelId, peerUsername, candidate);
              });

              // Add local stream to peer connection
              if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks();
                console.log(`[VOICE] 🎵 Adding ${audioTracks.length} audio tracks to ${peerUsername}`);
                
                audioTracks.forEach((track, idx) => {
                  console.log(`[VOICE] 🎵 Track ${idx} before adding:`, {
                    id: track.id,
                    enabled: track.enabled,
                    readyState: track.readyState,
                  });
                  
                  const sender = pc.addTrack(track, localStreamRef.current!);
                  console.log(`[VOICE] ✅ Track ${idx} added to ${peerUsername}`);
                  
                  // Verify sender
                  console.log(`[VOICE] 📡 Sender details:`, {
                    trackId: sender.track?.id,
                    enabled: sender.track?.enabled,
                  });
                });
              }

              // Create and send offer
              try {
                console.log(`[VOICE] 📤 Creating offer for ${peerUsername}`);
                const offer = await webrtcService.createOffer(peerUsername);
                console.log(`[VOICE] 📤 Sending offer to ${peerUsername}`);
                voiceService.sendOffer(channelId, peerUsername, offer);
              } catch (error) {
                console.error(`[VOICE] ❌ Error creating offer for ${peerUsername}:`, error);
              }
            }
          }
        }

        setCurrentVoiceChannel(channelId);
        setIsInVoiceChannel(true);
        setVoiceUsers(members);

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
    []
  );

  const leaveVoiceChannel = useCallback(async () => {
    try {
      if (currentVoiceChannel) {
        console.log(`[VOICE] Leaving voice channel ${currentVoiceChannel}`);
        
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
        setIsInVoiceChannel(false);
        setVoiceUsers([]);
        setError(null);

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

  // Setup socket listeners
  useEffect(() => {
    console.log("[VOICE] Setting up socket listeners");

    voiceService.onMembersUpdate((data) => {
      console.log("[VOICE] 👥 Members updated:", data.members.length);
      const members = data.members.map((m) => ({
        ...m,
        is_muted: m.is_muted || false,
        is_deaf: m.is_deaf || false,
      }));
      setVoiceUsers(members);
    });

    voiceService.onUserJoined((data) => {
      console.log("[VOICE] 🆕 User joined:", data.username, "ID:", data.user_id);
      
      // Get current user ID
      const currentUserId = parseInt(localStorage.getItem("user_id") || "0");
      const newUserId = data.user_id;
      const peerUsername = data.username;
      
      console.log(`[VOICE] Current user ID: ${currentUserId}, New user ID: ${newUserId}`);
      
      // Collision detection: only the user with HIGHER ID sends offer
      const shouldSendOffer = currentUserId > newUserId;
      console.log(`[VOICE] Should send offer: ${shouldSendOffer} (current > new)`);
      
      if (!webrtcService.hasPeerConnection(peerUsername)) {
        console.log(`[VOICE] 🔗 Creating peer for new user ${peerUsername}`);
        
        const pc = webrtcService.createPeerConnection(peerUsername, (candidate) => {
          if (currentVoiceChannel) {
            voiceService.sendIceCandidate(currentVoiceChannel, peerUsername, candidate);
          }
        });

        // Add local stream to peer connection
        if (localStreamRef.current) {
          const audioTracks = localStreamRef.current.getAudioTracks();
          console.log(`[VOICE] 🎵 Adding ${audioTracks.length} tracks to new user ${peerUsername}`);
          
          audioTracks.forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        // Only send offer if we have higher ID (collision detection)
        if (shouldSendOffer) {
          (async () => {
            try {
              const offer = await webrtcService.createOffer(peerUsername);
              if (currentVoiceChannel) {
                voiceService.sendOffer(currentVoiceChannel, peerUsername, offer);
              }
            } catch (error) {
              console.error(`[VOICE] ❌ Error creating offer for ${peerUsername}:`, error);
            }
          })();
        } else {
          console.log(`[VOICE] ⏳ Waiting for offer from ${peerUsername} (they have higher ID)`);
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
    });

    voiceService.onUserLeft((data) => {
      console.log("[VOICE] 👋 User left:", data.username);
      setVoiceUsers((prev) => prev.filter((u) => u.username !== data.username));

      // Clean up peer connection using username
      webrtcService.closePeerConnection(data.username);
    });

    voiceService.onVoiceStateUpdate((data) => {
      console.log("[VOICE] 🔄 State update:", data.username);
      setVoiceUsers((prev) =>
        prev.map((user) =>
          user.username === data.username
            ? {
                ...user,
                is_muted: data.is_muted,
                is_deaf: data.is_deaf,
              }
            : user
        )
      );
    });

    voiceService.onVoiceError((data) => {
      console.error("[VOICE] ❌ Error:", data.message);
      setError(data.message);
    });

    // Listen for WebRTC signaling - FIXED: Use username as identifier
    voiceService.onReceiveOffer(async (data) => {
      console.log("[VOICE] 📥 Received offer from:", data.from);
      try {
        const peerUsername = data.from; // Use username as identifier
        
        // Create peer connection if doesn't exist
        if (!webrtcService.hasPeerConnection(peerUsername)) {
          console.log(`[VOICE] 🔗 Creating peer for offer from ${peerUsername}`);
          const pc = webrtcService.createPeerConnection(peerUsername, (candidate) => {
            if (currentVoiceChannel) {
              voiceService.sendIceCandidate(currentVoiceChannel, peerUsername, candidate);
            }
          });

          // Add local stream
          if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            console.log(`[VOICE] 🎵 Adding ${audioTracks.length} tracks for ${peerUsername}`);
            
            audioTracks.forEach((track) => {
              pc.addTrack(track, localStreamRef.current!);
            });
          }
        }

        // Handle offer and send answer
        console.log(`[VOICE] 📤 Creating answer for ${peerUsername}`);
        const answer = await webrtcService.handleOffer(peerUsername, data.offer);
        if (currentVoiceChannel) {
          console.log(`[VOICE] 📤 Sending answer to ${peerUsername}`);
          voiceService.sendAnswer(currentVoiceChannel, peerUsername, answer);
        }
      } catch (error) {
        console.error("[VOICE] ❌ Error handling offer:", error);
      }
    });

    voiceService.onReceiveAnswer(async (data) => {
      console.log("[VOICE] 📥 Received answer from:", data.from);
      try {
        const peerUsername = data.from;
        await webrtcService.handleAnswer(peerUsername, data.answer);
        console.log(`[VOICE] ✅ Answer handled from ${peerUsername}`);
      } catch (error) {
        console.error("[VOICE] ❌ Error handling answer:", error);
      }
    });

    voiceService.onReceiveIceCandidate(async (data) => {
      console.log("[VOICE] 📥 Received ICE from:", data.from);
      try {
        const peerUsername = data.from;
        await webrtcService.addIceCandidate(peerUsername, data.candidate);
      } catch (error) {
        console.error("[VOICE] ❌ Error adding ICE candidate:", error);
      }
    });

    return () => {
      voiceService.removeAllListeners();
    };
  }, [currentVoiceChannel]);

  const value: VoiceContextType = {
    isInVoiceChannel,
    currentVoiceChannel,
    voiceUsers,
    isAudioEnabled,
    isDeafened,
    localStream,
    isLoading,
    error,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleAudio,
    toggleDeaf,
    muteUser,
    unmuteUser,
    getChannelMembers,
  };

  return (
    <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
  );
};