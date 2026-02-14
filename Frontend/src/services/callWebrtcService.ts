// services/callWebrtcService.ts — WebRTC peer connection for 1-to-1 audio/video calls
// Separate from webrtcService.ts (voice channels, multi-user)

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // Free TURN relay for NAT traversal (LAN & cross-network)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export type CallMediaType = 'audio' | 'video';

class CallWebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  // Callbacks set by CallContext
  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onIceCandidate: ((candidate: RTCIceCandidate) => void) | null = null;
  onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;

  /** Create a new RTCPeerConnection */
  createConnection(): RTCPeerConnection {
    this.closeConnection();

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams[0] && this.onRemoteStream) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc?.iceConnectionState === 'failed') {
        console.warn('[CALL-RTC] ICE failed, restarting...');
        this.pc.restartIce();
      }
    };

    console.log('[CALL-RTC] Peer connection created');
    return this.pc;
  }

  /** Acquire local media (mic only or mic + camera) with retry and graceful fallback */
  async getLocalStream(type: CallMediaType): Promise<MediaStream> {
    // Secure-context guard: getUserMedia requires HTTPS or localhost
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const msg = `Camera/microphone access requires HTTPS.\n\n` +
        `You are on: ${window.location.origin}\n` +
        `Either access via https:// or open Chrome with:\n` +
        `chrome --unsafely-treat-insecure-origin-as-secure="${window.location.origin}"`;
      console.error('[CALL-RTC]', msg);
      throw new Error('INSECURE_CONTEXT');
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
    };

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(`[CALL-RTC] Got local ${type} stream:`, this.localStream.getTracks().map(t => `${t.kind}:${t.label}`));
        return this.localStream;
      } catch (err: any) {
        console.error(`[CALL-RTC] getUserMedia error (attempt ${attempt}/${maxRetries}):`, err.name, err.message);
        if (err.name === 'NotAllowedError') throw new Error('PERMISSION_DENIED');
        if (err.name === 'NotFoundError' && type === 'audio') throw new Error('DEVICE_NOT_FOUND');

        // For video calls: if camera fails, fall back to audio-only
        if (type === 'video' && (err.name === 'NotReadableError' || err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
          if (attempt < maxRetries) {
            console.log(`[CALL-RTC] Camera busy/unavailable, retrying in ${attempt * 500}ms...`);
            await new Promise(r => setTimeout(r, attempt * 500));
            continue;
          }
          // Final attempt failed — fall back to audio only
          console.warn('[CALL-RTC] Camera unavailable after retries, falling back to audio-only');
          try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            console.log('[CALL-RTC] Fallback: got audio-only stream');
            return this.localStream;
          } catch (audioErr: any) {
            console.error('[CALL-RTC] Audio fallback also failed:', audioErr);
            throw new Error('MEDIA_ERROR');
          }
        }

        // NotReadableError on audio = device busy; retry
        if (err.name === 'NotReadableError' && attempt < maxRetries) {
          console.log(`[CALL-RTC] Device busy, retrying in ${attempt * 500}ms...`);
          await new Promise(r => setTimeout(r, attempt * 500));
          continue;
        }
        throw new Error('MEDIA_ERROR');
      }
    }
    throw new Error('MEDIA_ERROR');
  }

  /** Add all local tracks to the peer connection */
  addLocalTracks() {
    if (!this.pc || !this.localStream) return;
    this.localStream.getTracks().forEach(track => {
      this.pc!.addTrack(track, this.localStream!);
    });
    console.log('[CALL-RTC] Added local tracks');
  }

  /** Create SDP offer (caller) */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('No peer connection');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);
    console.log('[CALL-RTC] Created offer');
    return offer;
  }

  /** Handle SDP offer (callee) — set remote, create answer */
  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('No peer connection');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    console.log('[CALL-RTC] Created answer');
    return answer;
  }

  /** Handle SDP answer (caller) */
  async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc) throw new Error('No peer connection');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushPendingCandidates();
    console.log('[CALL-RTC] Set remote answer');
  }

  /** Add ICE candidate (queue if remote description not set yet) */
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    if (this.pc.remoteDescription) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  private async flushPendingCandidates() {
    if (!this.pc) return;
    for (const c of this.pendingCandidates) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    this.pendingCandidates = [];
  }

  /** Toggle mic */
  toggleMic(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  /** Toggle camera */
  toggleCamera(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  isMicEnabled(): boolean { return this.localStream?.getAudioTracks()[0]?.enabled ?? false; }
  isCameraEnabled(): boolean { return this.localStream?.getVideoTracks()[0]?.enabled ?? false; }
  getLocalStreamRef(): MediaStream | null { return this.localStream; }

  /** Close connection only (keep callbacks) */
  closeConnection() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    console.log('[CALL-RTC] Connection closed');
  }

  /** Full cleanup */
  cleanup() {
    this.closeConnection();
    this.onRemoteStream = null;
    this.onIceCandidate = null;
    this.onConnectionStateChange = null;
    console.log('[CALL-RTC] Full cleanup done');
  }
}

export const callWebrtcService = new CallWebRTCService();
