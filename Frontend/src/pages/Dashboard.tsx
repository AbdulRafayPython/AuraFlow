// pages/Dashboard.tsx - Professional Real-time Version with Theme Support
import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Settings, Hash, Paperclip, Smile, Bot, Sun, Moon, Send, Wifi, WifiOff, Plus, Mic, SmilePlus, X, Palette, Reply, Pin, PinOff, Radio, BookOpen, Trash2, Brain, Languages } from "lucide-react";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useVoice } from "@/contexts/VoiceContext";
import { getAvatarUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import EmojiPickerButton from "@/components/EmojiPickerButton";
import ReactionPicker from "@/components/ReactionPicker";
import MessageReactions from "@/components/MessageReactions";
import { ModerationBadge } from "@/components/ModerationBadge";
import { ModerationWarningBanner } from "@/components/ModerationWarningBanner";
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
import PinDurationModal from "@/components/pins/PinDurationModal";
import type { PinModalContext } from "@/components/pins/PinDurationModal";
import PinnedMessageBanner, { type ActivePinData } from "@/components/pins/PinnedMessageBanner";
import { pinService, type PinDurationMinutes } from "@/services/pinService";
import { useAuth } from "@/contexts/AuthContext";
import { KnowledgePanel } from "@/components/ai-agents/KnowledgePanel";
import AgentBar from "@/components/ai-agents/AgentBar";
import AgentResultPanel, { AgentResultTab, TranslationHistoryItem } from "@/components/ai-agents/AgentResultPanel";
import QuickReplyChips from "@/components/chat/QuickReplyChips";
import { statusService } from "@/services/statusService";
import { friendService } from "@/services/friendService";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { aiAgentService } from "@/services/aiAgentService";
import type { Message } from "@/types";
import type { SearchResult } from "@/services/searchService";

export default function Dashboard() {
  const { isDarkMode, toggleTheme, currentTheme, setTheme, themes } = useTheme();
  const { user: authUser } = useAuth();
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
    updateMessageField,
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
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
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

  // Pin Duration Modal state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMessageId, setPinModalMessageId] = useState<number | null>(null);
  const [pinModalPreview, setPinModalPreview] = useState<string | undefined>(undefined);

  // Active pinned message banner state
  const [activePin, setActivePin] = useState<ActivePinData | null>(null);

  // Pin modal context — carries pin metadata for the modal
  const [pinModalContext, setPinModalContext] = useState<PinModalContext | undefined>(undefined);

  // Centralised unread tracking (socket-driven, no HTTP polling)
  const { markChannelRead: markChRead } = useUnreadCounts();

  // Ephemeral summary state (private /summarize results)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [ephemeralSummary, setEphemeralSummary] = useState<{ content: string; method: string; message_count: number; created_at: string } | null>(null);
  const [displayedSummaryText, setDisplayedSummaryText] = useState('');
  const [pendingScheduledSummaries, setPendingScheduledSummaries] = useState<any[]>([]);
  const [savedSummaries, setSavedSummaries] = useState<any[]>([]);
  const [summaryHistoryOpen, setSummaryHistoryOpen] = useState(false);
  const [kbPanelOpen, setKbPanelOpen] = useState(false);

  // AgentResultPanel — multi-tab right rail driven by AgentBar
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [agentPanelTab, setAgentPanelTab] = useState<AgentResultTab>('knowledge');
  const [translationHistory, setTranslationHistory] = useState<TranslationHistoryItem[]>([]);

  // Ephemeral KB state (private /kb results)
  const [isGeneratingKB, setIsGeneratingKB] = useState(false);
  const [ephemeralKBResult, setEphemeralKBResult] = useState<{
    content: string;
    subtype: string;
    total_items: number;
    faqs: number;
    definitions: number;
    decisions: number;
    method: string;
    result_count?: number;
    created_at: string;
  } | null>(null);

  // Available commands (priority-ordered; only top N are shown in the picker)
  const allCommands = [
    { command: '/summarize', description: 'Summarize recent messages', usage: '/summarize [count]' },
    { command: '/ask',       description: 'Ask the AI Assistant',       usage: '/ask <question>' },
    { command: '/support',   description: 'Ask the community knowledge base', usage: '/support <question>' },
    { command: '/translate', description: 'Translate text',              usage: '/translate <lang> <text>' },
    { command: '/help',      description: 'Show available commands',    usage: '/help' },
    { command: '/icebreaker',description: 'Post an ice-breaker',         usage: '/icebreaker' },
    { command: '/poll',      description: 'Post a quick poll',           usage: '/poll' },
    { command: '/extract',   description: 'Extract knowledge from channel', usage: '/extract' },
    { command: '/focus',     description: 'Check channel focus score',  usage: '/focus' },
    { command: '/mood',      description: 'Analyze your mood and sentiment', usage: '/mood [hours]' },
    { command: '/wellness',  description: 'Check your wellness score',  usage: '/wellness' },
    { command: '/kb',        description: 'Extract knowledge (legacy)', usage: '/kb [hours]' },
    { command: '/kb search', description: 'Search the knowledge base',  usage: '/kb search <query>' },
  ];
  const COMMAND_PICKER_LIMIT = 5;
  // Filter by current input prefix, then cap to the top N to keep the picker compact
  const filteredCommands = (() => {
    const q = (message || '').trim().toLowerCase();
    const base = q.startsWith('/')
      ? allCommands.filter(c => c.command.toLowerCase().startsWith(q))
      : allCommands;
    return base.slice(0, COMMAND_PICKER_LIMIT);
  })();
  const availableCommands = filteredCommands;

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

  // Scroll to bottom when skeleton/ephemeral summary appears
  useEffect(() => {
    if ((isGeneratingSummary || ephemeralSummary) && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [isGeneratingSummary, ephemeralSummary]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Listen for AI command results — errors and help responses both come through here.
  useEffect(() => {
    const handleCommandResult = (event: CustomEvent) => {
      const data = event.detail;
      if (data?.type === 'help' && data?.success) {
        toast({
          title: 'AuraFlow AI Commands',
          description: String(data.message || '').replace(/[*`]/g, ''),
          duration: 12000,
        });
        return;
      }
      if (!data?.success) {
        toast({
          title: '❌ Command Failed',
          description: data?.error || 'Failed to execute command.',
          variant: 'destructive',
          duration: 5000,
        });
      }
    };

    window.addEventListener('ai_command_result', handleCommandResult as EventListener);
    return () => {
      window.removeEventListener('ai_command_result', handleCommandResult as EventListener);
    };
  }, [toast]);

  // Listen for ephemeral summary events (private to sender)
  useEffect(() => {
    const handleSummaryGenerating = (event: CustomEvent) => {
      const data = event.detail;
      if (currentChannel && data.channel_id === currentChannel.id) {
        setIsGeneratingSummary(true);
        setEphemeralSummary(null);
        setDisplayedSummaryText('');
      }
    };

    const handleSummaryResult = (event: CustomEvent) => {
      const data = event.detail;
      if (currentChannel && data.channel_id === currentChannel.id) {
        setIsGeneratingSummary(false);
        setEphemeralSummary(data);
        // Refresh saved summaries list (new one was just saved server-side)
        aiAgentService.getMySummaries(currentChannel.id, 10).then(s => setSavedSummaries(s)).catch(() => {});
      }
    };

    window.addEventListener('summary_generating', handleSummaryGenerating as EventListener);
    window.addEventListener('summary_result', handleSummaryResult as EventListener);
    return () => {
      window.removeEventListener('summary_generating', handleSummaryGenerating as EventListener);
      window.removeEventListener('summary_result', handleSummaryResult as EventListener);
    };
  }, [currentChannel]);

  // Listen for ephemeral KB events (private to sender)
  useEffect(() => {
    const handleKBGenerating = (event: CustomEvent) => {
      const data = event.detail;
      if (currentChannel && data.channel_id === currentChannel.id) {
        setIsGeneratingKB(true);
        setEphemeralKBResult(null);
      }
    };

    const handleKBResult = (event: CustomEvent) => {
      const data = event.detail;
      if (currentChannel && data.channel_id === currentChannel.id) {
        setIsGeneratingKB(false);
        setEphemeralKBResult(data);
      }
    };

    window.addEventListener('kb_generating', handleKBGenerating as EventListener);
    window.addEventListener('kb_result', handleKBResult as EventListener);
    return () => {
      window.removeEventListener('kb_generating', handleKBGenerating as EventListener);
      window.removeEventListener('kb_result', handleKBResult as EventListener);
    };
  }, [currentChannel]);

  // Typewriter animation for ephemeral summary
  useEffect(() => {
    if (!ephemeralSummary) {
      setDisplayedSummaryText('');
      return;
    }
    const text = ephemeralSummary.content;
    let index = 0;
    setDisplayedSummaryText('');
    const interval = setInterval(() => {
      index += 3;
      setDisplayedSummaryText(text.slice(0, index));
      if (index >= text.length) {
        setDisplayedSummaryText(text);
        clearInterval(interval);
      }
    }, 8);
    return () => clearInterval(interval);
  }, [ephemeralSummary]);

  // Clear ephemeral summary when switching channels
  useEffect(() => {
    setEphemeralSummary(null);
    setIsGeneratingSummary(false);
    setDisplayedSummaryText('');
    setPendingScheduledSummaries([]);
    setSavedSummaries([]);
    setSummaryHistoryOpen(false);
    setKbPanelOpen(false);
    setEphemeralKBResult(null);
    setIsGeneratingKB(false);
  }, [currentChannel?.id]);

  // Fetch pending scheduled summaries + saved summaries when entering a channel
  useEffect(() => {
    if (!currentChannel) return;
    let cancelled = false;
    aiAgentService.getPendingSummaries(currentChannel.id).then(summaries => {
      if (!cancelled && summaries.length > 0) {
        setPendingScheduledSummaries(summaries);
      }
    }).catch(() => {});
    aiAgentService.getMySummaries(currentChannel.id, 10).then(summaries => {
      if (!cancelled) setSavedSummaries(summaries);
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChannel?.id]);

  // --- Fetch pinned count + active pin when channel changes ---
  useEffect(() => {
    if (!currentChannel) return;
    let cancelled = false;
    pinService.getPinnedMessages(currentChannel.id).then(data => {
      if (!cancelled) setPinnedCount(data.count);
    }).catch(() => {});
    pinService.getActivePin(currentChannel.id).then(pin => {
      if (!cancelled) setActivePin(pin);
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChannel?.id]);

  // --- Mark channel as read when switching (socket-driven, replaces HTTP) ---
  useEffect(() => {
    if (!currentChannel || messages.length === 0) return;
    markChRead(currentChannel.id, currentCommunity?.id ? Number(currentCommunity.id) : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChannel?.id, messages.length, markChRead, currentCommunity?.id]);

  // --- Socket listeners for pins (banner + count + is_pinned sync) ---
  useEffect(() => {
    const handlePinned = (data: any) => {
      if (data.channel_id === currentChannel?.id) {
        setPinnedCount(prev => prev + 1);
        // Sync is_pinned flag on the message so pin icon updates instantly
        if (data.message_id) updateMessageField(data.message_id, { is_pinned: true });
        // Update banner with new active pin data from socket event
        if (currentChannel) {
          pinService.getActivePin(currentChannel.id).then(pin => {
            setActivePin(pin);
          }).catch(() => {});
        }
      }
    };
    const handleUnpinned = (data: any) => {
      if (data.channel_id === currentChannel?.id) {
        setPinnedCount(prev => Math.max(0, prev - 1));
        // Sync is_pinned flag
        if (data.message_id) updateMessageField(data.message_id, { is_pinned: false });
        // Refresh active pin — it may have been the one unpinned
        if (currentChannel) {
          pinService.getActivePin(currentChannel.id).then(pin => {
            setActivePin(pin);
          }).catch(() => {});
        }
      }
    };
    const handlePinExpired = (data: any) => {
      if (data.channel_id === currentChannel?.id) {
        setPinnedCount(prev => Math.max(0, prev - 1));
        // Sync is_pinned flag
        if (data.message_id) updateMessageField(data.message_id, { is_pinned: false });
        setActivePin(prev => {
          if (prev && prev.message.id === data.message_id) return null;
          return prev;
        });
      }
    };
    socket.on('message_pinned', handlePinned);
    socket.on('message_unpinned', handleUnpinned);
    socket.on('pin_expired', handlePinExpired);
    return () => {
      socket.off('message_pinned', handlePinned);
      socket.off('message_unpinned', handleUnpinned);
      socket.off('pin_expired', handlePinExpired);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Opens the pin modal — shows duration picker (new pin) or pin info + unpin (already pinned)
  const handlePinMessage = useCallback((messageId: number) => {
    if (!currentChannel) return;
    const msg = messages.find(m => m.id === messageId);
    setPinModalMessageId(messageId);
    setPinModalPreview(msg?.content || undefined);

    // Build context: is this message already pinned?
    if (msg?.is_pinned && activePin && activePin.message.id === messageId) {
      // We have rich data from the active pin banner
      setPinModalContext({
        isPinned: true,
        pinnedByUserId: activePin.pinned_by.user_id,
        pinnedByUsername: activePin.pinned_by.display_name || activePin.pinned_by.username,
        expiresAt: activePin.expires_at,
      });
    } else if (msg?.is_pinned) {
      // Pinned but not the active pin — we only know it's pinned
      setPinModalContext({
        isPinned: true,
        pinnedByUserId: null,
        pinnedByUsername: null,
        expiresAt: null,
      });
    } else {
      // Not pinned — normal duration selection flow
      setPinModalContext(undefined);
    }
    setPinModalOpen(true);
  }, [currentChannel, messages, activePin]);

  // Called from PinDurationModal after user selects a duration
  const handleConfirmPin = useCallback(async (durationMinutes: PinDurationMinutes) => {
    if (!currentChannel || !pinModalMessageId) return;
    await pinService.pinMessage(currentChannel.id, pinModalMessageId, durationMinutes);
    setPinnedCount(prev => prev + 1);
    // Sync local is_pinned flag immediately
    updateMessageField(pinModalMessageId, { is_pinned: true });
    // Refresh the active pin banner
    pinService.getActivePin(currentChannel.id).then(pin => setActivePin(pin)).catch(() => {});
    toast({ title: 'Message pinned' });
  }, [currentChannel, pinModalMessageId, toast, updateMessageField]);

  // Called from PinDurationModal's unpin button (for already-pinned messages)
  const handleModalUnpin = useCallback(async () => {
    if (!currentChannel || !pinModalMessageId) return;
    await pinService.unpinMessage(currentChannel.id, pinModalMessageId);
    setPinnedCount(prev => Math.max(0, prev - 1));
    updateMessageField(pinModalMessageId, { is_pinned: false });
    setActivePin(prev => (prev && prev.message.id === pinModalMessageId) ? null : prev);
    toast({ title: 'Message unpinned' });
  }, [currentChannel, pinModalMessageId, toast, updateMessageField]);

  const handleUnpinMessage = useCallback(async (messageId: number) => {
    if (!currentChannel) return;
    try {
      await pinService.unpinMessage(currentChannel.id, messageId);
      setPinnedCount(prev => Math.max(0, prev - 1));
      updateMessageField(messageId, { is_pinned: false });
      // Clear banner if it was this pin
      setActivePin(prev => (prev && prev.message.id === messageId) ? null : prev);
      toast({ title: 'Message unpinned' });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      toast({ title: 'Cannot unpin', description: msg, variant: 'destructive' });
    }
  }, [currentChannel, toast, updateMessageField]);

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

  const handleTranslateMessage = useCallback(async (msg: Message) => {
    try {
      const target = (typeof navigator !== 'undefined' && navigator.language?.split('-')[0]) || 'en';
      const res: any = await aiAgentService.translateMessage(msg.id, target);
      if (res && (res.translated_text || res.translation)) {
        const translated = res.translated_text || res.translation;
        setTranslationHistory(prev => [
          {
            message_id: msg.id,
            original: String(msg.content || ''),
            translated: String(translated),
            target_language: String(target),
            at: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 30));
        setAgentPanelTab('translations');
        setAgentPanelOpen(true);
      }
    } catch (e) {
      console.error('Translate failed', e);
    }
  }, []);

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

    // Show skeleton instantly for /summarize
    if (messageToSend.trim().toLowerCase().startsWith('/summarize')) {
      setIsGeneratingSummary(true);
      setEphemeralSummary(null);
      setDisplayedSummaryText('');
    }

    // Show skeleton instantly for /kb
    if (messageToSend.trim().toLowerCase().startsWith('/kb')) {
      setIsGeneratingKB(true);
      setEphemeralKBResult(null);
    }

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
        const idx = Math.min(selectedCommandIndex, availableCommands.length - 1);
        const selectedCommand = availableCommands[idx];
        if (!selectedCommand) {
          setShowCommandSuggestions(false);
          return;
        }
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

    // Show command suggestions while user types the command (before the first space)
    if (value.startsWith('/') && !value.includes(' ')) {
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
        className="h-12 flex items-center justify-between border-b shadow-sm relative z-10 backdrop-blur-md border-[hsl(var(--theme-border-default)/0.5)] transition-colors duration-300"
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

          {/* Summary History */}
          {currentChannel && (
            <button
              onClick={() => setSummaryHistoryOpen(prev => !prev)}
              className={`p-2 rounded-lg transition-colors relative ${
                summaryHistoryOpen
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]'
              }`}
              title="Summary History"
            >
              <BookOpen className="w-4 h-4" />
              {savedSummaries.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 bg-purple-500 text-white">
                  {savedSummaries.length}
                </span>
              )}
            </button>
          )}

          {/* Knowledge Base */}
          {currentChannel && (
            <button
              onClick={() => setKbPanelOpen(prev => !prev)}
              className={`p-2 rounded-lg transition-colors relative ${
                kbPanelOpen
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]'
              }`}
              title="Knowledge Base"
            >
              <Brain className="w-4 h-4" />
            </button>
          )}

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
          
          {/* Theme Toggle */}
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

      {/* Pinned Message Banner — fixed below header */}
      <PinnedMessageBanner
        pin={activePin}
        currentUserId={authUser?.id ?? null}
        onUnpin={handleUnpinMessage}
        onJumpToMessage={scrollToMessage}
      />

      {/* AI Agent Bar — only renders if at least one agent is active */}
      {currentChannel && (
        <div className="px-3 pt-2">
          <AgentBar
            channelId={currentChannel.id}
            channelName={currentChannel.name}
            communityId={currentCommunity?.id ?? null}
            onOpenPanel={(tab) => {
              setAgentPanelTab(tab);
              setAgentPanelOpen(true);
            }}
          />
        </div>
      )}

      {/* Messages */}
      <main
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto transition-colors duration-300 relative"
        style={{
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

                    {/* ── Bot / AI Agent Message ────────────────── */}
                    {msg.message_type === 'ai' ? (
                      <div
                        id={`msg-${msg.id}`}
                        className="group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-all duration-300"
                        onMouseEnter={() => setHoveredMessageId(msg.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        {/* Bot Avatar */}
                        <div className="absolute left-2 sm:left-4 mt-0.5">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-purple-500/80 to-blue-500/80 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.3)]">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 13 22h-2a7 7 0 0 1-6.73-3H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                              <circle cx="10" cy="15" r="1" fill="currentColor" />
                              <circle cx="14" cy="15" r="1" fill="currentColor" />
                            </svg>
                          </div>
                        </div>

                        {/* Bot Content */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-[15px] text-purple-400">
                              {((msg as any).author && String((msg as any).author).trim()) || 'AI Bot'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              BOT
                            </span>
                            <span className="text-[11px] ml-1 text-[hsl(var(--theme-text-muted))]">
                              {formatMessageTime(msg.created_at)}
                            </span>
                          </div>
                          <div className="p-4 rounded-xl border-l-[3px] border-l-purple-500/60 bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default))]">
                            <div className="text-[14px] leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (

                    /* ── Regular User Message ────────────────── */
                    <div 
                      id={`msg-${msg.id}`}
                      className={`group relative flex py-0.5 pr-4 sm:pr-12 pl-14 sm:pl-[72px] ${
                        shouldShowHeader ? 'mt-[17px]' : 'mt-0'
                      } ${
                        msg.is_pinned
                          ? 'bg-[hsl(var(--theme-accent-primary)/0.04)] border-l-2 border-l-[hsl(var(--theme-accent-primary)/0.5)] hover:bg-[hsl(var(--theme-accent-primary)/0.07)]'
                          : 'hover:bg-[hsl(var(--theme-bg-hover)/0.3)]'
                      } transition-all duration-300`}
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
                              <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-accent-primary))]" title="Pinned message">
                                <Pin className="w-3 h-3" />
                                <span className="text-[10px] font-medium leading-none">Pinned</span>
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
                        
                        {/* Moderation Warning Banner — visible to all */}
                        {msg.moderation && msg.moderation.action !== 'allow' && (
                          <ModerationWarningBanner
                            action={msg.moderation.action}
                            severity={msg.moderation.severity}
                            reasons={msg.moderation.reasons}
                            username={authorName}
                            violationCount={msg.moderation.violation_count}
                            maxViolations={3}
                            message={msg.moderation.message}
                            explanation={msg.moderation.explanation}
                          />
                        )}

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
                              handleTranslateMessage(msg);
                            }}
                            className="p-1.5 transition-colors text-[hsl(var(--theme-text-muted))] hover:text-cyan-400 hover:bg-[hsl(var(--theme-bg-hover))]"
                            title="Translate"
                          >
                            <Languages className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePinMessage(msg.id);
                            }}
                            className={`p-1.5 transition-colors rounded-r-md ${
                              msg.is_pinned
                                ? 'text-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-accent-primary)/0.08)] hover:bg-[hsl(var(--theme-accent-primary)/0.15)]'
                                : 'text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                            }`}
                            title={msg.is_pinned ? "View / Unpin" : "Pin Message"}
                          >
                            {msg.is_pinned
                              ? <PinOff className="w-4 h-4" />
                              : <Pin className="w-4 h-4" />
                            }
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
                    )}
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

            {/* Summary Skeleton Screen - Shows immediately when generating */}
            {isGeneratingSummary && (
              <div className="group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Bot Avatar — pulsing */}
                <div className="absolute left-2 sm:left-4 mt-0.5">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-purple-500/80 to-blue-500/80 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.3)] animate-pulse">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 13 22h-2a7 7 0 0 1-6.73-3H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                      <circle cx="10" cy="15" r="1" fill="currentColor" />
                      <circle cx="14" cy="15" r="1" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* Skeleton Content */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  {/* Header row — real name + badges */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[15px] text-purple-400">Summarizer Agent</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">BOT</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Only visible to you</span>
                  </div>

                  {/* Skeleton card — same shape as the real summary card */}
                  <div className="p-4 rounded-xl border-l-[3px] border-l-purple-500/40 bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default))]">
                    {/* Shimmer text lines */}
                    <div className="space-y-2.5">
                      <div className="h-3.5 w-[90%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" />
                      <div className="h-3.5 w-[75%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="h-3.5 w-[82%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" style={{ animationDelay: '300ms' }} />
                      <div className="h-3.5 w-[60%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" style={{ animationDelay: '450ms' }} />
                      <div className="h-3.5 w-[70%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" style={{ animationDelay: '600ms' }} />
                    </div>

                    {/* Shimmer footer row */}
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2.5 w-20 rounded bg-[hsl(var(--theme-text-muted)/0.08)] animate-pulse" />
                      <div className="h-2.5 w-2 rounded bg-[hsl(var(--theme-text-muted)/0.08)]" />
                      <div className="h-2.5 w-28 rounded bg-[hsl(var(--theme-text-muted)/0.08)] animate-pulse" style={{ animationDelay: '200ms' }} />
                    </div>
                  </div>

                  {/* Status line with animated dots */}
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-purple-400/70">
                    <span>Generating summary</span>
                    <div className="flex items-center gap-0.5">
                      <div className="w-1 h-1 rounded-full animate-bounce bg-purple-400" style={{ animationDelay: "0ms", animationDuration: "1s" }}></div>
                      <div className="w-1 h-1 rounded-full animate-bounce bg-purple-400" style={{ animationDelay: "200ms", animationDuration: "1s" }}></div>
                      <div className="w-1 h-1 rounded-full animate-bounce bg-purple-400" style={{ animationDelay: "400ms", animationDuration: "1s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ephemeral Summary Card (private, only visible to sender) */}
            {ephemeralSummary && (
              <div className="group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-all duration-300">
                {/* Bot Avatar */}
                <div className="absolute left-2 sm:left-4 mt-0.5">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-purple-500/80 to-blue-500/80 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.3)]">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 13 22h-2a7 7 0 0 1-6.73-3H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                      <circle cx="10" cy="15" r="1" fill="currentColor" />
                      <circle cx="14" cy="15" r="1" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* Bot Content */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[15px] text-purple-400">Summarizer Agent</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">BOT</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Only visible to you</span>
                    <span className="text-[11px] ml-1 text-[hsl(var(--theme-text-muted))]">
                      {formatMessageTime(ephemeralSummary.created_at)}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border-l-[3px] border-l-purple-500/60 bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default))]">
                    <div className="text-[14px] leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                      {displayedSummaryText}
                      {displayedSummaryText.length < ephemeralSummary.content.length && (
                        <span className="inline-block w-0.5 h-4 bg-purple-400 ml-0.5 animate-pulse" />
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-[hsl(var(--theme-text-muted))]">
                      <span>Method: {ephemeralSummary.method}</span>
                      <span>•</span>
                      <span>{ephemeralSummary.message_count} messages analyzed</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setEphemeralSummary(null); setDisplayedSummaryText(''); }}
                    className="mt-2 text-[11px] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Pending Scheduled Summaries (delivered when user enters channel) */}
            {pendingScheduledSummaries.map((sched) => (
              <div key={sched.id} className="group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-all duration-300">
                <div className="absolute left-2 sm:left-4 mt-0.5">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500/80 to-cyan-500/80 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.3)]">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 13 22h-2a7 7 0 0 1-6.73-3H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                      <circle cx="10" cy="15" r="1" fill="currentColor" />
                      <circle cx="14" cy="15" r="1" fill="currentColor" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[15px] text-blue-400">Summarizer Agent</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">SCHEDULED</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Only visible to you</span>
                    <span className="text-[11px] ml-1 text-[hsl(var(--theme-text-muted))]">
                      {formatMessageTime(sched.created_at)}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border-l-[3px] border-l-blue-500/60 bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default))]">
                    <div className="text-[14px] leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                      {sched.content}
                    </div>
                    {(sched.method || sched.message_count) && (
                      <div className="mt-3 flex items-center gap-3 text-[11px] text-[hsl(var(--theme-text-muted))]">
                        {sched.method && <span>Method: {sched.method}</span>}
                        {sched.method && sched.message_count && <span>•</span>}
                        {sched.message_count && <span>{sched.message_count} messages analyzed</span>}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setPendingScheduledSummaries(prev => prev.filter(s => s.id !== sched.id))}
                    className="mt-2 text-[11px] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}

            {/* KB Skeleton Screen — shows immediately when /kb is processing */}
            {isGeneratingKB && (
              <div className="group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="absolute left-2 sm:left-4 mt-0.5">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500/80 to-yellow-500/80 flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.3)] animate-pulse">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[15px] text-amber-400">Knowledge Builder</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">BOT</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Only visible to you</span>
                  </div>
                  <div className="p-4 rounded-xl border-l-[3px] border-l-amber-500/40 bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default))]">
                    <div className="space-y-2.5">
                      <div className="h-3.5 w-[85%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" />
                      <div className="h-3.5 w-[70%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="h-3.5 w-[78%] rounded-md bg-[hsl(var(--theme-text-muted)/0.12)] animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-amber-400/70">
                    <span>Extracting knowledge</span>
                    <div className="flex items-center gap-0.5">
                      <div className="w-1 h-1 rounded-full animate-bounce bg-amber-400" style={{ animationDelay: "0ms", animationDuration: "1s" }}></div>
                      <div className="w-1 h-1 rounded-full animate-bounce bg-amber-400" style={{ animationDelay: "200ms", animationDuration: "1s" }}></div>
                      <div className="w-1 h-1 rounded-full animate-bounce bg-amber-400" style={{ animationDelay: "400ms", animationDuration: "1s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ephemeral KB Result Card (private, only visible to sender) */}
            {ephemeralKBResult && (
              <div className="group relative flex py-2 pr-4 sm:pr-12 pl-14 sm:pl-[72px] mt-[17px] hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="absolute left-2 sm:left-4 mt-0.5">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500/80 to-yellow-500/80 flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.3)]">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[15px] text-amber-400">Knowledge Builder</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">BOT</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Only visible to you</span>
                    <span className="text-[11px] ml-1 text-[hsl(var(--theme-text-muted))]">
                      {formatMessageTime(ephemeralKBResult.created_at)}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border-l-[3px] border-l-amber-500/60 bg-[hsl(var(--theme-bg-secondary)/0.6)] border border-[hsl(var(--theme-border-default))]">
                    <div className="text-[14px] leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                      {ephemeralKBResult.content}
                    </div>
                    {ephemeralKBResult.subtype === 'extract' && (
                      <div className="mt-3 flex items-center gap-3 text-[11px] text-[hsl(var(--theme-text-muted))]">
                        <span>Method: {ephemeralKBResult.method}</span>
                        {ephemeralKBResult.total_items > 0 && (
                          <>
                            <span>•</span>
                            <span>{ephemeralKBResult.total_items} items saved</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setEphemeralKBResult(null)}
                    className="mt-2 text-[11px] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
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
          {showCommandSuggestions && availableCommands.length > 0 && (
            <div
              className="absolute bottom-full left-0 mb-2 w-full max-w-xs rounded-md shadow-xl border overflow-hidden z-50 backdrop-blur-xl bg-[hsl(var(--theme-bg-elevated)/0.95)] border-[hsl(var(--theme-border-default))]"
              style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
            >
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider border-b bg-[hsl(var(--theme-bg-secondary)/0.8)] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
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
                  className={`w-full px-2.5 py-1.5 text-left transition-colors ${
                    index === selectedCommandIndex
                      ? "bg-[hsl(var(--theme-accent-primary)/0.18)]"
                      : "hover:bg-[hsl(var(--theme-bg-hover))]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className={`w-3.5 h-3.5 shrink-0 ${
                      index === selectedCommandIndex
                        ? "text-[hsl(var(--theme-accent-primary))]"
                        : "text-[hsl(var(--theme-text-muted))]"
                    }`} />
                    <div className="flex-1 min-w-0 flex items-baseline gap-2">
                      <span className={`font-medium text-[12px] tabular-nums ${
                        index === selectedCommandIndex
                          ? "text-[hsl(var(--theme-accent-primary))]"
                          : "text-[hsl(var(--theme-text-primary))]"
                      }`}>
                        {cmd.command}
                      </span>
                      <span className="truncate text-[11px] text-[hsl(var(--theme-text-muted))]">
                        {cmd.description}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              <div className="px-2.5 py-1 text-[10px] border-t flex items-center gap-2 bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
                <span><kbd className="px-1 py-0 rounded text-[9px] bg-[hsl(var(--theme-bg-tertiary))]">↑↓</kbd> nav</span>
                <span><kbd className="px-1 py-0 rounded text-[9px] bg-[hsl(var(--theme-bg-tertiary))]">Tab</kbd> select</span>
                <span><kbd className="px-1 py-0 rounded text-[9px] bg-[hsl(var(--theme-bg-tertiary))]">Esc</kbd> close</span>
              </div>
            </div>
          )}

          {/* Quick reply chips — last inbound message in the channel */}
          {currentChannel && (
            <QuickReplyChips
              lastMessage={(() => {
                for (let i = messages.length - 1; i >= 0; i--) {
                  const m: any = messages[i];
                  if (m && m.sender_id !== authUser?.id && m.message_type !== 'ai' && m.content) {
                    return String(m.content).slice(0, 300);
                  }
                }
                return null;
              })()}
              enabled={!!currentChannel}
              onPick={(text) => {
                setMessage(prev => (prev ? `${prev} ${text}` : text));
                inputRef.current?.focus();
              }}
            />
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
          canManagePins={false}
          currentUserId={authUser?.id}
        />
      )}

      {/* --- Summary History Panel --- */}
      {summaryHistoryOpen && currentChannel && (
        <div className="fixed inset-y-0 right-0 w-[380px] z-50 flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-l border-[hsl(var(--theme-border-default)/0.5)] shadow-2xl animate-in slide-in-from-right duration-200">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--theme-border-default)/0.3)]">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Summary History</h3>
              <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
                #{currentChannel.name}
              </span>
            </div>
            <button
              onClick={() => setSummaryHistoryOpen(false)}
              className="p-1.5 rounded-md hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {savedSummaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="w-8 h-8 text-[hsl(var(--theme-text-muted)/0.3)] mb-3" />
                <p className="text-sm text-[hsl(var(--theme-text-muted))]">No summaries yet</p>
                <p className="text-[11px] text-[hsl(var(--theme-text-muted)/0.7)] mt-1">Type /summarize in the chat to generate one</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedSummaries.map((s) => (
                  <div key={s.id} className="group rounded-xl border border-[hsl(var(--theme-border-default)/0.3)] bg-[hsl(var(--theme-bg-secondary)/0.4)] overflow-hidden">
                    {/* Summary header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--theme-border-default)/0.15)]">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-purple-400">
                          {s.method === 'gemini' ? 'AI' : 'Extractive'}
                        </span>
                        <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
                          {s.message_count} msgs
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
                          {s.created_at ? new Date(s.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <button
                          onClick={async () => {
                            try {
                              await aiAgentService.deleteMySummary(s.id);
                              setSavedSummaries(prev => prev.filter(x => x.id !== s.id));
                            } catch { /* ignore delete error */ }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-[hsl(var(--theme-text-muted))] hover:text-red-400 transition-all"
                          title="Delete summary"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {/* Summary content */}
                    <div className="px-3 py-2.5 text-[12px] leading-[1.6] text-[hsl(var(--theme-text-secondary))] whitespace-pre-line max-h-[200px] overflow-y-auto">
                      {s.summary}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Agent Insights Panel (Knowledge / Summary / Mood / Focus / Translations) --- */}
      {currentChannel && (
        <AgentResultPanel
          open={agentPanelOpen || kbPanelOpen}
          onClose={() => { setAgentPanelOpen(false); setKbPanelOpen(false); }}
          channelId={currentChannel.id}
          channelName={currentChannel.name}
          communityId={currentCommunity?.id ?? null}
          initialTab={kbPanelOpen ? 'knowledge' : agentPanelTab}
          translations={translationHistory}
        />
      )}

      {/* --- Pin Duration / Unpin Modal --- */}
      <PinDurationModal
        isOpen={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setPinModalMessageId(null); setPinModalContext(undefined); }}
        onConfirm={handleConfirmPin}
        onUnpin={handleModalUnpin}
        messagePreview={pinModalPreview}
        pinContext={pinModalContext}
        currentUserId={authUser?.id ?? null}
      />

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
