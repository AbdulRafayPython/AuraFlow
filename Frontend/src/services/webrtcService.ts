/**
 * WebRTC Service - Handles peer connections and audio streaming
 * FIXED: Uses consistent username identifiers
 */

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Free TURN relay for NAT traversal (LAN & cross-network)
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  /**
   * Create a peer connection for a specific user (using username as identifier)
   */
  createPeerConnection(username: string, onIceCandidate: (candidate: RTCIceCandidate) => void): RTCPeerConnection {

    const peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        console.log(`[WebRTC] 🎵 Remote stream from ${username}:`, {
          id: remoteStream.id,
          audioTracks: remoteStream.getAudioTracks().length,
          videoTracks: remoteStream.getVideoTracks().length,
        });
        
        remoteStream.getAudioTracks().forEach((track, idx) => {
        });
        
        this.remoteStreams.set(username, remoteStream);
        this.playRemoteAudio(username, remoteStream);
      } else {
        console.warn(`[WebRTC] ⚠️ Track received but no streams for ${username}`);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      
      
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "disconnected" ||
        peerConnection.connectionState === "closed"
      ) {
        this.closePeerConnection(username);
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
    };

    // Handle signaling state
    peerConnection.onsignalingstatechange = () => {
    };

    this.peerConnections.set(username, peerConnection);
    return peerConnection;
  }

  /**
   * Create and send offer to a peer
   */
  async createOffer(username: string): Promise<RTCSessionDescriptionInit> {
    try {
      const peerConnection = this.peerConnections.get(username);
      if (!peerConnection) {
        throw new Error(`No peer connection for ${username}`);
      }

      
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await peerConnection.setLocalDescription(offer);
      
      return offer;
    } catch (error) {
      console.error(`[WebRTC] ❌ Error creating offer for ${username}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming offer and create answer
   */
  async handleOffer(username: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    try {
      const peerConnection = this.peerConnections.get(username);
      
      if (!peerConnection) {
        console.error(`[WebRTC] ❌ No peer connection for ${username}`);
        throw new Error(`No peer connection for ${username}`);
      }

      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Flush pending ICE candidates
      await this.flushPendingCandidates(username);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      return answer;
    } catch (error) {
      console.error(`[WebRTC] ❌ Error handling offer for ${username}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(username: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      const peerConnection = this.peerConnections.get(username);
      if (!peerConnection) {
        throw new Error(`No peer connection for ${username}`);
      }

      
      // If in stable state, it means we already have a remote description
      // This happens in collision scenarios - the connection is already established
      if (peerConnection.signalingState === "stable") {
        console.warn(`[WebRTC] ✅ Already in stable state for ${username} - connection already established, ignoring duplicate answer`);
        return;
      }
      
      // Only set remote description if we have a local offer pending
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Flush pending ICE candidates
        await this.flushPendingCandidates(username);
      } else {
        console.warn(`[WebRTC] ⚠️ Unexpected signaling state for ${username}: ${peerConnection.signalingState}, ignoring answer`);
      }
    } catch (error) {
      console.error(`[WebRTC] ❌ Error handling answer for ${username}:`, error);
      throw error;
    }
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(username: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const peerConnection = this.peerConnections.get(username);
      if (!peerConnection) {
        console.warn(`[WebRTC] ⚠️ No peer connection for ${username}, cannot add ICE candidate`);
        return;
      }

      // Queue if remote description not set yet
      if (!peerConnection.remoteDescription) {
        const pending = this.pendingCandidates.get(username) || [];
        pending.push(candidate);
        this.pendingCandidates.set(username, pending);
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`[WebRTC] ❌ Error adding ICE candidate for ${username}:`, error);
    }
  }

  /**
   * Flush queued ICE candidates after remote description is set
   */
  private async flushPendingCandidates(username: string): Promise<void> {
    const pending = this.pendingCandidates.get(username);
    if (!pending || pending.length === 0) return;
    
    const peerConnection = this.peerConnections.get(username);
    if (!peerConnection) return;
    
    for (const candidate of pending) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[WebRTC] ⚠️ Failed to add queued ICE candidate for ${username}:`, err);
      }
    }
    this.pendingCandidates.delete(username);
  }

  /**
   * Play remote audio
   */
  private playRemoteAudio(username: string, stream: MediaStream): void {

    // Remove existing audio element if it exists
    const existingElement = this.audioElements.get(username);
    if (existingElement) {
      existingElement.pause();
      existingElement.srcObject = null;
      if (document.body.contains(existingElement)) {
        document.body.removeChild(existingElement);
      }
    }

    // Create new audio element
    const audioElement = new Audio();
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    // audioElement.playsInline = true; // Important for mobile browsers
    audioElement.muted = false; // CRITICAL: Ensure not muted
    audioElement.style.display = "none";
    
    // Set volume to max
    audioElement.volume = 1.0;
    
    // CRITICAL: Disable echo cancellation for testing on same device
    stream.getAudioTracks().forEach((track) => {
      console.log(`[WebRTC] 🎵 Audio track settings for ${username}:`, track.getSettings());
      track.enabled = true; 
    });
    
    console.log(`[WebRTC] 🔊 Audio element created for ${username}:`, {
      streamId: stream.id,
      audioTracksCount: stream.getAudioTracks().length,
      autoplay: audioElement.autoplay,
      volume: audioElement.volume,
      muted: audioElement.muted,
    });
    
    // Add event listeners for debugging
    audioElement.onloadedmetadata = () => {
    };
    
    audioElement.oncanplay = () => {
    };
    
    audioElement.onplay = () => {
    };
    
    audioElement.onpause = () => {
    };
    
    audioElement.onerror = (e) => {
      console.error(`[WebRTC] ❌ Audio error for ${username}:`, e);
      console.error(`[WebRTC] ❌ Error code:`, audioElement.error?.code);
      console.error(`[WebRTC] ❌ Error message:`, audioElement.error?.message);
    };
    
    audioElement.onvolumechange = () => {
    };
    
    // Add to document
    document.body.appendChild(audioElement);
    
    // Store reference
    this.audioElements.set(username, audioElement);

    // Force immediate playback attempt
    const attemptPlay = () => {
      
      audioElement.play()
        .then(() => {
        })
        .catch((err) => {
          console.warn(`[WebRTC] ⚠️ Autoplay blocked for ${username}:`, err.message);
          
          // Try again on ANY user interaction
          const playOnInteraction = () => {
            audioElement.play()
              .then(() => {
                document.removeEventListener("click", playOnInteraction);
                document.removeEventListener("keydown", playOnInteraction);
                document.removeEventListener("touchstart", playOnInteraction);
              })
              .catch((interactionErr) => {
                console.error(`[WebRTC] ❌ Play failed even after interaction for ${username}:`, interactionErr);
              });
          };
          
          document.addEventListener("click", playOnInteraction);
          document.addEventListener("keydown", playOnInteraction);
          document.addEventListener("touchstart", playOnInteraction);
        });
    };

    // Small delay to ensure stream is ready
    setTimeout(attemptPlay, 100);
  }

  /**
   * Close peer connection for a user
   */
  closePeerConnection(username: string): void {

    const peerConnection = this.peerConnections.get(username);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(username);
    }

    this.pendingCandidates.delete(username);

    const audioElement = this.audioElements.get(username);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      if (document.body.contains(audioElement)) {
        document.body.removeChild(audioElement);
      }
      this.audioElements.delete(username);
    }

    this.remoteStreams.delete(username);
  }

  /**
   * Close all peer connections
   */
  closeAllConnections(): void {

    const usernames = Array.from(this.peerConnections.keys());
    usernames.forEach((username) => {
      this.closePeerConnection(username);
    });

    this.peerConnections.clear();
    this.audioElements.clear();
    this.remoteStreams.clear();
    this.pendingCandidates.clear();
    
  }

  /**
   * Get peer connection for a user
   */
  getPeerConnection(username: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(username);
  }

  /**
   * Check if peer connection exists
   */
  hasPeerConnection(username: string): boolean {
    return this.peerConnections.has(username);
  }
}

export const webrtcService = new WebRTCService();