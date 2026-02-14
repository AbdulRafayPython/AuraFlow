import { socketService } from "@/services/socketService";
import type { Socket } from "socket.io-client";

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
   * Get the real socket from socketService (the one the backend tracks)
   */
  private getSocket(): Socket {
    const sock = socketService.getSocket();
    if (!sock) {
      throw new Error("Socket not available — socketService not connected");
    }
    return sock;
  }

  /**
   * Wait for socket to be connected
   */
  private waitForSocketConnection(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = socketService.getSocket();
      if (sock?.connected) {
        console.log("[VOICE SERVICE] Socket already connected, SID:", sock.id);
        resolve();
        return;
      }

      console.log("[VOICE SERVICE] Waiting for socket connection...");
      
      // Poll for socketService readiness
      const startTime = Date.now();
      const pollInterval = setInterval(() => {
        const s = socketService.getSocket();
        if (s?.connected) {
          clearInterval(pollInterval);
          console.log("[VOICE SERVICE] Socket connected! SID:", s.id);
          resolve();
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(pollInterval);
          console.error("[VOICE SERVICE] Socket connection timeout after", timeout, "ms");
          reject(new Error("Socket connection timeout - unable to connect to server"));
        }
      }, 200);
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

      const sock = this.getSocket();

      // Emit join event
      sock.emit("join_voice_channel", { channel_id: channelId });
      console.log("[VOICE SERVICE] Emitted join_voice_channel event via SID:", sock.id);

      // Wait for response
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error("[VOICE SERVICE] Join timeout - no response received");
          sock.off("voice_members_update", onMembersUpdate);
          sock.off("voice_error", onError);
          reject(new Error("Join voice channel timeout - server did not respond within 20 seconds"));
        }, 20000);

        const onMembersUpdate = (data: any) => {
          clearTimeout(timeout);
          console.log("[VOICE SERVICE] Received voice_members_update:", data);
          sock.off("voice_members_update", onMembersUpdate);
          sock.off("voice_error", onError);
          resolve();
        };

        const onError = (data: { message: string }) => {
          clearTimeout(timeout);
          console.error("[VOICE SERVICE] Received voice_error:", data.message);
          sock.off("voice_members_update", onMembersUpdate);
          sock.off("voice_error", onError);
          reject(new Error(data.message));
        };

        sock.on("voice_members_update", onMembersUpdate);
        sock.on("voice_error", onError);
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
    this.getSocket().emit("leave_voice_channel", { channel_id: channelId });
  }

  /**
   * Toggle microphone on/off
   */
  toggleMicrophone(channelId: number, isMuted: boolean): void {
    console.log(`[VOICE SERVICE] Setting muted=${isMuted}`);
    this.getSocket().emit("voice_state_changed", {
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
    this.getSocket().emit("voice_state_changed", {
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
        const sock = this.getSocket();
        console.log(`[VOICE SERVICE] Fetching members for channel ${channelId}`);
        sock.emit("get_voice_channel_members", { channel_id: channelId });

        const timeout = setTimeout(() => {
          reject(new Error("Get members timeout"));
        }, 5000);

        sock.once("voice_channel_members", (data) => {
          clearTimeout(timeout);
          console.log("[VOICE SERVICE] Received members:", data.members);
          resolve(data.members || []);
        });

        sock.once("voice_error", (data: { message: string }) => {
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
    this.getSocket().emit("send_offer", {
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
    this.getSocket().emit("send_answer", {
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
    this.getSocket().emit("send_ice_candidate", {
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
      
      // Audio constraints for voice chat
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });
      
      console.log("[VOICE SERVICE] ✅ Microphone access granted");
      console.log("[VOICE SERVICE] 🎤 Audio constraints applied:", {
        echoCancellation: true,
        noiseSuppression: true,
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
    socketService.getSocket()?.on("voice_members_update", callback);
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
    socketService.getSocket()?.on("user_joined_voice", callback);
  }

  /**
   * Listen to user left events
   */
  onUserLeft(
    callback: (data: { username: string; channel_id: number; timestamp: string }) => void
  ): void {
    socketService.getSocket()?.on("user_left_voice", callback);
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
    socketService.getSocket()?.on("voice_state_update", callback);
  }

  /**
   * Listen to WebRTC offers
   */
  onReceiveOffer(
    callback: (data: { from: string; offer: RTCSessionDescriptionInit; channel_id: number }) => void
  ): void {
    socketService.getSocket()?.on("receive_offer", callback);
  }

  /**
   * Listen to WebRTC answers
   */
  onReceiveAnswer(
    callback: (data: { from: string; answer: RTCSessionDescriptionInit; channel_id: number }) => void
  ): void {
    socketService.getSocket()?.on("receive_answer", callback);
  }

  /**
   * Listen to ICE candidates
   */
  onReceiveIceCandidate(
    callback: (data: { from: string; candidate: RTCIceCandidateInit; channel_id: number }) => void
  ): void {
    socketService.getSocket()?.on("receive_ice_candidate", callback);
  }

  /**
   * Listen to voice errors
   */
  onVoiceError(callback: (data: { message: string }) => void): void {
    socketService.getSocket()?.on("voice_error", callback);
  }

  /**
   * Emit speaking state to server
   */
  emitSpeaking(channelId: number, isSpeaking: boolean): void {
    socketService.getSocket()?.emit("voice:speaking", {
      channel_id: channelId,
      is_speaking: isSpeaking,
    });
  }

  /**
   * Listen for speaking state updates from other users
   */
  onSpeaking(callback: (data: { username: string; channel_id: number; is_speaking: boolean }) => void): void {
    socketService.getSocket()?.on("voice:speaking", callback);
  }

  /**
   * Request voice participants for sidebar cards
   */
  getVoiceParticipants(channelIds: number[]): void {
    socketService.getSocket()?.emit("get_voice_participants", { channel_ids: channelIds });
  }

  /**
   * Listen for voice participants update (sidebar)
   */
  onVoiceParticipantsUpdate(callback: (data: { channels: Record<string, { members: Array<{ id: number; username: string; display_name: string; avatar_url?: string }>; total: number }> }) => void): void {
    socketService.getSocket()?.on("voice_participants_update", callback);
  }

  /**
   * Remove all voice-related event listeners
   */
  removeAllListeners(): void {
    try {
      const sock = socketService.getSocket();
      if (!sock) return;
      sock.off("voice_members_update");
      sock.off("user_joined_voice");
      sock.off("user_left_voice");
      sock.off("voice_state_update");
      sock.off("receive_offer");
      sock.off("receive_answer");
      sock.off("receive_ice_candidate");
      sock.off("voice_error");
      sock.off("voice:speaking");
      sock.off("voice_participants_update");
    } catch {
      // Socket may not be available during cleanup
    }
  }
}

export const voiceService = new VoiceService();
