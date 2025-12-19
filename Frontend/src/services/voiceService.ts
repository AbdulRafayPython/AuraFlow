import { socket } from "@/socket";

export interface VoiceUser {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_muted: boolean;
  is_deaf: boolean;
}

export interface VoiceMembersUpdate {
  channel_id: number;
  members: VoiceUser[];
  total_members: number;
}

class VoiceService {
  /**
   * Wait for socket to be connected
   */
  private waitForSocketConnection(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (socket.connected) {
        console.log("[VOICE SERVICE] Socket already connected");
        resolve();
        return;
      }

      console.log("[VOICE SERVICE] Waiting for socket connection...");
      console.log("[VOICE SERVICE] Socket ID:", socket.id);
      console.log("[VOICE SERVICE] Socket disconnected:", !socket.connected);
      
      const onConnect = () => {
        console.log("[VOICE SERVICE] Socket connected!");
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
        clearTimeout(timeoutId);
        resolve();
      };

      const onConnectError = (error: any) => {
        console.error("[VOICE SERVICE] Socket connection error:", error);
      };

      const timeoutId = setTimeout(() => {
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
        console.error("[VOICE SERVICE] Socket connection timeout after", timeout, "ms");
        reject(new Error("Socket connection timeout - unable to connect to server"));
      }, timeout);

      socket.on("connect", onConnect);
      socket.on("connect_error", onConnectError);
    });
  }

  /**
   * Join a voice channel and initialize audio stream
   */
  async joinVoiceChannel(channelId: number): Promise<void> {
    try {
      console.log(`[VOICE SERVICE] Joining channel ${channelId}`);
      
      // Wait for socket connection first
      await this.waitForSocketConnection();

      // Emit join event
      socket.emit("join_voice_channel", { channel_id: channelId });
      console.log("[VOICE SERVICE] Emitted join_voice_channel event");

      // Wait for response
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error("[VOICE SERVICE] Join timeout - no response received");
          socket.off("voice_members_update", onMembersUpdate);
          socket.off("voice_error", onError);
          reject(new Error("Join voice channel timeout - server did not respond within 20 seconds"));
        }, 20000);

        const onMembersUpdate = (data: any) => {
          clearTimeout(timeout);
          console.log("[VOICE SERVICE] Received voice_members_update:", data);
          socket.off("voice_members_update", onMembersUpdate);
          socket.off("voice_error", onError);
          resolve();
        };

        const onError = (data: { message: string }) => {
          clearTimeout(timeout);
          console.error("[VOICE SERVICE] Received voice_error:", data.message);
          socket.off("voice_members_update", onMembersUpdate);
          socket.off("voice_error", onError);
          reject(new Error(data.message));
        };

        socket.on("voice_members_update", onMembersUpdate);
        socket.on("voice_error", onError);
      });
    } catch (error) {
      console.error("[VOICE SERVICE] Join error:", error);
      throw error;
    }
  }

  /**
   * Leave a voice channel
   */
  leaveVoiceChannel(channelId: number): void {
    console.log(`[VOICE SERVICE] Leaving channel ${channelId}`);
    socket.emit("leave_voice_channel", { channel_id: channelId });
  }

  /**
   * Toggle microphone on/off
   */
  toggleMicrophone(channelId: number, isMuted: boolean): void {
    console.log(`[VOICE SERVICE] Setting muted=${isMuted}`);
    socket.emit("voice_state_changed", {
      channel_id: channelId,
      is_muted: isMuted,
      is_deaf: false,
    });
  }

  /**
   * Toggle deafen on/off
   */
  toggleDeafen(channelId: number, isDeaf: boolean, isMuted: boolean): void {
    console.log(`[VOICE SERVICE] Setting deafened=${isDeaf}`);
    socket.emit("voice_state_changed", {
      channel_id: channelId,
      is_muted: isMuted || isDeaf,
      is_deaf: isDeaf,
    });
  }

  /**
   * Get active members in a voice channel
   */
  getChannelMembers(channelId: number): Promise<VoiceUser[]> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[VOICE SERVICE] Fetching members for channel ${channelId}`);
        socket.emit("get_voice_channel_members", { channel_id: channelId });

        const timeout = setTimeout(() => {
          reject(new Error("Get members timeout"));
        }, 5000);

        socket.once("voice_channel_members", (data) => {
          clearTimeout(timeout);
          console.log("[VOICE SERVICE] Received members:", data.members);
          resolve(data.members || []);
        });

        socket.once("voice_error", (data: { message: string }) => {
          clearTimeout(timeout);
          reject(new Error(data.message));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send WebRTC offer to a peer
   */
  sendOffer(channelId: number, targetUser: string, offer: RTCSessionDescriptionInit): void {
    console.log(`[VOICE SERVICE] Sending offer to ${targetUser}`);
    socket.emit("send_offer", {
      channel_id: channelId,
      target_user: targetUser,
      offer: offer,
    });
  }

  /**
   * Send WebRTC answer to a peer
   */
  sendAnswer(channelId: number, targetUser: string, answer: RTCSessionDescriptionInit): void {
    console.log(`[VOICE SERVICE] Sending answer to ${targetUser}`);
    socket.emit("send_answer", {
      channel_id: channelId,
      target_user: targetUser,
      answer: answer,
    });
  }

  /**
   * Send ICE candidate to a peer
   */
  sendIceCandidate(channelId: number, targetUser: string, candidate: RTCIceCandidateInit): void {
    console.log(`[VOICE SERVICE] Sending ICE candidate to ${targetUser}`);
    socket.emit("send_ice_candidate", {
      channel_id: channelId,
      target_user: targetUser,
      candidate: candidate,
    });
  }

  /**
   * Request local microphone access
   */
  async requestMicrophoneAccess(): Promise<MediaStream> {
    try {
      console.log("[VOICE SERVICE] Requesting microphone access");
      
      // IMPORTANT: For testing on the same device with different browsers,
      // we DISABLE echo cancellation to allow audio to pass through.
      // In production with real devices, you'd want echoCancellation: true
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,  // ⚠️ Disabled for same-device testing
          noiseSuppression: false,   // ⚠️ Disabled for same-device testing
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });
      
      console.log("[VOICE SERVICE] ✅ Microphone access granted");
      console.log("[VOICE SERVICE] 🎤 Audio constraints applied:", {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      });
      
      // Log actual track settings
      stream.getAudioTracks().forEach((track) => {
        const settings = track.getSettings();
        console.log("[VOICE SERVICE] 🎤 Actual track settings:", settings);
      });
      
      return stream;
    } catch (error) {
      console.error("[VOICE SERVICE] Microphone access denied:", error);
      throw new Error("Microphone access denied. Please check browser permissions.");
    }
  }

  /**
   * Stop all audio tracks in a stream
   */
  stopAudioStream(stream: MediaStream): void {
    console.log("[VOICE SERVICE] Stopping audio stream");
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  /**
   * Listen to voice members updates
   */
  onMembersUpdate(callback: (data: VoiceMembersUpdate) => void): void {
    socket.on("voice_members_update", callback);
  }

  /**
   * Listen to user joined events
   */
  onUserJoined(
    callback: (data: {
      username: string;
      user_id: number;
      display_name: string;
      avatar_url?: string;
      channel_id: number;
      timestamp: string;
    }) => void
  ): void {
    socket.on("user_joined_voice", callback);
  }

  /**
   * Listen to user left events
   */
  onUserLeft(
    callback: (data: { username: string; channel_id: number; timestamp: string }) => void
  ): void {
    socket.on("user_left_voice", callback);
  }

  /**
   * Listen to voice state updates
   */
  onVoiceStateUpdate(
    callback: (data: {
      username: string;
      channel_id: number;
      is_muted: boolean;
      is_deaf: boolean;
      timestamp: string;
    }) => void
  ): void {
    socket.on("voice_state_update", callback);
  }

  /**
   * Listen to WebRTC offers
   */
  onReceiveOffer(
    callback: (data: { from: string; offer: RTCSessionDescriptionInit; channel_id: number }) => void
  ): void {
    socket.on("receive_offer", callback);
  }

  /**
   * Listen to WebRTC answers
   */
  onReceiveAnswer(
    callback: (data: { from: string; answer: RTCSessionDescriptionInit; channel_id: number }) => void
  ): void {
    socket.on("receive_answer", callback);
  }

  /**
   * Listen to ICE candidates
   */
  onReceiveIceCandidate(
    callback: (data: { from: string; candidate: RTCIceCandidateInit; channel_id: number }) => void
  ): void {
    socket.on("receive_ice_candidate", callback);
  }

  /**
   * Listen to voice errors
   */
  onVoiceError(callback: (data: { message: string }) => void): void {
    socket.on("voice_error", callback);
  }

  /**
   * Remove all voice-related event listeners
   */
  removeAllListeners(): void {
    socket.off("voice_members_update");
    socket.off("user_joined_voice");
    socket.off("user_left_voice");
    socket.off("voice_state_update");
    socket.off("receive_offer");
    socket.off("receive_answer");
    socket.off("receive_ice_candidate");
    socket.off("voice_error");
  }
}

export const voiceService = new VoiceService();
