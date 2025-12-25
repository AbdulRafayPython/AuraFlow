// Frontend/src/components/ModerationToast.tsx
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { socket } from '@/socket';

interface ModerationEvent {
  message_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  appeal_available?: boolean;
}

interface ModerationWarning {
  message_id: string;
  warning: string;
  reasons: string[];
}

export function ModerationToastListener() {
  const { toast } = useToast();

  useEffect(() => {
    // Handle message blocked events
    const handleMessageBlocked = (data: ModerationEvent) => {
      console.log('[MODERATION] Message blocked:', data);
      
      toast({
        title: "🛡️ Message Blocked",
        description: data.reason,
        variant: 'destructive',
        duration: 7000,
      });
    };

    // Handle moderation warnings
    const handleModerationWarning = (data: ModerationWarning) => {
      console.log('[MODERATION] Warning received:', data);
      
      toast({
        title: "⚠️ Content Warning",
        description: data.warning,
        variant: 'default',
        duration: 5000,
      });
    };

    // Handle moderation alerts (for moderators/admins)
    const handleModerationAlert = (data: any) => {
      console.log('[MODERATION] Alert received:', data);
      
      const actionText = data.action === 'blocked' ? 'Blocked' : 'Flagged';
      const description = `${actionText} message from ${data.username}\nReasons: ${data.reasons.join(', ')}\n\n${data.content.substring(0, 100)}${data.content.length > 100 ? '...' : ''}`;

      toast({
        title: "🚨 Moderation Alert",
        description: description,
        duration: 10000,
      });
    };

    socket.on('message_blocked', handleMessageBlocked);
    socket.on('moderation_warning', handleModerationWarning);
    socket.on('moderation_alert', handleModerationAlert);

    return () => {
      socket.off('message_blocked', handleMessageBlocked);
      socket.off('moderation_warning', handleModerationWarning);
      socket.off('moderation_alert', handleModerationAlert);
    };
  }, [toast]);

  return null; // This component only sets up listeners
}
