// pages/Dashboard.tsx - Professional Real-time Version with Theme Support
import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Settings, Hash, Paperclip, Smile, Bot, Sun, Moon, Send, Wifi, WifiOff, Plus, Mic, SmilePlus, X, Palette, Reply, Pin, Radio } from "lucide-react";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useVoice } from "@/contexts/VoiceContext";
import { getAvatarUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import EmojiPickerButton from "@/components/EmojiPickerButton";
import ReactionPicker from "@/components/ReactionPicker";
import MessageReactions from "@/components/MessageReactions";
import { ModerationBadge } from "@/components/ModerationBadge";
import NotificationButton from "@/components/NotificationButton";
import { reactionService } from "@/services/reactionService";
import { socket } from "@/socket";
import { SocketDebugPanel } from "@/components/SocketDebugPanel";
import FileAttachment from "@/components/chat/FileAttachment";
import FileUploadPreview from "@/components/chat/FileUploadPreview";
import ReplyPreview from "@/components/chat/ReplyPreview";
import ReplyBar from "@/components/chat/ReplyBar";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import { uploadService, validateFile, type UploadProgress } from "@/services/uploadService";
import SearchModal from "@/components/search/SearchModal";
import UserProfilePopover from "@/components/profile/UserProfilePopover";
import PinnedMessagesPanel from "@/components/pins/PinnedMessagesPanel";
import { pinService } from "@/services/pinService";
import { statusService } from "@/services/statusService";
import { friendService } from "@/services/friendService";
import type { Message } from "@/types";
import type { SearchResult } from "@/services/searchService";

interface DashboardProps {
}

export default function Dashboard({}: DashboardProps) {
  const { isDarkMode, toggleTheme, currentTheme, setTheme, themes } = useTheme();
  const {
    isConnected,
    currentChannel,
    currentCommunity,
    channels,
    messages,
    sendMessage,
    sendTyping,
    typingUsers,
    isLoadingMessages,
    loadMoreMessages,
    selectChannel,
  } = useRealtime();

  const { isInVoiceChannel } = useVoice();
  const { toast } = useToast();
  const [showAIPanel, setShowAIPanel] = useState(true);

  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showVoiceChannel, setShowVoiceChannel] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<number, any[]>>({});
  const [commandResult, setCommandResult] = useState<{ type: string; success: boolean; summary?: string; key_points?: string[]; method?: string; error?: string } | null>(null);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // --- Search, Pins, Profile, Unread state ---
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinnedCount, setPinnedCount] = useState(0);
  const [profilePopover, setProfilePopover] = useState<{ username: string; rect: DOMRect | null } | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});

  // Available commands
  const availableCommands = [
    { command: '/summarize', description: 'Summarize last 20 messages', usage: '/summarize [count]' },
    { command: '/help', description: 'Show available commands', usage: '/help' },
  ];

  // Log messages for debugging blocked users
  useEffect(() => {
    console.log('[DASHBOARD] Total messages:', messages.length);
    const blockedMessages = messages.filter(m => m.is_blocked);
    if (blockedMessages.length > 0) {
      console.log('[DASHBOARD] Found blocked messages:', blockedMessages.map(m => ({
        id: m.id,
        author: m.author,
        is_blocked: m.is_blocked
      })));
    }
  }, [messages]);

  // Focus input when channel changes
  useEffect(() => {
    if (currentChannel && inputRef.current) {
      inputRef.current.focus();
    }
    setReplyingTo(null);
  }, [currentChannel]);

  // Refocus input after sending completes
  useEffect(() => {
    if (!isSending && currentChannel && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSending, currentChannel]);

  // Scroll to bottom when messages are first loaded or updated
  useEffect(() => {
    if (messages.length > 0 && messagesContainerRef.current) {
      // Scroll to bottom to show latest messages
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages.length, currentChannel?.id]);

  // Load reactions for messages — ONE bulk API call instead of N individual calls
  useEffect(() => {
    const loadReactions = async () => {
      if (messages.length === 0) return;

      // Only fetch reactions for messages we haven't cached yet
      const newIds = messages
        .map((m) => m.id)
        .filter((id) => !(id in messageReactions));

      if (newIds.length === 0) return;

      try {
        const bulk = await reactionService.getMessageReactionsBulk(newIds);
        setMessageReactions((prev) => ({ ...prev, ...bulk }));
      } catch (error) {
        console.error('Failed to bulk-load reactions:', error);
      }
    };

    if (messages.length > 0) {
      loadReactions();
    }
  }, [messages.length]); // Only depend on length, not full array

  // Socket.IO reaction listener — single event carries full aggregation
  useEffect(() => {
    const handleReactionUpdate = (data: any) => {
      if (!data.message_id || !data.reactions) return;
      setMessageReactions(prev => {
        const next = { ...prev };
        if (data.reactions.length > 0) {
          next[data.message_id] = data.reactions;
        } else {
          delete next[data.message_id];
        }
        return next;
      });
    };

    socket.on('message_reaction_update', handleReactionUpdate);

    return () => {
      socket.off('message_reaction_update', handleReactionUpdate);
    };
  }, []);

  // Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionPickerMessageId !== null) {
        const target = e.target as HTMLElement;
        // Check if click is outside the reaction picker
        if (!target.closest('[data-reaction-picker]')) {
          setReactionPickerMessageId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reactionPickerMessageId]);

  // Listen for AI command results
  useEffect(() => {
    const handleCommandResult = (event: CustomEvent) => {
      const data = event.detail;
      console.log('[DASHBOARD] ✅ AI Command result received from custom event:', data);
      
      setCommandResult(data);
      
      // Only show toast for errors (success is shown in floating card)
      if (!data.success) {
        console.log('[DASHBOARD] ⚠️ Showing error toast');
        toast({
          title: '❌ Command Failed',
          description: data.error || 'Failed to execute command.',
          variant: 'destructive',
          duration: 5000,
        });
      }
      
      // Auto-clear after 30 seconds
      setTimeout(() => setCommandResult(null), 30000);
    };

    console.log('[DASHBOARD] 📡 Setting up ai_command_result event listener');
    window.addEventListener('ai_command_result', handleCommandResult as EventListener);

    return () => {
      console.log('[DASHBOARD] 🔌 Removing ai_command_result event listener');
      window.removeEventListener('ai_command_result', handleCommandResult as EventListener);
    };
  }, [toast]);

  // --- Fetch pinned count when channel changes ---
  useEffect(() => {
    if (!currentChannel) return;
    let cancelled = false;
    pinService.getPinnedMessages(currentChannel.id).then(data => {
      if (!cancelled) setPinnedCount(data.count);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentChannel?.id]);

  // --- Fetch unread counts on mount ---
  useEffect(() => {
    statusService.getUnreadCounts().then(data => {
      const map: Record<number, number> = {};
      Object.entries(data).forEach(([chId, info]) => {
        map[Number(chId)] = (info as any).unread_count || 0;
      });
      setUnreadCounts(map);
    }).catch(() => {});
  }, []);

  // --- Mark channel as read when switching ---
  useEffect(() => {
    if (!currentChannel || messages.length === 0) return;
    const lastMsgId = messages[messages.length - 1]?.id;
    if (!lastMsgId) return;
    statusService.markChannelRead(currentChannel.id, lastMsgId).then(() => {
      setUnreadCounts(prev => ({ ...prev, [currentChannel.id]: 0 }));
    }).catch(() => {});
  }, [currentChannel?.id, messages.length]);

  // --- Socket listeners for pins ---
  useEffect(() => {
    const handlePinned = (data: any) => {
      if (data.channel_id === currentChannel?.id) {
        setPinnedCount(prev => prev + 1);
      }
    };
    const handleUnpinned = (data: any) => {
      if (data.channel_id === currentChannel?.id) {
        setPinnedCount(prev => Math.max(0, prev - 1));
      }
    };
    socket.on('message_pinned', handlePinned);
    socket.on('message_unpinned', handleUnpinned);
    return () => {
      socket.off('message_pinned', handlePinned);
      socket.off('message_unpinned', handleUnpinned);
    };
  }, [currentChannel?.id]);

  // --- Ctrl+K global search shortcut ---
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // --- Handlers for search, pins, profile ---
  const handleSearchNavigate = useCallback((result: SearchResult) => {
    setSearchOpen(false);

    const tryScrollToMessage = (messageId: number, retriesLeft = 20) => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-1', 'ring-[hsl(var(--theme-accent-primary)/0.6)]', 'bg-[hsl(var(--theme-accent-primary)/0.08)]');
        setTimeout(() => {
          el.classList.remove('ring-1', 'ring-[hsl(var(--theme-accent-primary)/0.6)]', 'bg-[hsl(var(--theme-accent-primary)/0.08)]');
        }, 2500);
        return;
      }
      if (retriesLeft > 0) {
        setTimeout(() => tryScrollToMessage(messageId, retriesLeft - 1), 150);
      } else {
        // Message not in current batch — show toast with info
        toast({
          title: 'Message not in view',
          description: `This message is older than the currently loaded messages. Channel: #${result.channel_name || 'channel'}`,
        });
      }
    };

    if (result.type === 'channel' && result.channel_id) {
      if (result.channel_id !== currentChannel?.id) {
        selectChannel(result.channel_id);
        // Wait for channel switch + message load, then scroll
        setTimeout(() => tryScrollToMessage(result.id), 200);
      } else {
        // Same channel — try immediately
        tryScrollToMessage(result.id);
      }
    }
  }, [currentChannel?.id, selectChannel, toast]);

  const handlePinMessage = useCallback(async (messageId: number) => {
    if (!currentChannel) return;
    try {
      await pinService.pinMessage(currentChannel.id, messageId);
      setPinnedCount(prev => prev + 1);
      toast({ title: 'Message pinned' });
    } catch (err: any) {
      toast({ title: 'Failed to pin', description: err.message, variant: 'destructive' });
    }
  }, [currentChannel, toast]);

  const handleUnpinMessage = useCallback(async (messageId: number) => {
    if (!currentChannel) return;
    try {
      await pinService.unpinMessage(currentChannel.id, messageId);
      setPinnedCount(prev => Math.max(0, prev - 1));
      toast({ title: 'Message unpinned' });
    } catch (err: any) {
      toast({ title: 'Failed to unpin', description: err.message, variant: 'destructive' });
    }
  }, [currentChannel, toast]);

  const handleProfileClick = useCallback((username: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfilePopover({ username, rect });
  }, []);

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleReactionToggle = async (messageId: number, emoji: string) => {
    try {
      // Server returns the full aggregated reactions — no follow-up GET needed
      const result = await reactionService.toggleMessageReaction(messageId, emoji);

      if (result.reactions) {
        setMessageReactions(prev => {
          const next = { ...prev };
          if (result.reactions!.length > 0) {
            next[messageId] = result.reactions!;
          } else {
            delete next[messageId];
          }
          return next;
        });
      }
    } catch (error: any) {
      // Debounce rejections are expected — silently ignore
      if (error?.message === 'debounced') return;
      console.error('Failed to toggle reaction:', error);
    }
  };

  // Handle scroll to load more messages
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    if (element.scrollTop === 0 && !isLoadingMessages) {
      loadMoreMessages();
    }
  };

  // Reply helpers
  const handleReply = (msg: Message) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
  };

  const scrollToMessage = (messageId: number) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-[hsl(var(--theme-accent-primary)/0.6)]', 'bg-[hsl(var(--theme-accent-primary)/0.08)]');
      setTimeout(() => {
        el.classList.remove('ring-1', 'ring-[hsl(var(--theme-accent-primary)/0.6)]', 'bg-[hsl(var(--theme-accent-primary)/0.08)]');
      }, 2000);
    }
  };

  const handleSendMessage = async () => {
    // If a file is staged, send as file upload
    if (pendingFile && currentChannel) {
      setUploadProgress(0);
      try {
        await uploadService.uploadChannelFile(
          pendingFile,
          currentChannel.id,
          message.trim() || undefined,
          (p: UploadProgress) => setUploadProgress(p.percent)
        );
        setPendingFile(null);
        setMessage("");
      } catch (error: any) {
        console.error("File upload failed:", error);
        toast({
          title: "Upload failed",
          description: error.message || "Could not upload file.",
          variant: "destructive",
        });
      } finally {
        setUploadProgress(null);
      }
      return;
    }

    if (!message.trim() || isSending || !currentChannel) return;

    const messageToSend = message;
    setMessage("");
    setIsSending(true);
    const replyToId = replyingTo?.id;
    setReplyingTo(null);

    try {
      const response = await sendMessage(messageToSend, 'text', replyToId);
      const moderation = response?.moderation;

      if (moderation && moderation.action && !response?.message) {
        const isBlock = moderation.action === 'block_user' || moderation.action === 'remove_user';
        toast({
          title: isBlock ? 'Access restricted' : 'Message moderated',
          description: moderation.message || 'Your message was moderated.',
          variant: isBlock ? 'destructive' : 'default',
          duration: 6000,
        });
      } else if (moderation && moderation.action === 'warn') {
        toast({
          title: 'Warning issued',
          description: moderation.message || 'Please follow the community guidelines.',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessage(messageToSend);
    } finally {
      setIsSending(false);
      // Use setTimeout to ensure focus happens after React re-render
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    const error = validateFile(file);
    if (error) {
      toast({ title: "Invalid file", description: error, variant: "destructive" });
      return;
    }
    setPendingFile(file);
  };

  const handleVoiceSend = async (audioBlob: Blob, duration: number) => {
    if (!currentChannel) return;

    // Convert blob to file with proper extension
    const extension = audioBlob.type.includes('webm') ? 'webm' : 
                      audioBlob.type.includes('ogg') ? 'ogg' : 
                      audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    const fileName = `voice_message_${Date.now()}.${extension}`;
    const audioFile = new File([audioBlob], fileName, { type: audioBlob.type });

    setUploadProgress(0);
    try {
      await uploadService.uploadChannelFile(
        audioFile,
        currentChannel.id,
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle command suggestions navigation
    if (showCommandSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % availableCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + availableCommands.length) % availableCommands.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const selectedCommand = availableCommands[selectedCommandIndex];
        setMessage(selectedCommand.command + ' ');
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
      if (e.key === "Escape") {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
    }
    
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Show command suggestions when user types '/'
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setShowCommandSuggestions(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommandSuggestions(false);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Only send typing indicator for non-command messages
    if (value.trim() && !value.startsWith('/')) {
      sendTyping();
      typingTimeoutRef.current = setTimeout(() => {
        // Typing indicator expires
      }, 3000);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    const timeString = `${displayHours}:${displayMinutes} ${ampm}`;
    
    if (diffHours < 24) {
      return timeString;
    } else if (diffHours < 48) {
      return `Yesterday at ${timeString}`;
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()} at ${timeString}`;
    }
  };

  const formatDateDivider = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffDays < 1) {
      return "Today";
    } else if (diffDays < 2) {
      return "Yesterday";
    } else {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const shouldShowDateDivider = (currentMsg: any, previousMsg: any) => {
    if (!previousMsg) return true;
    
    const currentDate = new Date(currentMsg.created_at);
    const previousDate = new Date(previousMsg.created_at);
    
    return !isSameDay(currentDate, previousDate);
  };

  const getAvatarInitials = (name: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-500",
      "bg-purple-500", "bg-pink-500", "bg-indigo-500", "bg-teal-500",
      "bg-orange-500", "bg-cyan-500"
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div 
      className="flex flex-col h-full transition-colors duration-300 relative"
      style={{ background: 'var(--theme-bg-gradient)' }}
    >
      {/* Gradient overlay for depth - hidden for basic/onyx themes */}
      {currentTheme !== 'basic' && currentTheme !== 'onyx' && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 30% 20%, hsl(var(--theme-accent-primary) / 0.03) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsl(var(--theme-accent-secondary) / 0.03) 0%, transparent 50%)',
          }}
        />
      )}
      
      {/* Voice Channel — now handled by VoiceDock + VoiceRoomModal at App level */}
      {currentChannel?.type === 'voice' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'hsl(var(--theme-bg-primary))' }}>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center bg-[hsl(var(--theme-accent-primary)/0.1)]">
              <Radio className="w-8 h-8 text-[hsl(var(--theme-accent-primary))]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
                {currentChannel.name}
              </h2>
              <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">
                Voice channel — use the sidebar to join
              </p>
            </div>
            <button
              onClick={() => {
                const textChannel = channels.find(ch => ch.type === 'text');
                if (textChannel) selectChannel(textChannel.id);
              }}
              className="text-sm text-[hsl(var(--theme-accent-primary))] hover:underline"
            >
              Go to a text channel
            </button>
          </div>
        </div>
      )}

      {/* Header - Discord Style with Theme Support */}
      <header
        className="h-12 flex items-center justify-between border-b shadow-sm relative z-30 backdrop-blur-md border-[hsl(var(--theme-border-default)/0.5)] transition-colors duration-300"
        style={{ background: 'hsl(var(--theme-header-bg) / 0.85)' }}
      >
        <div className="flex items-center h-full">
          {/* Channel Info */}
          <div className="flex items-center gap-2 pl-14 md:pl-4 pr-4 h-full border-r border-[hsl(var(--theme-border-default)/0.4)]">
            <div className="flex items-center justify-center w-6 h-6 text-[hsl(var(--theme-text-secondary))]">
              {currentChannel?.type === 'voice' ? (
                <Mic className="w-5 h-5" />
              ) : (
                <Hash className="w-5 h-5" />
              )}
            </div>
            <h2 className="text-[15px] font-semibold text-[hsl(var(--theme-text-primary))]">
              {currentChannel?.name || "Select a channel"}
            </h2>
          </div>
          
          {/* Channel Description - hidden on mobile */}
          {currentChannel?.description && (
            <div className="hidden sm:flex items-center gap-3 px-4 h-full">
              <div className="w-px h-6 bg-[hsl(var(--theme-border-default))]" />
              <p className="text-[13px] text-[hsl(var(--theme-text-secondary))]">
                {currentChannel.description}
              </p>
            </div>
          )}

          {/* Connection Status - Subtle */}
          <div className={`ml-2 flex items-center gap-1 px-2 ${
            isConnected 
              ? "text-green-400/70"
              : "text-red-400 animate-pulse"
          }`}>
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="text-xs">Reconnecting...</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-4">
          {/* Search Button - Ctrl+K */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm border transition-all bg-[hsl(var(--theme-input-bg))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-muted))] hover:border-[hsl(var(--theme-accent-primary)/0.5)] hover:text-[hsl(var(--theme-text-secondary))] w-56"
          >
            <Search className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left text-[13px]">Search messages...</span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))]">⌘K</kbd>
          </button>

          {/* Pinned Messages */}
          {currentChannel && (
            <button
              onClick={() => setPinsOpen(prev => !prev)}
              className={`p-2 rounded-lg transition-colors relative ${
                pinsOpen
                  ? 'bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]'
                  : 'hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]'
              }`}
              title="Pinned Messages"
            >
              <Pin className="w-4 h-4" />
              {pinnedCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 bg-[hsl(var(--theme-accent-primary))] text-white">
                  {pinnedCount}
                </span>
              )}
            </button>
          )}
          
          {/* Notifications */}
          <NotificationButton />
          
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          {/* <button
            className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
          >
            <Settings className="w-4 h-4" />
          </button> */}
        </div>
      </header>

      {/* Messages */}
      <main
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto transition-colors duration-300 relative"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent',
          background: 'transparent'
        }}
      >
        {isLoadingMessages && messages.length === 0 && (
          <div className="flex justify-center items-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent mx-auto mb-4 border-[hsl(var(--theme-accent-primary))]"></div>
              <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                Loading messages...
              </p>
            </div>
          </div>
        )}
        {!currentChannel ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg px-4 sm:px-6">
              <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full mx-auto mb-5 flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                <Hash className="w-7 h-7 sm:w-10 sm:h-10 text-[hsl(var(--theme-text-muted))]" />
              </div>
              <h3 className="text-2xl font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
                Welcome to AuraFlow
              </h3>
              <p className="text-[15px] leading-relaxed text-[hsl(var(--theme-text-secondary))]">
                Select a channel from the sidebar to start messaging with your team
              </p>
            </div>
          </div>
        ) : messages.length === 0 && !isLoadingMessages ? (
          <div className="flex flex-col items-start justify-end h-full px-4 pb-4">
            <div className="max-w-2xl">
              <div className="w-[68px] h-[68px] rounded-full mb-4 flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                <Hash className="w-9 h-9 text-[hsl(var(--theme-text-secondary))]" />
              </div>
              <h3 className="text-xl sm:text-[32px] font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
                Welcome to #{currentChannel.name}!
              </h3>
              <p className="text-[13px] sm:text-[15px] text-[hsl(var(--theme-text-secondary))]">
                This is the start of the <span className="font-semibold">#{currentChannel.name}</span> channel.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            {/* Channel Welcome Header */}
            <div className="px-4 pt-6 pb-4">
              <div className="w-12 h-12 sm:w-[68px] sm:h-[68px] rounded-full mb-4 flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                <Hash className="w-6 h-6 sm:w-9 sm:h-9 text-[hsl(var(--theme-text-secondary))]" />
              </div>
              <h3 className="text-xl sm:text-[32px] font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
                Welcome to #{currentChannel?.name}!
              </h3>
              <p className="text-[15px] text-[hsl(var(--theme-text-secondary))]">
                This is the start of the <span className="font-semibold">#{currentChannel?.name}</span> channel.
              </p>
            </div>

            {/* Loading more indicator */}
            {isLoadingMessages && messages.length > 0 && (
              <div className="flex justify-center py-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent border-[hsl(var(--theme-accent-primary))]"></div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1">
              {messages.filter(msg => msg.message_type !== 'text' || !msg.content.startsWith('/')).map((msg, index, filteredMessages) => {
                const showDateDivider = index === 0 || !isSameDay(new Date(msg.created_at), new Date(filteredMessages[index - 1]?.created_at));
                const showAuthor = index === 0 || filteredMessages[index - 1]?.sender_id !== msg.sender_id || showDateDivider;
                const authorName = msg.author || "Unknown User";
                
                // Check time gap - show header if more than 7 minutes apart
                const prevMsg = filteredMessages[index - 1];
                const timeDiff = prevMsg ? new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() : Infinity;
                const showHeaderByTime = timeDiff > 7 * 60 * 1000;
                const shouldShowHeader = showAuthor || showHeaderByTime;
                
                // Debug blocked status
                if (msg.is_blocked) {
                  console.log(`[BLOCKED USER] Message ${msg.id} from ${authorName} is_blocked:`, msg.is_blocked);
                }


                return (
                  <div key={`${msg.id}-${index}`}>
                    {/* Date Divider - Discord Style */}
                    {showDateDivider && index !== 0 && (
                      <div className="relative flex items-center justify-center my-4 mx-4">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-px bg-[hsl(var(--theme-border-default)/0.7)]" />
                        </div>
                        <span className="relative z-10 text-[11px] font-semibold px-2 py-0.5 bg-[hsl(var(--theme-bg-primary))] text-[hsl(var(--theme-text-muted))]">
                          {formatDateDivider(msg.created_at)}
                        </span>
                      </div>
                    )}

                    {/* Message - Discord Style */}
                    <div 
                      id={`msg-${msg.id}`}
                      className={`group relative flex py-0.5 pr-4 sm:pr-12 pl-14 sm:pl-[72px] ${
                        shouldShowHeader ? 'mt-[17px]' : 'mt-0'
                      } hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-all duration-300`}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      {/* Avatar - Positioned absolutely */}
                      {shouldShowHeader ? (
                        <div className="absolute left-2 sm:left-4 mt-0.5">
                          {msg.avatar_url ? (
                            <img
                              src={getAvatarUrl(msg.avatar_url, authorName)}
                              alt={authorName}
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={(e) => handleProfileClick(msg.author || authorName, e)}
                            />
                          ) : (
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${getAvatarColor(authorName)} flex items-center justify-center text-white font-medium text-xs sm:text-sm cursor-pointer hover:shadow-lg transition-shadow`}
                              onClick={(e) => handleProfileClick(msg.author || authorName, e)}
                            >
                              {getAvatarInitials(authorName)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="absolute left-2 sm:left-4 w-8 sm:w-10 text-[10px] sm:text-[11px] text-right opacity-0 group-hover:opacity-100 transition-opacity select-none text-[hsl(var(--theme-text-muted))]">
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        {shouldShowHeader && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <span
                              className="font-medium text-[15px] hover:underline cursor-pointer text-[hsl(var(--theme-text-primary))]"
                              onClick={(e) => handleProfileClick(msg.author || authorName, e)}
                            >
                              {authorName}
                            </span>
                            {/* Role badges could go here */}
                            <span className="text-[11px] ml-1 text-[hsl(var(--theme-text-muted))]">
                              {formatMessageTime(msg.created_at)}
                            </span>
                            {/* Removed/Blocked Tag */}
                            {msg.is_blocked && (
                              <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400">
                                Removed
                              </span>
                            )}
                            {/* Moderation Badge */}
                            {msg.moderation && (
                              <ModerationBadge
                                action={msg.moderation.action}
                                severity={msg.moderation.severity}
                                reasons={msg.moderation.reasons}
                              />
                            )}
                            {/* Pinned indicator */}
                            {msg.is_pinned && (
                              <span className="ml-1 flex items-center gap-0.5 text-[hsl(var(--theme-accent-primary)/0.7)]" title="Pinned message">
                                <Pin className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        )}
                        {/* Show Removed tag even when header is hidden */}
                        {!shouldShowHeader && msg.is_blocked && (
                          <span className="inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400">
                            Removed
                          </span>
                        )}
                        <div className="text-[15px] leading-[1.375rem] break-words text-[hsl(var(--theme-text-primary))]">
                          {/* Reply-to preview */}
                          {msg.reply_to_preview && (
                            <ReplyPreview
                              preview={msg.reply_to_preview}
                              onClick={() => scrollToMessage(msg.reply_to_preview!.id)}
                            />
                          )}
                          {/* File / Image / Audio / Video attachment */}
                          {msg.attachment && (msg.message_type === 'image' || msg.message_type === 'file' || msg.message_type === 'voice' || msg.message_type === 'video') && (
                            <FileAttachment
                              fileName={msg.attachment.file_name}
                              fileUrl={msg.attachment.file_url}
                              fileSize={msg.attachment.file_size}
                              mimeType={msg.attachment.mime_type}
                              uploaderName={authorName}
                              uploadedAt={msg.created_at}
                              duration={msg.attachment.duration}
                            />
                          )}
                          {/* Text content / caption */}
                          {msg.content && (() => {
                            // If there's an attachment, strip the file URL from content to show only caption
                            let displayContent = msg.content;
                            if (msg.attachment) {
                              displayContent = displayContent.replace(msg.attachment.file_url, '').replace(/^\n+/, '').trim();
                            }
                            if (!displayContent) return null;
                            return (
                              <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(displayContent.trim()) ? 'text-[44px] leading-[54px]' : ''}>
                                {displayContent}
                              </span>
                            );
                          })()}
                        </div>
                        
                        {/* Reactions Display */}
                        {(messageReactions[msg.id]?.length > 0 || hoveredMessageId === msg.id) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {messageReactions[msg.id] && messageReactions[msg.id].length > 0 && (
                              <MessageReactions
                                reactions={messageReactions[msg.id]}
                                onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons - Floating on hover */}
                      <div className="absolute -top-4 right-2 sm:right-4 opacity-0 group-hover:opacity-100 transition-all">
                        <div className="flex items-center rounded-md shadow-lg border bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id);
                            }}
                            className="p-1.5 transition-colors text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] rounded-l-md"
                            title="Add Reaction"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReply(msg);
                            }}
                            className="p-1.5 transition-colors text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]"
                            title="Reply"
                          >
                            <Reply className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (msg.is_pinned) {
                                handleUnpinMessage(msg.id);
                              } else {
                                handlePinMessage(msg.id);
                              }
                            }}
                            className={`p-1.5 transition-colors rounded-r-md ${
                              msg.is_pinned
                                ? 'text-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                                : 'text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                            }`}
                            title={msg.is_pinned ? "Unpin Message" : "Pin Message"}
                          >
                            <Pin className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Reaction Picker */}
                      {reactionPickerMessageId === msg.id && (
                        <div data-reaction-picker className="absolute top-0 right-16 z-50 shadow-2xl">
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
                );
              })}

            </div>

            {/* Typing Indicators - Discord Style */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 h-6 px-4 text-[13px] text-[hsl(var(--theme-text-secondary))]">
                <div className="flex items-center gap-0.5">
                  <div className="w-2 h-2 rounded-full animate-bounce bg-[hsl(var(--theme-text-muted))]" style={{ animationDelay: "0ms", animationDuration: "1s" }}></div>
                  <div className="w-2 h-2 rounded-full animate-bounce bg-[hsl(var(--theme-text-muted))]" style={{ animationDelay: "200ms", animationDuration: "1s" }}></div>
                  <div className="w-2 h-2 rounded-full animate-bounce bg-[hsl(var(--theme-text-muted))]" style={{ animationDelay: "400ms", animationDuration: "1s" }}></div>
                </div>
                <span>
                  <strong>{typingUsers.map((u) => u.username).join(", ")}</strong>
                  {typingUsers.length === 1 ? " is typing..." : " are typing..."}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </main>

      {/* Input - Discord Style */}
      {currentChannel?.type !== 'voice' && (
      <footer 
        className="px-4 pb-16 md:pb-6 pt-0 relative transition-colors duration-300 backdrop-blur-sm"
        
      >
        <div className="relative">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip,.rar,.7z"
          />

          {/* Reply Bar */}
          {replyingTo && (
            <ReplyBar
              message={replyingTo}
              authorName={replyingTo.author || 'Unknown'}
              onCancel={() => setReplyingTo(null)}
            />
          )}

          {/* File Upload Preview */}
          {pendingFile && (
            <FileUploadPreview
              file={pendingFile}
              uploadProgress={uploadProgress}
              onCancel={() => setPendingFile(null)}
            />
          )}

          {/* Command Suggestions Dropdown */}
          {showCommandSuggestions && (
            <div className="absolute bottom-full left-0 mb-2 w-full max-w-md rounded-lg shadow-2xl border overflow-hidden z-50 backdrop-blur-xl bg-[hsl(var(--theme-bg-elevated)/0.95)] border-[hsl(var(--theme-border-default))]">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b bg-[hsl(var(--theme-bg-secondary)/0.8)] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
                Commands
              </div>
              {availableCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  onClick={() => {
                    setMessage(cmd.command + ' ');
                    setShowCommandSuggestions(false);
                    setSelectedCommandIndex(0);
                    inputRef.current?.focus();
                  }}
                  className={`w-full px-3 py-2.5 text-left transition-colors ${
                    index === selectedCommandIndex
                      ? "bg-[hsl(var(--theme-accent-primary)/0.2)]"
                      : "hover:bg-[hsl(var(--theme-bg-hover))]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-md ${
                      index === selectedCommandIndex
                        ? "bg-[hsl(var(--theme-accent-primary)/0.3)]"
                        : "bg-[hsl(var(--theme-bg-tertiary))]"
                    }`}>
                      <Bot className={`w-4 h-4 ${
                        index === selectedCommandIndex
                          ? "text-[hsl(var(--theme-accent-primary))]"
                          : "text-[hsl(var(--theme-text-muted))]"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-[15px] ${
                        index === selectedCommandIndex
                          ? "text-[hsl(var(--theme-accent-primary))]"
                          : "text-[hsl(var(--theme-text-primary))]"
                      }`}>
                        {cmd.command}
                      </div>
                      <div className="text-[13px] mt-0.5 text-[hsl(var(--theme-text-secondary))]">
                        {cmd.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              <div className="px-3 py-2 text-[11px] border-t flex items-center gap-3 bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
                <span><kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--theme-bg-tertiary))]">↑↓</kbd> navigate</span>
                <span><kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--theme-bg-tertiary))]">Tab</kbd> select</span>
                <span><kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--theme-bg-tertiary))]">Esc</kbd> close</span>
              </div>
            </div>
          )}

          <div className={`flex items-center rounded-lg transition-all backdrop-blur-md border ${
            message.startsWith('/')
              ? "bg-[hsl(var(--theme-accent-primary)/0.15)] ring-1 ring-[hsl(var(--theme-accent-primary)/0.5)] border-[hsl(var(--theme-accent-primary)/0.3)]"
              : "bg-[hsl(var(--theme-bg-secondary)/0.5)] hover:bg-[hsl(var(--theme-bg-tertiary)/0.6)] border-[hsl(var(--theme-border-default)/0.4)]"
          }`}>
            {/* Plus Button - File Upload */}
            <button
              className="flex-shrink-0 p-3 rounded-l-lg transition-colors text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
              disabled={!currentChannel || !isConnected}
              onClick={() => fileInputRef.current?.click()}
              title="Upload a file"
            >
              <Plus className="w-5 h-5" />
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={
                message.startsWith('/') 
                  ? "Type a command..." 
                  : currentChannel 
                    ? `Message #${currentChannel.name}` 
                    : "Select a channel to start messaging"
              }
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={!currentChannel || isSending || !isConnected}
              className={`flex-1 bg-transparent outline-none text-sm sm:text-[15px] py-2.5 min-w-0 ${
                message.startsWith('/')
                  ? "text-[hsl(var(--theme-accent-primary))] placeholder-[hsl(var(--theme-accent-primary)/0.6)]"
                  : "text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]"
              } disabled:opacity-50`}
            />

            <div className="flex items-center gap-1 pr-2">
              <button
                className="p-2 rounded-md transition-colors text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
                disabled={!currentChannel || !isConnected}
                onClick={() => fileInputRef.current?.click()}
                title="Attach a file"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <EmojiPickerButton
                onEmojiSelect={handleEmojiSelect}
                pickerPosition="top"
                disabled={!currentChannel || !isConnected}
              />
              <VoiceRecorder
                onSend={handleVoiceSend}
                disabled={!currentChannel || !isConnected}
              />
            </div>
          </div>

          {!isConnected && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
              <WifiOff className="w-3.5 h-3.5 animate-pulse" />
              <span>Connection lost. Attempting to reconnect...</span>
            </div>
          )}
        </div>
      </footer>
      )}

      {/* AI Command Result Display */}
      {commandResult && commandResult.success && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 max-w-md w-auto sm:w-full max-h-[60vh] sm:max-h-[70vh] z-50 rounded-xl shadow-2xl border overflow-hidden flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]">
          {/* Header - Fixed */}
          <div className="flex items-start justify-between gap-3 p-4 border-b border-[hsl(var(--theme-border-default))]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[hsl(var(--theme-accent-primary)/0.2)]">
                <Bot className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))]">
                  Conversation Summary
                </h3>
                {commandResult.method && (
                  <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Method: {commandResult.method}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setCommandResult(null)}
              className="p-1 rounded-lg transition-colors flex-shrink-0 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {commandResult.summary && (
              <div className="text-sm p-3 rounded-lg bg-[hsl(var(--theme-bg-secondary))]">
                <div className="leading-relaxed whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                  {commandResult.summary}
                </div>
              </div>
            )}

            {/* Hide Key Points - summary already contains everything */}
          </div>
        </div>
      )}

      {/* --- Search Modal --- */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={handleSearchNavigate}
        currentChannelId={currentChannel?.id}
      />

      {/* --- Pinned Messages Panel --- */}
      {currentChannel && (
        <PinnedMessagesPanel
          channelId={currentChannel.id}
          isOpen={pinsOpen}
          onClose={() => setPinsOpen(false)}
          onJumpToMessage={scrollToMessage}
          onUnpin={handleUnpinMessage}
          canManagePins={true}
        />
      )}

      {/* --- User Profile Popover --- */}
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
}
