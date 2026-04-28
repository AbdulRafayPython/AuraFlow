// components/DirectMessageView.tsx - DM conversation view
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MoreVertical, Trash2, Edit2, ArrowLeft, SmilePlus, Paperclip, Reply, Phone, Video } from 'lucide-react';
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

interface DirectMessageViewProps {
  userId: number;
  username: string;
  displayName?: string;
  avatar?: string;
  onClose?: () => void;
}

export const DirectMessageView: React.FC<DirectMessageViewProps> = ({ userId, username, displayName, avatar, onClose }) => {
  const { conversations, messages, sendMessage, deleteMessage, editMessage, markAsRead } = useDirectMessages();
  const { friends } = useFriends();
  const { user: currentUser } = useAuth();
  const { isDarkMode } = useTheme();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [dmReactions, setDmReactions] = useState<Record<number, any[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessagesLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

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
      // Jump instantly to bottom on first load
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    // File upload flow
    if (pendingFile) {
      setUploadProgress(0);
      try {
        await uploadService.uploadDMFile(
          pendingFile,
          userId,
          message.trim() || undefined,
          (p: UploadProgress) => setUploadProgress(p.percent)
        );
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
      await uploadService.uploadDMFile(
        audioFile,
        userId,
        undefined, // No caption for voice messages
        (p: UploadProgress) => setUploadProgress(p.percent),
        duration
      );
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
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[hsl(var(--theme-bg-primary))] transition-colors duration-300">
      {/* Header - Clean and Professional */}
      <header className="px-4 sm:px-6 py-3 border-b flex-shrink-0 flex items-center gap-3 bg-[hsl(var(--theme-header-bg)/0.85)] backdrop-blur-xl border-[hsl(var(--theme-border-default)/0.6)] transition-colors duration-300 sticky top-0 z-40">
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative">
            <img
              src={getAvatarUrl(avatar, username)}
              alt={displayName || username}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-[hsl(var(--theme-border-default)/0.5)] hover:ring-[hsl(var(--theme-accent-primary)/0.6)] transition-all duration-300 cursor-pointer"
              onClick={(e) => handleProfileClick(username, e)}
            />
            {/* Online status dot */}
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[hsl(var(--theme-bg-primary))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold truncate text-[hsl(var(--theme-text-primary))] leading-tight">
              {displayName || username}
            </h2>
            <p className="text-[11px] text-emerald-500 font-medium tracking-wide">
              Online
            </p>
          </div>

          {/* Call buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleAudioCall}
              disabled={callState !== 'idle'}
              className="p-2.5 rounded-xl transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))] disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
              title="Audio Call"
            >
              <Phone className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={handleVideoCall}
              disabled={callState !== 'idle'}
              className="p-2.5 rounded-xl transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))] disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
              title="Video Call"
            >
              <Video className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 relative"
      >
        {enrichedMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 animate-in fade-in duration-500">
              <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center">
                <Send className="w-6 h-6 text-[hsl(var(--theme-text-muted)/0.5)] -rotate-45" />
              </div>
              <div>
                <p className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">No messages yet</p>
                <p className="text-xs mt-1 text-[hsl(var(--theme-text-muted)/0.7)]">Say hello to {displayName || username}!</p>
              </div>
            </div>
          </div>
        ) : (
          enrichedMessages.map((msg, index) => {
            const showDateDivider = shouldShowDateDivider(msg, enrichedMessages[index - 1]);
            const showAvatar = shouldShowAvatar(msg, enrichedMessages[index - 1]);
            const isSent = msg.sender_id === currentUserId;

            return (
              <div key={msg.id} className={`${showAvatar ? 'mt-3' : 'mt-0.5'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                {showDateDivider && (
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[hsl(var(--theme-border-default)/0.6)] to-transparent" />
                    <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-[hsl(var(--theme-bg-secondary)/0.8)] text-[hsl(var(--theme-text-muted))] backdrop-blur-sm">
                      {formatDate(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[hsl(var(--theme-border-default)/0.6)] to-transparent" />
                  </div>
                )}

                {/* Call log message — centered bubble */}
                {msg.message_type === 'call' ? (
                  <div
                    id={`dm-msg-${msg.id}`}
                    className={`flex ${isSent ? 'justify-end' : 'justify-start'} px-2 py-1`}
                  >
                    <CallMessageBubble
                      content={msg.content}
                      isSent={isSent}
                      createdAt={msg.created_at}
                    />
                  </div>
                ) : !isSent ? (
                  <div 
                    id={`dm-msg-${msg.id}`}
                    className="flex gap-2.5 group px-2 py-0.5 rounded-lg transition-all duration-200 justify-start relative"
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div className="flex-shrink-0 self-end mb-1">
                      {showAvatar ? (
                        <img
                          src={getAvatarUrl(msg.sender?.avatar_url, msg.sender?.username || 'unknown')}
                          alt={msg.sender?.username || 'Unknown'}
                          className="w-8 h-8 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity ring-1 ring-[hsl(var(--theme-border-default)/0.3)]"
                          onClick={(e) => handleProfileClick(msg.sender?.username || 'unknown', e)}
                        />
                      ) : (
                        <div className="w-8 h-8" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0" style={{ maxWidth: '65%' }}>
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span
                            className="font-semibold text-[13px] text-[hsl(var(--theme-text-primary))] hover:underline cursor-pointer"
                            onClick={(e) => handleProfileClick(msg.sender?.username || 'unknown', e)}
                          >
                            {msg.sender?.display_name || msg.sender?.username || 'Unknown'}
                          </span>
                          <span className="text-[11px] text-[hsl(var(--theme-text-muted)/0.7)]">{formatTime(msg.created_at)}</span>
                        </div>
                      )}

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
                            className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-input-bg))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))]"
                            autoFocus
                          />
                          <button
                            onClick={() => handleEdit(msg.id)}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-3 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Reply-to preview (received) */}
                          {msg.reply_to_preview && (
                            <ReplyPreview
                              preview={msg.reply_to_preview}
                              onClick={() => scrollToMessage(msg.reply_to_preview!.id)}
                            />
                          )}
                          <div className="flex items-start gap-2">
                            {/* File attachment (received message) */}
                            {msg.attachment && (msg.message_type === 'image' || msg.message_type === 'file' || msg.message_type === 'voice' || msg.message_type === 'video') ? (
                              <div className="w-fit max-w-md">
                                <FileAttachment
                                  fileName={msg.attachment.file_name}
                                  fileUrl={msg.attachment.file_url}
                                  fileSize={msg.attachment.file_size}
                                  mimeType={msg.attachment.mime_type}
                                  uploaderName={displayName || username}
                                  uploadedAt={msg.created_at}
                                  duration={msg.attachment.duration}
                                />
                                {msg.content && msg.content !== msg.attachment.file_url && (
                                  <p className="text-sm mt-1 px-4 text-[hsl(var(--theme-text-primary))]">{msg.content}</p>
                                )}
                              </div>
                            ) : (
                            <p className={`text-sm leading-relaxed break-words px-4 py-2.5 w-fit text-[hsl(var(--theme-text-primary))] bg-[hsl(var(--theme-message-other))] transition-colors duration-200 ${showAvatar ? 'rounded-2xl rounded-tl-md' : 'rounded-2xl rounded-tl-md'}`}>
                              <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(msg.content.trim()) ? 'text-4xl leading-normal' : ''}>
                                {msg.content}
                              </span>
                              {!showAvatar && (
                                <span className="text-[10px] ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--theme-text-muted)/0.6)]">
                                  {formatTime(msg.created_at)}
                                </span>
                              )}
                            </p>
                            )}
                            {msg.edited_at && (
                              <span className="text-xs mt-3 text-[hsl(var(--theme-text-muted)/0.7)]">(edited)</span>
                            )}
                          </div>
                          
                          {/* Reactions Display */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 ml-0.5">
                            {dmReactions[msg.id] && dmReactions[msg.id].length > 0 && (
                              <MessageReactions
                                reactions={dmReactions[msg.id]}
                                onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                              />
                            )}
                            
                            {/* Add Reaction Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-300 px-1.5 py-0.5 rounded text-xs flex items-center gap-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                              title="Add reaction"
                            >
                              <SmilePlus className="w-3 h-3" />
                            </button>
                            {/* Reply Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReply(msg);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-300 px-1.5 py-0.5 rounded text-xs flex items-center gap-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                              title="Reply"
                            >
                              <Reply className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                      
                      {/* Reaction Picker - Shown when button clicked */}
                      {reactionPickerMessageId === msg.id && (
                        <div data-reaction-picker className="absolute left-10 mt-1 z-30 shadow-xl">
                          <ReactionPicker
                            onReactionSelect={(emoji) => {
                              handleReactionToggle(msg.id, emoji);
                              setReactionPickerMessageId(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Sender message (right) */
                  <div 
                    id={`dm-msg-${msg.id}`}
                    className="flex gap-2 group px-2 py-0.5 rounded-lg transition-all duration-200 justify-end relative"
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    {/* Message Menu — 3-dot */}
                    <div
                      data-message-menu
                      className="opacity-0 group-hover:opacity-100 transition-all duration-200 relative flex-shrink-0 flex items-center"
                    >
                      <button
                        onClick={() => setMenuOpen(menuOpen === msg.id ? null : msg.id)}
                        className="p-1.5 rounded-lg transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpen === msg.id && (
                        <div
                          data-message-menu
                          className="absolute right-0 top-full mt-1 w-36 rounded-xl shadow-lg z-30 border bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] overflow-hidden"
                        >
                          {/* Only show Edit for plain text messages */}
                          {(!msg.attachment && msg.message_type !== 'image' && msg.message_type !== 'file' && msg.message_type !== 'voice' && msg.message_type !== 'video') && (
                            <button
                              onClick={() => { setEditingId(msg.id); setEditContent(msg.content); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-all duration-200 text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 transition-all duration-200 border-t hover:bg-red-500/10 border-[hsl(var(--theme-border-default)/0.5)]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 text-right" style={{ maxWidth: '65%' }}>
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-1 justify-end">
                          <span className="text-[11px] text-[hsl(var(--theme-text-muted)/0.7)]">{formatTime(msg.created_at)}</span>
                          <span className="font-semibold text-[13px] text-[hsl(var(--theme-text-primary))]">
                            You
                          </span>
                        </div>
                      )}

                      {editingId === msg.id ? (
                        <div className="flex gap-2 justify-end">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); handleEdit(msg.id); }
                              if (e.key === 'Escape') { setEditingId(null); setEditContent(''); }
                            }}
                            className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-input-bg))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))]"
                            autoFocus
                          />
                          <button
                            onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-3 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleEdit(msg.id)}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Reply-to preview (sent) */}
                          {msg.reply_to_preview && (
                            <div className="flex justify-end">
                              <ReplyPreview
                                preview={msg.reply_to_preview}
                                variant="accent"
                                onClick={() => scrollToMessage(msg.reply_to_preview!.id)}
                              />
                            </div>
                          )}
                          <div className="flex items-start gap-2 justify-end">
                            {msg.edited_at && (
                              <span className="text-xs mt-3 text-[hsl(var(--theme-text-muted)/0.7)]">(edited)</span>
                            )}
                            {/* File attachment (sent message) */}
                            {msg.attachment && (msg.message_type === 'image' || msg.message_type === 'file' || msg.message_type === 'voice' || msg.message_type === 'video') ? (
                              <div className="w-fit max-w-md">
                                <FileAttachment
                                  fileName={msg.attachment.file_name}
                                  fileUrl={msg.attachment.file_url}
                                  fileSize={msg.attachment.file_size}
                                  mimeType={msg.attachment.mime_type}
                                  variant="accent"
                                  uploaderName={currentUser?.display_name || currentUser?.username || 'You'}
                                  uploadedAt={msg.created_at}
                                  duration={msg.attachment.duration}
                                />
                                {msg.content && msg.content !== msg.attachment.file_url && (
                                  <p className="text-sm mt-1 px-4 text-right text-[hsl(var(--theme-text-primary))]">{msg.content}</p>
                                )}
                              </div>
                            ) : (
                            <p className={`text-sm leading-relaxed break-words text-white bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] px-4 py-2.5 w-fit shadow-md hover:shadow-lg transition-all duration-200 ml-auto ${showAvatar ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tr-md'}`}>
                              <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(msg.content.trim()) ? 'text-4xl leading-normal' : ''}>
                                {msg.content}
                              </span>
                              {!showAvatar && (
                                <span className="text-[10px] ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-white/50">
                                  {formatTime(msg.created_at)}
                                </span>
                              )}
                            </p>
                            )}
                          </div>
                          
                          {/* Reactions Display */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 mr-1 justify-end">
                            {dmReactions[msg.id] && dmReactions[msg.id].length > 0 && (
                              <MessageReactions
                                reactions={dmReactions[msg.id]}
                                onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                              />
                            )}
                            
                            {/* Add Reaction Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-300 px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                              title="Add reaction"
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                            {/* Reply Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReply(msg);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-300 px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                              title="Reply"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                      
                      {/* Reaction Picker - Shown when button clicked */}
                      {reactionPickerMessageId === msg.id && (
                        <div data-reaction-picker className="absolute right-10 mt-1 z-30 shadow-xl">
                          <ReactionPicker
                            onReactionSelect={(emoji) => {
                              handleReactionToggle(msg.id, emoji);
                              setReactionPickerMessageId(null);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 self-end mb-1">
                      {showAvatar ? (
                        <img
                          src={getAvatarUrl(currentUser?.avatar_url || currentUser?.avatar, currentUser?.username || 'You')}
                          alt="You"
                          className="w-8 h-8 rounded-full object-cover ring-1 ring-[hsl(var(--theme-border-default)/0.3)]"
                        />
                      ) : (
                        <div className="w-8 h-8" />
                      )}
                    </div>
                  </div>
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
      <footer className="border-t backdrop-blur flex-shrink-0 bg-[hsl(var(--theme-bg-primary)/0.95)] border-[hsl(var(--theme-border-default)/0.4)] transition-colors duration-300">
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
          <div className="px-6 pt-3">
            <FileUploadPreview
              file={pendingFile}
              uploadProgress={uploadProgress}
              onCancel={() => setPendingFile(null)}
            />
          </div>
        )}

        <form onSubmit={handleSend} className="px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 border focus-within:border-[hsl(var(--theme-accent-primary)/0.6)] focus-within:ring-1 focus-within:ring-[hsl(var(--theme-accent-primary)/0.2)] transition-all duration-200 border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-input-bg))] hover:border-[hsl(var(--theme-border-hover)/0.7)]">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg transition-all duration-200 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-bg-hover))] active:scale-95"
              title="Attach a file"
            >
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
            <input
              type="text"
              placeholder={`Message @${displayName || username}`}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (e.target.value.trim()) emitTyping();
              }}
              disabled={isSending}
              className="flex-1 bg-transparent outline-none text-sm disabled:opacity-50 text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted)/0.5)]"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as any);
                }
              }}
            />
            <EmojiPickerButton
              onEmojiSelect={handleEmojiSelect}
              pickerPosition="top"
              disabled={isSending}
            />
            <VoiceRecorder
              onSend={handleVoiceSend}
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={(!message.trim() && !pendingFile) || isSending}
              className={`p-2 rounded-xl transition-all duration-200 flex-shrink-0 active:scale-95 ${
                message.trim() || pendingFile
                  ? 'text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-sm hover:shadow-md'
                  : 'text-[hsl(var(--theme-text-muted)/0.4)] cursor-not-allowed'
              }`}
              title="Send message (Enter)"
            >
              <Send className="w-[18px] h-[18px]" />
            </button>
          </div>
        </form>
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
