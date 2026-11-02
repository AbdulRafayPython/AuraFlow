// REWRITE: ~1.3k lines; duplicates much of the channel chat view in pages/Dashboard.tsx.
// components/DirectMessageView.tsx - DM conversation view
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, MoreVertical, Trash2, Edit2, ArrowLeft, SmilePlus, Paperclip, Reply, Phone, Video, Sparkles, CircleUser } from 'lucide-react';
import AgentMessageShell from '@/components/ai-agents/AgentMessageShell';
import { methodLabel } from '@/components/ai-agents/humanize';
import { aiAgentService, type DMSummaryResult } from '@/services/aiAgentService';
import { useDirectMessages } from '@/contexts/DirectMessagesContext';
import { useFriends } from '@/contexts/FriendsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAvatarUrl } from '@/lib/utils';
import { useCall } from '@/contexts/CallContext';
import type { CallPeer } from '@/contexts/CallContext';
import EmojiPickerButton from '@/components/EmojiPickerButton';
import ReactionPicker from '@/components/ReactionPicker';
import MessageReactions from '@/components/MessageReactions';
import { MessageRow, DayDivider, RepliesLink } from '@/components/chat/MessageRow';
import { MessageToolbar } from '@/components/chat/MessageToolbar';
import { Composer } from '@/components/chat/Composer';
import { ThreadPane, type ThreadMessage } from '@/components/chat/ThreadPane';
import { useRightPane } from '@/components/app/RightPane';
import { startsGroup, startsNewDay, formatDayLabel, indexReplies } from '@/lib/messageGrouping';
import { getRecentEmoji, recordEmoji } from '@/lib/emoji';
import { reactionService } from '@/services/reactionService';
import { socket } from '@/socket';
import { socketService } from '@/services/socketService';
import FileAttachment from '@/components/chat/FileAttachment';
import FileUploadPreview from '@/components/chat/FileUploadPreview';
import ReplyPreview from '@/components/chat/ReplyPreview';
import ReplyBar from '@/components/chat/ReplyBar';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import CallMessageBubble from '@/components/chat/CallMessageBubble';
import TypingIndicator from '@/components/chat/TypingIndicator';
import JumpToLatest from '@/components/chat/JumpToLatest';
import { uploadService, validateFile, type UploadProgress } from '@/services/uploadService';
import { useToast } from '@/hooks/use-toast';
import UserProfilePopover from '@/components/profile/UserProfilePopover';
import { friendService } from '@/services/friendService';
import type { DirectMessage } from '@/types';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { usePresence } from '@/hooks/usePresence';
import { useMentionableAgents } from '@/hooks/useMentionableAgents';
import { useOpenAgent } from '@/components/ai-agents/AgentDetailPane';
import ProfilePane from '@/components/profile/ProfilePane';
import { PRESENCE_DOT } from '@/lib/presence';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DirectMessageViewProps {
  userId: number;
  username: string;
  displayName?: string;
  avatar?: string;
  onClose?: () => void;
}

export const DirectMessageView: React.FC<DirectMessageViewProps> = ({ userId, username, displayName, avatar, onClose }) => {
  const { conversations, messages, sendMessage, deleteMessage, editMessage, markAsRead, deliverUploadedMessage } = useDirectMessages();
  const { friends } = useFriends();
  const { user: currentUser } = useAuth();
  // An agent's bot user: no presence and no calls; it answers what you write by DM.
  const isBot = !!conversations.find((c) => c.user_id === userId)?.user.is_bot;
  const { isDarkMode } = useTheme();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const { open: openRightPane, close: closeRightPane, content: rightPaneContent } = useRightPane();
  const presence = usePresence()(username, userId);
  // Agent DMs open the agent's detail pane when it is one of the agents you can reach.
  const agentForDm = useMentionableAgents().find((a) => a.username === username);
  const openAgent = useOpenAgent();
  const profileKey = `profile-${userId}`;
  const profileOpen = rightPaneContent?.key === profileKey || (!!agentForDm && rightPaneContent?.key === `agent-${agentForDm.id}`);
  const toggleProfile = () => {
    if (profileOpen) return closeRightPane();
    if (isBot) {
      if (agentForDm) openAgent(agentForDm);
      return;
    }
    openRightPane({ key: profileKey, title: displayName || username, body: <ProfilePane username={username} userId={userId} /> });
  };
  const [threadParentId, setThreadParentId] = useState<number | null>(null);
  const [recentEmojiVersion, setRecentEmojiVersion] = useState(0);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [dmReactions, setDmReactions] = useState<Record<number, any[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessagesLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  // While true, keep the view pinned to the newest message (used to survive
  // async image/attachment loads that grow the list height after render).
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // Ephemeral DM summary state — mirrors the channel ``/summarize`` UX
  // from Dashboard.tsx but scoped to a single 1:1 thread. Result is only
  // ever shown to the requester (the backend route is requester-private),
  // dismissed on close, and rerendered fresh per request.
  const [dmSummary, setDmSummary] = useState<{
    content: string;
    method: string;
    message_count: number;
    created_at: string;
  } | null>(null);
  const [isGeneratingDmSummary, setIsGeneratingDmSummary] = useState(false);
  const [displayedDmSummaryText, setDisplayedDmSummaryText] = useState('');

  // Profile popover state
  const [profilePopover, setProfilePopover] = useState<{ username: string; rect: DOMRect | null } | null>(null);
  const handleProfileClick = useCallback((uname: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfilePopover({ username: uname, rect });
  }, []);

  // Call
  const { initiateCall, callState } = useCall();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calleePeer: CallPeer = {
    id: userId,
    username,
    display_name: displayName || username,
    avatar_url: avatar || null,
  };

  const handleAudioCall = useCallback(() => {
    if (callState !== 'idle') return;
    initiateCall(calleePeer, 'audio');
  }, [callState, initiateCall, calleePeer]);

  const handleVideoCall = useCallback(() => {
    if (callState !== 'idle') return;
    initiateCall(calleePeer, 'video');
  }, [callState, initiateCall, calleePeer]);

  // Get current user's actual ID
  const currentUserId = currentUser?.id;

  // Mark DM as read when this conversation is opened / focused
  useEffect(() => {
    if (userId) {
      socketService.markDMRead(userId);
    }
  }, [userId]);

  // Sound is handled centrally by NotificationsContext — no duplicate here

  // Subscribe to DM typing events from the other user
  useEffect(() => {
    const unsub = socketService.onDMTyping((data: { user_id: number; is_typing: boolean }) => {
      if (data.user_id === userId) {
        setIsOtherTyping(data.is_typing);
      }
    });
    return unsub;
  }, [userId]);

  // Emit typing status on input change
  const emitTyping = useCallback(() => {
    socketService.sendDMTyping(userId, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketService.sendDMTyping(userId, false);
    }, 2000);
  }, [userId]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const conversation = conversations.find(c => c.user_id === userId);
  // Sort messages chronologically with oldest first, newest last (bottom)
  const displayMessages = [...messages].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  
  // Enrich messages with sender and receiver data from friends or conversation user
  const enrichedMessages = displayMessages.map(msg => {
    if (msg.sender && msg.sender.display_name) {
      return msg;
    }
    
    // If sender data is missing, try to populate from friends or conversation
    let senderData = msg.sender;
    let receiverData = msg.receiver;
    
    if (!senderData) {
      if (msg.sender_id === currentUserId) {
        senderData = {
          id: currentUserId || 0,
          username: currentUser?.username || '',
          display_name: currentUser?.display_name || currentUser?.username || '',
          avatar_url: currentUser?.avatar_url || currentUser?.avatar
        };
      } else {
        // Try to find sender in friends
        const senderFriend = friends.find(f => f.id === msg.sender_id);
        senderData = senderFriend ? {
          id: senderFriend.id,
          username: senderFriend.username,
          display_name: senderFriend.display_name,
          avatar_url: senderFriend.avatar_url
        } : {
          id: msg.sender_id,
          username: 'Unknown',
          display_name: 'Unknown',
          avatar_url: undefined
        };
      }
    }
    
    if (!receiverData) {
      if (msg.receiver_id === currentUserId) {
        receiverData = {
          id: currentUserId || 0,
          username: currentUser?.username || '',
          display_name: currentUser?.display_name || currentUser?.username || '',
          avatar_url: currentUser?.avatar_url || currentUser?.avatar
        };
      } else {
        const receiverFriend = friends.find(f => f.id === msg.receiver_id);
        receiverData = receiverFriend ? {
          id: receiverFriend.id,
          username: receiverFriend.username,
          display_name: receiverFriend.display_name,
          avatar_url: receiverFriend.avatar_url
        } : {
          id: msg.receiver_id,
          username: 'Unknown',
          display_name: 'Unknown',
          avatar_url: undefined
        };
      }
    }
    
    const enrichedMsg = {
      ...msg,
      sender: senderData,
      receiver: receiverData
    };
    return enrichedMsg;
  });

  useEffect(() => {
    // Mark unread messages as read
    enrichedMessages.forEach(msg => {
      if (!msg.is_read && msg.receiver_id === currentUserId) {
        markAsRead(msg.id).catch(console.error);
      }
    });
  }, [enrichedMessages, currentUserId, markAsRead]);

  // Load reactions for all DMs — ONE bulk API call instead of N individual calls
  useEffect(() => {
    const loadReactions = async () => {
      if (enrichedMessages.length === 0) return;

      // Only fetch reactions for messages we haven't cached yet
      const newIds = enrichedMessages
        .map((m) => m.id)
        .filter((id) => !(id in dmReactions));

      if (newIds.length === 0) return;

      try {
        const bulk = await reactionService.getDMReactionsBulk(newIds);
        setDmReactions((prev) => ({ ...prev, ...bulk }));
      } catch (error) {
        console.error('Failed to bulk-load DM reactions:', error);
      }
    };

    loadReactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedMessages.length]); // Only depend on length, not full array

  // Socket.IO listener — single event carries full aggregation
  useEffect(() => {
    const handleDMReactionUpdate = (data: any) => {
      if (!data.dm_id) return;
      setDmReactions(prev => {
        const next = { ...prev };
        if (data.reactions && data.reactions.length > 0) {
          next[data.dm_id] = data.reactions;
        } else {
          delete next[data.dm_id];
        }
        return next;
      });
    };

    socket.on('dm_reaction_update', handleDMReactionUpdate);

    return () => {
      socket.off('dm_reaction_update', handleDMReactionUpdate);
    };
  }, []);

  // Close reaction picker and menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close reaction picker if clicking outside
      if (reactionPickerMessageId !== null && !target.closest('[data-reaction-picker]')) {
        setReactionPickerMessageId(null);
      }
      // Close menu if clicking outside
      if (menuOpen !== null && !target.closest('[data-message-menu]')) {
        setMenuOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reactionPickerMessageId, menuOpen]);

  // Reset initial-load flag when conversation changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesLengthRef.current = 0;
    stickToBottomRef.current = true;
  }, [userId]);

  // Keep the view pinned to the bottom while the conversation's images/videos
  // load in. scrollIntoView on first render fires BEFORE media has height, so
  // without this the view lands on old messages. We re-pin on each media load
  // until the user scrolls up (stickToBottomRef flips false in handleScroll).
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const pin = () => {
      if (stickToBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      }
    };
    const onMediaLoad = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'IMG' || el.tagName === 'VIDEO')) pin();
    };
    // 'load' doesn't bubble, so listen in the capture phase.
    container.addEventListener('load', onMediaLoad, true);
    return () => container.removeEventListener('load', onMediaLoad, true);
  }, [userId]);

  useEffect(() => {
    // Check if user is near bottom before auto-scrolling
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    const hasNewMessage = enrichedMessages.length > prevMessagesLengthRef.current;

    // Detect initial load for this conversation
    const isInitial = isInitialLoadRef.current && enrichedMessages.length > 0;
    if (isInitial) {
      isInitialLoadRef.current = false;
    }

    // Update the previous length
    prevMessagesLengthRef.current = enrichedMessages.length;

    if (isInitial) {
      // Jump to bottom on first load, then re-pin across the next few frames to
      // catch async layout shifts (images/attachments loading their height).
      const jump = () => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      jump();
      requestAnimationFrame(jump);
      setTimeout(jump, 150);
      setTimeout(jump, 450);
      setNewMessageCount(0);
    } else if (isNearBottom || (hasNewMessage && enrichedMessages.length > 0 && enrichedMessages[enrichedMessages.length - 1]?.sender_id === currentUserId)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setNewMessageCount(0);
    } else if (hasNewMessage && !isNearBottom) {
      // User scrolled up and a new message came in — increment counter
      setNewMessageCount(prev => prev + 1);
    }
  }, [enrichedMessages, currentUserId]);

  // Track scroll position to determine if we should auto-scroll
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
    // Stop auto-pinning once the user deliberately scrolls up.
    stickToBottomRef.current = isNearBottom;
    setShowJumpToLatest(!isNearBottom);
    if (isNearBottom) {
      setNewMessageCount(0);
    }
  };

  const handleJumpToLatest = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowJumpToLatest(false);
    setNewMessageCount(0);
  }, []);

  // Reply helpers
  const handleReply = (msg: DirectMessage) => {
    setReplyingTo(msg);
  };

  const scrollToMessage = (messageId: number) => {
    const el = document.getElementById(`dm-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-[hsl(var(--theme-accent-primary)/0.6)]', 'bg-[hsl(var(--theme-accent-primary)/0.08)]');
      setTimeout(() => {
        el.classList.remove('ring-1', 'ring-[hsl(var(--theme-accent-primary)/0.6)]', 'bg-[hsl(var(--theme-accent-primary)/0.08)]');
      }, 2000);
    }
  };

  /** Kick off a private DM summary — used by the header button and by
   *  the ``/summarize`` slash-intercept. Skeleton appears immediately;
   *  the result replaces it (or an error toast does). */
  const requestDmSummary = useCallback(async (messageCount = 100) => {
    if (isGeneratingDmSummary) return;
    setIsGeneratingDmSummary(true);
    setDmSummary(null);
    setDisplayedDmSummaryText('');
    try {
      const result: DMSummaryResult = await aiAgentService.summarizeDM(userId, messageCount);
      if (result.success) {
        setDmSummary({
          content: result.summary,
          method: result.method || 'extractive',
          message_count: result.message_count,
          created_at: new Date().toISOString(),
        });
      } else {
        toast({
          title: 'Could not summarize',
          description: result.error || 'Not enough messages to summarize yet.',
          variant: 'default',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Summary failed',
        description: err?.message || 'Could not generate DM summary.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingDmSummary(false);
    }
  }, [userId, isGeneratingDmSummary, toast]);

  // Scroll the skeleton/summary card into view as soon as it mounts so
  // the user doesn't have to hunt for it. Mirrors Dashboard.tsx:227.
  useEffect(() => {
    if ((isGeneratingDmSummary || dmSummary) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isGeneratingDmSummary, dmSummary]);

  // Typewriter effect for the summary body — matches the channel
  // ephemeral card. Skipped when prefers-reduced-motion is on (the
  // pulse is already gated via Tailwind ``motion-reduce`` elsewhere;
  // here we just reveal the full text instantly).
  useEffect(() => {
    if (!dmSummary) {
      setDisplayedDmSummaryText('');
      return;
    }
    const reduce = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplayedDmSummaryText(dmSummary.content);
      return;
    }
    const text = dmSummary.content;
    let i = 0;
    setDisplayedDmSummaryText('');
    const tick = () => {
      i = Math.min(text.length, i + 3);
      setDisplayedDmSummaryText(text.slice(0, i));
      if (i < text.length) timer = window.setTimeout(tick, 14);
    };
    let timer = window.setTimeout(tick, 14);
    return () => window.clearTimeout(timer);
  }, [dmSummary]);

  // Clear the ephemeral card when the user navigates to a different
  // DM — the result is requester-private and conversation-scoped.
  useEffect(() => {
    setDmSummary(null);
    setIsGeneratingDmSummary(false);
    setDisplayedDmSummaryText('');
  }, [userId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    // /summarize is intercepted client-side — it is not a real DM, just
    // a request for a private summary card. Mirrors Dashboard.tsx:736.
    const trimmed = message.trim();
    if (trimmed.toLowerCase().startsWith('/summarize') && !pendingFile) {
      const parts = trimmed.split(/\s+/);
      let count = 100;
      if (parts[1] && /^\d+$/.test(parts[1])) {
        count = Math.min(parseInt(parts[1], 10), 200);
      }
      setMessage('');
      setReplyingTo(null);
      void requestDmSummary(count);
      return;
    }

    // File upload flow
    if (pendingFile) {
      setUploadProgress(0);
      try {
        const uploaded = await uploadService.uploadDMFile(
          pendingFile,
          userId,
          message.trim() || undefined,
          (p: UploadProgress) => setUploadProgress(p.percent)
        );
        // Show it locally + broadcast to the receiver immediately (no reload).
        deliverUploadedMessage(uploaded as unknown as DirectMessage);
        setPendingFile(null);
        setMessage('');
      } catch (error: any) {
        console.error('DM file upload failed:', error);
        toast({
          title: 'Upload failed',
          description: error.message || 'Could not upload file.',
          variant: 'destructive',
        });
      } finally {
        setUploadProgress(null);
      }
      return;
    }

    if (!message.trim() || isSending) return;

    setIsSending(true);
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    try {
      await sendMessage(userId, message, replyToId);
      setMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const error = validateFile(file);
    if (error) {
      toast({ title: 'Invalid file', description: error, variant: 'destructive' });
      return;
    }
    setPendingFile(file);
  };

  const handleVoiceSend = async (audioBlob: Blob, duration: number) => {
    // Convert blob to file with proper extension
    const extension = audioBlob.type.includes('webm') ? 'webm' : 
                      audioBlob.type.includes('ogg') ? 'ogg' : 
                      audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    const fileName = `voice_message_${Date.now()}.${extension}`;
    const audioFile = new File([audioBlob], fileName, { type: audioBlob.type });

    setUploadProgress(0);
    try {
      const uploaded = await uploadService.uploadDMFile(
        audioFile,
        userId,
        undefined, // No caption for voice messages
        (p: UploadProgress) => setUploadProgress(p.percent),
        duration
      );
      // Show it locally + broadcast to the receiver immediately (no reload).
      deliverUploadedMessage(uploaded as unknown as DirectMessage);
      toast({ title: 'Voice message sent', description: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` });
    } catch (error: any) {
      console.error('Voice message upload failed:', error);
      toast({
        title: 'Failed to send voice message',
        description: error.message || 'Could not upload voice message.',
        variant: 'destructive',
      });
      throw error; // Re-throw so VoiceRecorder can handle it
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDelete = async (messageId: number) => {
    try {
      await deleteMessage(messageId);
      setMenuOpen(null);
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  const handleEdit = async (messageId: number) => {
    if (!editContent.trim()) return;
    try {
      await editMessage(messageId, editContent);
      setEditingId(null);
      setEditContent('');
      setMenuOpen(null);
    } catch (err) {
      console.error('Error editing message:', err);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleReactionToggle = async (dmId: number, emoji: string) => {
    recordEmoji(emoji);
    setRecentEmojiVersion((v) => v + 1);
    try {
      // Server returns full aggregated reactions — no follow-up GET needed
      const result = await reactionService.toggleDMReaction(dmId, emoji);

      if (result.reactions) {
        setDmReactions(prev => {
          const next = { ...prev };
          if (result.reactions!.length > 0) {
            next[dmId] = result.reactions!;
          } else {
            delete next[dmId];
          }
          return next;
        });
      }
    } catch (error: any) {
      if (error?.message === 'debounced') return;
      console.error('Failed to toggle DM reaction:', error);
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const shouldShowDateDivider = (current: DirectMessage, previous: DirectMessage | undefined) => {
    if (!previous) return true;
    const currentDate = formatDate(current.created_at);
    const previousDate = formatDate(previous.created_at);
    return currentDate !== previousDate;
  };

  // Check if consecutive messages are from the same user within 5 minutes
  const shouldShowAvatar = (current: DirectMessage, previous: DirectMessage | undefined) => {
    if (!previous) return true;
    if (current.sender_id !== previous.sender_id) return true;
    const timeDiff = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
    return timeDiff > 5 * 60 * 1000; // 5 minutes
  };

  const replyIndex = useMemo(() => indexReplies(enrichedMessages), [enrichedMessages]);
  const quickEmoji = useMemo(() => getRecentEmoji(3), [recentEmojiVersion]);

  const openThread = (id: number) => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setThreadParentId(id);
    } else {
      const first = replyIndex.get(id)?.[0];
      if (first) scrollToMessage(first);
    }
  };

  // Keep the right-pane thread in sync with the loaded messages.
  useEffect(() => {
    if (threadParentId == null) return;
    const parent = enrichedMessages.find((m) => m.id === threadParentId);
    if (!parent) return;
    const toThread = (m: DirectMessage): ThreadMessage => {
      const mine = m.sender_id === currentUserId;
      return {
        id: m.id,
        authorName: mine ? 'You' : (m.sender?.display_name || m.sender?.username || displayName || username),
        avatarUrl: mine ? (currentUser?.avatar_url || currentUser?.avatar) : m.sender?.avatar_url,
        username: mine ? currentUser?.username : m.sender?.username,
        timeLabel: formatTime(m.created_at),
        content: m.attachment ? String(m.content || '').replace(m.attachment.file_url, '').trim() : String(m.content || ''),
        attachmentName: m.attachment?.file_name,
      };
    };
    openRightPane({
      key: `dm-thread-${threadParentId}`,
      title: 'Thread',
      onClose: () => setThreadParentId(null),
      body: (
        <ThreadPane
          parent={toThread(parent)}
          replies={enrichedMessages.filter((m) => m.reply_to_preview?.id === threadParentId).map(toThread)}
          onReply={() => handleReply(parent)}
          onJump={scrollToMessage}
        />
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParentId, enrichedMessages]);

  // Switching conversation (or leaving) closes the thread.
  useEffect(() => {
    setThreadParentId(null);
    closeRightPane();
  }, [userId, closeRightPane]);
  useEffect(() => () => closeRightPane(), [closeRightPane]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[hsl(var(--theme-bg-primary))] transition-colors duration-300">
      {/* Header - Clean and Professional */}
      <header className="h-12 px-4 border-b flex-shrink-0 flex items-center gap-3 bg-[hsl(var(--theme-header-bg))] border-[hsl(var(--theme-border-default))] sticky top-0 z-40">
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-md transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3 flex-1">
          {isBot ? (
            <AgentLogo size="sm" avatarUrl={avatar} username={username} name={displayName} />
          ) : (
          <div className="relative">
            <img
              src={getAvatarUrl(avatar, username)}
              alt={displayName || username}
              className="w-8 h-8 rounded-full object-cover cursor-pointer"
              onClick={(e) => handleProfileClick(username, e)}
            />
            <span
              aria-label={presence}
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-[hsl(var(--theme-header-bg))] ${PRESENCE_DOT[presence]}`}
            />
          </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="flex items-center gap-1.5 text-base font-semibold truncate text-[hsl(var(--theme-text-primary))] leading-tight">
              {displayName || username}
              {isBot && (
                <span className="rounded bg-[hsl(var(--theme-bg-tertiary))] px-1 py-px text-xs font-semibold tracking-wide text-muted-foreground">
                  APP
                </span>
              )}
            </h2>
            {isBot ? (
              <p className="text-xs text-muted-foreground">Agent · messages only you can see</p>
            ) : (
            <p className={`text-xs ${presence === 'online' ? 'text-success' : 'text-muted-foreground'}`}>
              {{ online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline' }[presence]}
            </p>
            )}
          </div>

          {/* Header actions: Catch-me-up + call buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => requestDmSummary(100)}
              disabled={isGeneratingDmSummary}
              className="p-2 rounded-md transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--agent-accent-community))] disabled:opacity-30 disabled:cursor-not-allowed"
              title="Catch me up — summarize this conversation"
              aria-label="Summarize this conversation"
            >
              <Sparkles className="w-[18px] h-[18px]" />
            </button>
            {!isBot && (<>
            <button
              onClick={handleAudioCall}
              disabled={callState !== 'idle'}
              className="p-2 rounded-md transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-accent))] disabled:opacity-30 disabled:cursor-not-allowed"
              title="Audio Call"
            >
              <Phone className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={handleVideoCall}
              disabled={callState !== 'idle'}
              className="p-2 rounded-md transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-accent))] disabled:opacity-30 disabled:cursor-not-allowed"
              title="Video Call"
            >
              <Video className="w-[18px] h-[18px]" />
            </button>
            </>)}
            {(!isBot || agentForDm) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleProfile}
                    aria-pressed={profileOpen}
                    aria-label={profileOpen ? 'Hide profile' : 'Show profile'}
                    className={`hidden lg:flex p-2 rounded-md transition-colors duration-150 ${
                      profileOpen
                        ? 'bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-primary))]'
                        : 'text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]'
                    }`}
                  >
                    <CircleUser className="w-[18px] h-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{profileOpen ? 'Hide profile' : 'Show profile'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-label={`Conversation with ${displayName || username}`}
        className="flex-1 overflow-y-auto overflow-x-hidden py-4 relative"
      >
        {enrichedMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center">
                <Send className="w-6 h-6 text-[hsl(var(--theme-text-muted)/0.5)] -rotate-45" />
              </div>
              <div>
                <p className="text-base font-medium text-[hsl(var(--theme-text-secondary))]">No messages yet</p>
                <p className="text-sm mt-1 text-[hsl(var(--theme-text-muted))]">Say hello to {displayName || username}!</p>
              </div>
            </div>
          </div>
        ) : (
          enrichedMessages.map((msg, index) => {
            const prev = enrichedMessages[index - 1];
            const showDateDivider = startsNewDay(prev, msg);
            const grouped = !startsGroup(prev, msg);
            const isSent = msg.sender_id === currentUserId;
            const isFileMessage = !!msg.attachment && (msg.message_type === 'image' || msg.message_type === 'file' || msg.message_type === 'voice' || msg.message_type === 'video');
            const canEdit = isSent && !msg.attachment && msg.message_type !== 'image' && msg.message_type !== 'file' && msg.message_type !== 'voice' && msg.message_type !== 'video';
            const authorName = isSent ? 'You' : (msg.sender?.display_name || msg.sender?.username || 'Unknown');
            const authorUsername = isSent ? (currentUser?.username || 'You') : (msg.sender?.username || 'unknown');
            const authorAvatar = isSent ? (currentUser?.avatar_url || currentUser?.avatar) : msg.sender?.avatar_url;
            const replyCount = replyIndex.get(msg.id)?.length ?? 0;

            return (
              <div key={msg.id}>
                {showDateDivider && <DayDivider label={formatDayLabel(msg.created_at)} />}

                {/* Call log message */}
                {msg.message_type === 'call' ? (
                  <div id={`dm-msg-${msg.id}`} className="mt-3 flex px-4 py-1">
                    <CallMessageBubble
                      content={msg.content}
                      isSent={isSent}
                      createdAt={msg.created_at}
                    />
                  </div>
                ) : (
                  <MessageRow
                    domId={`dm-msg-${msg.id}`}
                    authorName={authorName}
                    avatarUrl={authorAvatar}
                    username={authorUsername}
                    timeLabel={formatTime(msg.created_at)}
                    shortTimeLabel={new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    grouped={grouped}
                    onAuthorClick={isSent ? undefined : (e) => handleProfileClick(authorUsername, e)}
                    reactions={
                      dmReactions[msg.id] && dmReactions[msg.id].length > 0 ? (
                        <MessageReactions
                          reactions={dmReactions[msg.id]}
                          onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                        />
                      ) : undefined
                    }
                    footer={replyCount > 0 ? <RepliesLink count={replyCount} onClick={() => openThread(msg.id)} /> : undefined}
                    toolbar={
                      editingId === msg.id ? undefined : (
                        <MessageToolbar
                          quickEmoji={quickEmoji}
                          onReact={(emoji) => handleReactionToggle(msg.id, emoji)}
                          onOpenPicker={() => setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id)}
                          actions={[
                            { key: 'reply', label: 'Reply', icon: Reply, onClick: () => handleReply(msg) },
                            ...(canEdit ? [{ key: 'edit', label: 'Edit message', icon: Edit2, onClick: () => { setEditingId(msg.id); setEditContent(msg.content); } }] : []),
                            ...(isSent ? [{ key: 'delete', label: 'Delete message', icon: Trash2, onClick: () => handleDelete(msg.id) }] : []),
                          ]}
                        />
                      )
                    }
                    overlay={
                      reactionPickerMessageId === msg.id ? (
                        <div data-reaction-picker className="absolute right-4 top-0 z-50">
                          <ReactionPicker
                            onReactionSelect={(emoji) => {
                              handleReactionToggle(msg.id, emoji);
                              setReactionPickerMessageId(null);
                            }}
                          />
                        </div>
                      ) : undefined
                    }
                  >
                    {editingId === msg.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleEdit(msg.id); }
                            if (e.key === 'Escape') { setEditingId(null); setEditContent(''); }
                          }}
                          aria-label="Edit message"
                          className="h-9 flex-1 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-3 text-base text-foreground focus:border-primary focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); setEditContent(''); }}
                          className="h-9 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(msg.id)}
                          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        {msg.reply_to_preview && (
                          <ReplyPreview
                            preview={msg.reply_to_preview}
                            onClick={() => scrollToMessage(msg.reply_to_preview!.id)}
                          />
                        )}
                        {isFileMessage ? (
                          <div className="w-fit max-w-md">
                            <FileAttachment
                              fileName={msg.attachment!.file_name}
                              fileUrl={msg.attachment!.file_url}
                              fileSize={msg.attachment!.file_size}
                              mimeType={msg.attachment!.mime_type}
                              uploaderName={authorName}
                              uploadedAt={msg.created_at}
                              duration={msg.attachment!.duration}
                            />
                            {msg.content && msg.content !== msg.attachment!.file_url && (
                              <p className="mt-1">{msg.content}</p>
                            )}
                          </div>
                        ) : (
                          <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(msg.content.trim()) ? 'text-4xl leading-tight' : ''}>
                            {msg.content}
                          </span>
                        )}
                        {msg.edited_at && (
                          <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
                        )}
                      </>
                    )}
                  </MessageRow>
                )}
              </div>
            );
          })
        )}
        {/* Typing indicator */}
        {isOtherTyping && (
          <TypingIndicator
            name={displayName || username}
            avatar={getAvatarUrl(avatar, username)}
          />
        )}

        {/* DM summary — skeleton while generating, ephemeral card on result.
            Only the requester sees this; nothing is persisted. */}
        {isGeneratingDmSummary && (
          <AgentMessageShell
            agentName="summarizer"
            isPrivate
            variant="skeleton"
            skeletonLabel="Generating summary"
          />
        )}
        {dmSummary && (
          <AgentMessageShell
            agentName="summarizer"
            isPrivate
            timestamp={formatTime(dmSummary.created_at)}
            onDismiss={() => { setDmSummary(null); setDisplayedDmSummaryText(''); }}
          >
            <div className="text-ui leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
              {displayedDmSummaryText}
              {displayedDmSummaryText.length < dmSummary.content.length && (
                <span
                  className="inline-block w-0.5 h-4 ml-0.5 align-middle"
                  style={{ backgroundColor: 'hsl(var(--agent-accent-community))' }}
                />
              )}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
              <span>Method: {methodLabel(dmSummary.method)}</span>
              <span>•</span>
              <span>{dmSummary.message_count} messages analyzed</span>
            </div>
          </AgentMessageShell>
        )}

        <div ref={messagesEndRef} />

        {/* Jump to latest button */}
        {showJumpToLatest && (
          <JumpToLatest
            onClick={handleJumpToLatest}
            unreadCount={newMessageCount}
          />
        )}
      </main>

      {/* Input Area */}
      <footer className="flex-shrink-0 bg-[hsl(var(--theme-bg-primary))]">
        {/* Reply Bar */}
        {replyingTo && (
          <ReplyBar
            message={replyingTo}
            authorName={
              replyingTo.sender_id === currentUserId
                ? (currentUser?.display_name || currentUser?.username || 'You')
                : (replyingTo.sender?.display_name || replyingTo.sender?.username || displayName || username)
            }
            onCancel={() => setReplyingTo(null)}
          />
        )}

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip,.rar,.7z"
        />

        {/* File Upload Preview */}
        {pendingFile && (
          <div className="px-4 pt-3">
            <FileUploadPreview
              file={pendingFile}
              uploadProgress={uploadProgress}
              onCancel={() => setPendingFile(null)}
            />
          </div>
        )}

        <div className="px-4 pb-4 pt-1">
          <Composer
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (e.target.value.trim()) emitTyping();
            }}
            onValueChange={setMessage}
            onSend={() => handleSend({ preventDefault() {} } as React.FormEvent)}
            canSend={message.trim().length > 0 || !!pendingFile}
            placeholder={`Message @${displayName || username}`}
            disabled={isSending}
            onAttach={isBot ? undefined : () => fileInputRef.current?.click()}
            inputProps={{
              onKeyPress: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as any);
                }
              },
            }}
            trailing={
              <>
                <EmojiPickerButton
                  onEmojiSelect={handleEmojiSelect}
                  pickerPosition="top"
                  disabled={isSending}
                />
                {!isBot && (
                  <VoiceRecorder
                    onSend={handleVoiceSend}
                    disabled={isSending}
                  />
                )}
              </>
            }
          />
          {isBot && (
            <p className="mt-1 px-1 text-xs text-muted-foreground">
              Only you see this conversation. {displayName || username} can look things up here but can't post for you.
            </p>
          )}
        </div>
      </footer>

      {/* Profile Popover */}
      {profilePopover && (
        <UserProfilePopover
          username={profilePopover.username}
          anchorRect={profilePopover.rect}
          onClose={() => setProfilePopover(null)}
          onSendDM={(userId) => {
            setProfilePopover(null);
            window.dispatchEvent(new CustomEvent('auraflow:open-dm', { detail: { userId } }));
          }}
          onAddFriend={async (userId) => {
            try {
              await friendService.sendFriendRequest(profilePopover.username);
              toast({ title: 'Friend request sent!' });
              setProfilePopover(null);
            } catch (err: any) {
              const msg = err.response?.data?.message || err.message || 'Failed to send request';
              toast({ title: 'Could not send request', description: msg, variant: 'destructive' });
            }
          }}
        />
      )}
    </div>
  );
};
