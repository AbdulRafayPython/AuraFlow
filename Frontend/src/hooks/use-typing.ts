import { useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/chat-store';

export function useTyping(channelId: string, delay = 1000) {
  const typingTimeout = useRef<number>();
  const { setTyping } = useChatStore();

  const handleTyping = () => {
    if (typingTimeout.current) {
      window.clearTimeout(typingTimeout.current);
    }

    setTyping(channelId, true);

    typingTimeout.current = window.setTimeout(() => {
      setTyping(channelId, false);
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (typingTimeout.current) {
        window.clearTimeout(typingTimeout.current);
        setTyping(channelId, false);
      }
    };
  }, [channelId, setTyping]);

  return handleTyping;
}