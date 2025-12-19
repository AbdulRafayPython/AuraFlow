import { useVoice } from "@/contexts/VoiceContext";
import { useCallback } from "react";
import { socket } from "@/socket";

export const useVoiceChannel = () => {
  const voice = useVoice();

  const sendOffer = useCallback(
    async (
      targetUser: string,
      peerConnection: RTCPeerConnection
    ): Promise<void> => {
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("send_offer", {
          channel_id: voice.currentVoiceChannel,
          target_user: targetUser,
          offer: offer,
        });

        console.log("[VOICE_HOOK] Offer sent to", targetUser);
      } catch (error) {
        console.error("[VOICE_HOOK] Error sending offer:", error);
        throw error;
      }
    },
    [voice.currentVoiceChannel]
  );

  const sendAnswer = useCallback(
    async (
      targetUser: string,
      peerConnection: RTCPeerConnection
    ): Promise<void> => {
      try {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("send_answer", {
          channel_id: voice.currentVoiceChannel,
          target_user: targetUser,
          answer: answer,
        });

        console.log("[VOICE_HOOK] Answer sent to", targetUser);
      } catch (error) {
        console.error("[VOICE_HOOK] Error sending answer:", error);
        throw error;
      }
    },
    [voice.currentVoiceChannel]
  );

  const sendIceCandidate = useCallback(
    (
      targetUser: string,
      candidate: RTCIceCandidate
    ): void => {
      socket.emit("send_ice_candidate", {
        channel_id: voice.currentVoiceChannel,
        target_user: targetUser,
        candidate: candidate,
      });
    },
    [voice.currentVoiceChannel]
  );

  return {
    ...voice,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
  };
};
