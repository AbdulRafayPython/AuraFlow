// REWRITE: ~2k-line page holding chat, composer, command picker and agent UI; split into components/hooks.
// pages/Dashboard.tsx - Professional Real-time Version with Theme Support
import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Search, Hash, Paperclip, Bot, WifiOff, Plus, Mic, SmilePlus, X, Reply, Pin, PinOff, Radio, BookOpen, Trash2, Languages, Users } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useVoice } from "@/contexts/VoiceContext";
import { getAvatarUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import EmojiPickerButton from "@/components/EmojiPickerButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ReactionPicker from "@/components/ReactionPicker";
import { MessageRow, DayDivider, RepliesLink, NewMessagesLine, NewMessagesBar } from "@/components/chat/MessageRow";
import { MessageListSkeleton } from "@/components/chat/MessageListSkeleton";
import { MessageToolbar } from "@/components/chat/MessageToolbar";
import { Composer } from "@/components/chat/Composer";
import { ThreadPane, type ThreadMessage } from "@/components/chat/ThreadPane";
import { useRightPane } from "@/components/app/RightPane";
import { startsGroup, startsNewDay, formatDayLabel, indexReplies, firstUnreadId } from "@/lib/messageGrouping";
import { getRecentEmoji, recordEmoji } from "@/lib/emoji";
import MessageReactions from "@/components/MessageReactions";
import { ModerationBadge } from "@/components/ModerationBadge";
import { ModerationWarningBanner } from "@/components/ModerationWarningBanner";
import { reactionService } from "@/services/reactionService";
import { socket } from "@/socket";
import FileAttachment from "@/components/chat/FileAttachment";
import FileUploadPreview from "@/components/chat/FileUploadPreview";
import ReplyPreview from "@/components/chat/ReplyPreview";
import ReplyBar from "@/components/chat/ReplyBar";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import SystemEventMessage from "@/components/chat/SystemEventMessage";
import { uploadService, validateFile, type UploadProgress } from "@/services/uploadService";
import SearchModal from "@/components/search/SearchModal";
import UserProfilePopover from "@/components/profile/UserProfilePopover";
import PinnedMessagesPanel from "@/components/pins/PinnedMessagesPanel";
import PinDurationModal from "@/components/pins/PinDurationModal";
import type { PinModalContext } from "@/components/pins/PinDurationModal";
import PinnedMessageBanner, { type ActivePinData } from "@/components/pins/PinnedMessageBanner";
import { pinService, type PinDurationMinutes } from "@/services/pinService";
import { useAuth } from "@/contexts/AuthContext";
import AgentBar from "@/components/ai-agents/AgentBar";
import AgentMessageShell from "@/components/ai-agents/AgentMessageShell";
import AgentThinkingIndicator from "@/components/ai-agents/AgentThinkingIndicator";
import InlineApprovals from "@/components/ai-agents/InlineApprovals";
import MentionPopup from "@/components/chat/MentionPopup";
import { useMentionableAgents } from "@/hooks/useMentionableAgents";
import { applyMention, detectMention, filterMentionable } from "@/lib/agentBuilder";
import type { MentionableAgent } from "@/types/agentBuilder";
import { methodLabel } from "@/components/ai-agents/humanize";
import EngagementCard from "@/components/ai-agents/cards/EngagementCard";
import { AgentCardFrame } from "@/components/ai-agents/AgentMessageShell";
import { useOpenAgent } from "@/components/ai-agents/AgentDetailPane";
import { useMediaQuery } from "@/hooks/use-media-query";
import MemberList from "@/components/members/MemberList";
import AgentResultPanel, { AgentResultTab, TranslationHistoryItem } from "@/components/ai-agents/AgentResultPanel";
import ChannelInterventions from "@/components/ai-agents/ChannelInterventions";
import QuickReplyChips from "@/components/chat/QuickReplyChips";
import { friendService } from "@/services/friendService";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { aiAgentService } from "@/services/aiAgentService";
import type { Message } from "@/types";
import { useAutoTranslate } from "@/hooks/useAutoTranslate";
import InlineTranslation from "@/components/chat/InlineTranslation";
import LanguageMenu from "@/components/chat/LanguageMenu";
import type { SearchResult } from "@/services/searchService";

/**
 * Map the human-readable `author` field on AI bot messages back to the
 * canonical agent slug used by AgentMessageShell / AgentAccent. The backend
 * posts these via `_post_ai_bot_message(..., author='Summarizer Agent')` etc.,
 * so all we have at render time is the display string. Anything we don't
 * recognise falls back to `'assistant'` (community indigo) — the same default
 * AgentAccent uses for unknown agents.
 */
function agentSlugFromAuthor(author: unknown): string {
  const s = (typeof author === 'string' ? author : '').toLowerCase().trim();
  if (!s) return 'assistant';
  if (s.includes('summariz')) return 'summarizer';
  if (s.includes('knowledge')) return 'knowledge_builder';
  if (s.includes('moderation')) return 'moderation';
  if (s.includes('wellness')) return 'wellness';
  if (s.includes('mood')) return 'mood_tracker';
  if (s.includes('focus')) return 'focus';
  if (s.includes('translat')) return 'translator';
  if (s.includes('support')) return 'support';
  if (s.includes('engagement')) return 'engagement';
  if (s.includes('welcome') || s.includes('auto')) return 'auto_message';
  return 'assistant';
}

/** 32px channel-header icon button: tooltip, aria-label, pressed state, optional count. */
function HeaderIconButton({ label, active, onClick, badge = 0, className, children }: {
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            active
              ? 'bg-[hsl(var(--theme-bg-active))] text-[hsl(var(--theme-text-primary))]'
              : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]'
          } ${className ?? ''}`}
        >
          {children}
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-xs font-semibold px-1 bg-[hsl(var(--theme-accent-primary))] text-white">
              {badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Dashboard() {
  const { currentTheme, setTheme, themes } = useTheme();
  const { user: authUser } = useAuth();
  const {
    isConnected,
    hasConnectedOnce,
    currentChannel,
    currentCommunity,
    channels,
    messages,
    sendMessage,
    sendTyping,
    typingUsers,
    thinkingAgents,
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
  const { open: openRightPane, close: closeRightPane, content: rightPaneContent } = useRightPane();
  const openAgent = useOpenAgent();
  const isWide = useMediaQuery('(min-width: 1024px)');
  // Member list column (Discord-style): remembered per browser, only on wide screens,
  // and it gives way while the right pane (thread, Aura, agent) is open.
  const isXl = useMediaQuery('(min-width: 1280px)');
  const [membersOpen, setMembersOpen] = useState(() => {
    try { return localStorage.getItem('auraflow:members-open') !== '0'; } catch { return true; }
  });
  const toggleMembers = () => setMembersOpen((open) => {
    try { localStorage.setItem('auraflow:members-open', open ? '0' : '1'); } catch { /* storage unavailable */ }
    return !open;
  });
  // Message whose replies are open in the right pane.
  const [threadParentId, setThreadParentId] = useState<number | null>(null);
  // Bumped after a reaction so the hover toolbar re-reads recent emoji.
  const [recentEmojiVersion, setRecentEmojiVersion] = useState(0);
  // Mobile-only: tap a message to reveal its action bar (iMessage-style).
  // Hover doesn't fire on touch, so on phones we use selectedMessageId instead.
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<number, any[]>>({});
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  // "@agent" autocomplete: caret tracks where the user is typing inside the input
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
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
  const { markChannelRead: markChRead, channels: unreadByChannel } = useUnreadCounts();
  // Unread count when this channel was opened (read before ChannelSidebar marks it read),
  // and the first message that was unread then. Drives the "New" line.
  const entryUnreadRef = useRef<{ channelId: number; count: number; firstId: number | null } | null>(null);

  // Pending skeleton for synchronous personal/channel agent commands
  // (/mood, /wellness, /focus). These run inside the HTTP request and their
  // result arrives as a toast or a bot message, so without this the user sees
  // nothing while the agent works. Shown on send, cleared when the request
  // resolves.
  const [pendingCommand, setPendingCommand] = useState<{ agent: string; label: string; displayName?: string } | null>(null);

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

  // Autonomous per-viewer inline translation. `translateLang` is the viewer's
  // target language ('off' disables it); defaults to the browser language so
  // foreign messages translate automatically. Persisted to localStorage.
  const [translateLang, setTranslateLang] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('auraflow_translate_lang');
      if (saved) return saved;
    } catch {
      /* localStorage unavailable — fall through to browser language */
    }
    return (typeof navigator !== 'undefined' && navigator.language?.split('-')[0]) || 'en';
  });
  useEffect(() => {
    try {
      localStorage.setItem('auraflow_translate_lang', translateLang);
    } catch {
      /* ignore persistence failures */
    }
  }, [translateLang]);

  // Mirror completed auto-translations into the Channel Intelligence
  // Translations tab so that surface stays consistent (deduped per message).
  const handleAutoTranslated = useCallback(
    (info: { messageId: number; original: string; translated: string; targetLang: string }) => {
      setTranslationHistory((prev) => {
        if (prev.some((t) => t.message_id === info.messageId && t.target_language === info.targetLang)) {
          return prev;
        }
        return [
          {
            message_id: info.messageId,
            original: info.original,
            translated: info.translated,
            target_language: info.targetLang,
            at: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 50);
      });
    },
    [],
  );

  const autoTranslate = useAutoTranslate(
    messages,
    translateLang,
    translateLang !== 'off',
    handleAutoTranslated,
  );

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
    { command: '/ask',       description: 'Ask Aura',                   usage: '/ask <question>' },
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

  const mentionableAgents = useMentionableAgents(currentCommunity?.id);
  const mention = detectMention(message, caret);
  const mentionOptions = mention ? filterMentionable(mentionableAgents, mention.query) : [];
  const mentionOpen = !!mention && mentionOptions.length > 0 && !mentionDismissed && !message.startsWith('/');

  const pickMention = (agent: MentionableAgent) => {
    if (!mention) return;
    const next = applyMention(message, mention, agent.username);
    setMessage(next.text);
    setCaret(next.caret);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

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
    if ((isGeneratingSummary || ephemeralSummary || pendingCommand) && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [isGeneratingSummary, ephemeralSummary, pendingCommand]);

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
          title: 'Auraflow AI Commands',
          description: String(data.message || '').replace(/[*`]/g, ''),
          duration: 12000,
        });
        return;
      }
      // Personal results (/mood, /wellness) are private to the requester and
      // carry a formatted `message` — surface them as a toast.
      if (data?.success && data?.message && (data.type === 'mood' || data.type === 'wellness')) {
        toast({
          title: data.type === 'mood' ? '🎭 Mood Analysis' : '💚 Wellness Check',
          description: String(data.message).replace(/[*`]/g, ''),
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
    markChRead(currentChannel.id, currentCommunity?.id);
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

  // Cmd/Ctrl+K is the global jump palette (AppShortcuts); its "Search messages" action lands here.
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener('auraflow:open-search', open);
    return () => window.removeEventListener('auraflow:open-search', open);
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
    recordEmoji(emoji);
    setRecentEmojiVersion((v) => v + 1);
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
    checkUnreadAbove();
    if (element.scrollTop === 0 && !isLoadingMessages) {
      loadMoreMessages();
    }
    // Dismiss the mobile tap-revealed action bar when the user scrolls.
    if (selectedMessageId !== null) setSelectedMessageId(null);
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

    // Show a calm skeleton for synchronous agent commands whose result is a
    // toast (/mood, /wellness) or a posted bot message (/focus, /support,
    // /ask, /translate, /extract) — otherwise the user gets no feedback while
    // the agent runs. Cleared in `finally`.
    const lowerCmd = messageToSend.trim().toLowerCase();
    if (lowerCmd.startsWith('/mood')) {
      setPendingCommand({ agent: 'mood_tracker', label: 'Analyzing your mood' });
    } else if (lowerCmd.startsWith('/wellness')) {
      setPendingCommand({ agent: 'wellness', label: 'Checking in on your wellbeing' });
    } else if (lowerCmd.startsWith('/focus')) {
      setPendingCommand({ agent: 'focus', label: 'Measuring channel focus' });
    } else if (lowerCmd.startsWith('/support')) {
      setPendingCommand({ agent: 'support', label: 'Searching the knowledge base', displayName: 'Support' });
    } else if (lowerCmd.startsWith('/ask')) {
      setPendingCommand({ agent: 'assistant', label: 'Thinking through your question', displayName: 'Aura' });
    } else if (lowerCmd.startsWith('/translate')) {
      setPendingCommand({ agent: 'translator', label: 'Translating', displayName: 'Translator' });
    } else if (lowerCmd.startsWith('/extract')) {
      setPendingCommand({ agent: 'knowledge_builder', label: 'Extracting knowledge', displayName: 'Knowledge Builder' });
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
      // The agent ran synchronously in the request — clear its skeleton now
      // that the result (toast / bot message) has been delivered.
      setPendingCommand(null);
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
    // "@agent" suggestions take the arrow/Tab/Enter/Esc keys while they are open
    if (mentionOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionOptions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        pickMention(mentionOptions[Math.min(mentionIndex, mentionOptions.length - 1)]);
        return;
      }
      if (e.key === "Escape") { setMentionDismissed(true); return; }
    }

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
    setCaret(e.target.selectionStart ?? value.length);
    setMentionIndex(0);
    setMentionDismissed(false);

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

  // Messages as rendered: slash-commands typed by the user are not shown.
  const visibleMessages = useMemo(
    () => messages.filter((m) => m.message_type !== 'text' || !m.content.startsWith('/')),
    [messages],
  );
  const replyIndex = useMemo(() => indexReplies(messages), [messages]);

  // "New messages" line: snapshot the unread count on channel change (render phase, before
  // the sidebar marks it read), then pin the first unread message once messages are loaded.
  if (currentChannel && entryUnreadRef.current?.channelId !== currentChannel.id) {
    entryUnreadRef.current = { channelId: currentChannel.id, count: unreadByChannel[currentChannel.id] || 0, firstId: null };
  }
  const entry = entryUnreadRef.current;
  if (entry && entry.firstId === null && entry.count > 0 && visibleMessages.length > 0) {
    entry.firstId = firstUnreadId(visibleMessages, entry.count, authUser?.id);
  }
  const quickEmoji = useMemo(() => getRecentEmoji(3), [recentEmojiVersion]);

  // "N new messages" bar: shown while the first unread message is above the viewport,
  // until it is scrolled into view or marked read.
  const [unreadAbove, setUnreadAbove] = useState(false);
  const [newBarDismissed, setNewBarDismissed] = useState<number | null>(null);
  const checkUnreadAbove = useCallback(() => {
    const id = entryUnreadRef.current?.firstId;
    const container = messagesContainerRef.current;
    const el = id != null ? document.getElementById(`msg-${id}`) : null;
    setUnreadAbove(!!el && !!container && el.getBoundingClientRect().top < container.getBoundingClientRect().top);
  }, []);
  useEffect(() => {
    // After the list renders and auto-scrolls to the bottom.
    const t = setTimeout(checkUnreadAbove, 300);
    return () => clearTimeout(t);
  }, [visibleMessages.length, currentChannel?.id, checkUnreadAbove]);
  const firstUnreadMsg = entry?.firstId != null ? visibleMessages.find((m) => m.id === entry.firstId) : undefined;
  const showNewBar = !!currentChannel && !!firstUnreadMsg && unreadAbove && newBarDismissed !== currentChannel.id;

  const openThread = (id: number) => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setThreadParentId(id);
    } else {
      // The right pane is desktop-only: on small screens jump to the first reply instead.
      const first = replyIndex.get(id)?.[0];
      if (first) scrollToMessage(first);
    }
  };

  // Keep the right-pane thread in sync with the loaded messages.
  useEffect(() => {
    if (threadParentId == null) return;
    const parent = messages.find((m) => m.id === threadParentId);
    if (!parent) return;
    const toThread = (m: any): ThreadMessage => ({
      id: m.id,
      authorName: m.author || 'Unknown User',
      avatarUrl: m.avatar_url,
      username: m.author,
      timeLabel: formatMessageTime(m.created_at),
      content: m.attachment ? String(m.content || '').replace(m.attachment.file_url, '').trim() : String(m.content || ''),
      attachmentName: m.attachment?.file_name,
    });
    openRightPane({
      key: `thread-${threadParentId}`,
      title: 'Thread',
      onClose: () => setThreadParentId(null),
      body: (
        <ThreadPane
          parent={toThread(parent)}
          replies={messages.filter((m) => m.reply_to_preview?.id === threadParentId).map(toThread)}
          onReply={() => handleReply(parent)}
          onJump={scrollToMessage}
        />
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParentId, messages]);

  const agentForAuthor = (author?: string | null) => {
    const name = String(author || '').trim().toLowerCase();
    if (!name) return undefined;
    return mentionableAgents.find((a) => a.name.toLowerCase() === name || a.username.toLowerCase() === name);
  };

  // Aura / Channel intelligence lives in the right pane on desktop.
  const auraOpen = agentPanelOpen || kbPanelOpen;
  const isCommunityAdmin = currentCommunity?.role === 'admin' || currentCommunity?.role === 'owner';
  useEffect(() => {
    if (!isWide || !auraOpen || !currentChannel) return;
    openRightPane({
      key: 'aura',
      title: 'Aura',
      onClose: () => { setAgentPanelOpen(false); setKbPanelOpen(false); },
      body: (
        <AgentResultPanel
          embedded
          open
          onClose={() => { setAgentPanelOpen(false); setKbPanelOpen(false); }}
          channelId={currentChannel.id}
          channelName={currentChannel.name}
          communityId={currentCommunity?.id ?? null}
          initialTab={kbPanelOpen ? 'knowledge' : agentPanelTab}
          isAdmin={isCommunityAdmin}
          translations={translationHistory}
        />
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWide, auraOpen, kbPanelOpen, agentPanelTab, currentChannel?.id, translationHistory]);

  // The pane was closed from elsewhere (e.g. a thread replaced it).
  useEffect(() => {
    if (!auraOpen && rightPaneContent?.key === 'aura') closeRightPane();
  }, [auraOpen, rightPaneContent?.key, closeRightPane]);

  // Leaving the channel (or the page) closes its thread.
  useEffect(() => {
    setThreadParentId(null);
    closeRightPane();
  }, [currentChannel?.id, closeRightPane]);
  useEffect(() => () => closeRightPane(), [closeRightPane]);

  return (
    <div 
      className="flex flex-col h-full transition-colors duration-300 relative"
      style={{ background: 'var(--theme-bg-gradient)' }}
    >
      {/* Voice Channel — now handled by VoiceDock + VoiceRoomModal at App level */}
      {currentChannel?.type === 'voice' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'hsl(var(--theme-bg-primary))' }}>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center bg-[hsl(var(--theme-accent-primary)/0.1)]">
              <Radio className="w-8 h-8 text-[hsl(var(--theme-text-accent))]" />
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
              className="text-sm text-[hsl(var(--theme-text-accent))] hover:underline"
            >
              Go to a text channel
            </button>
          </div>
        </div>
      )}

      {/* Header - Discord Style with Theme Support */}
      <header
        className="h-12 flex items-center justify-between gap-2 border-b relative z-10 border-[hsl(var(--theme-border-default))]"
        style={{ background: 'hsl(var(--theme-header-bg))' }}
      >
        <div className="flex items-center h-full min-w-0 flex-1">
          {/* Channel Info */}
          <div className="flex items-center gap-2 pl-14 md:pl-4 pr-4 h-full shrink-0">
            <div className="flex items-center justify-center w-6 h-6 text-[hsl(var(--theme-text-secondary))]">
              {currentChannel?.type === 'voice' ? (
                <Mic className="w-5 h-5" />
              ) : (
                <Hash className="w-5 h-5" />
              )}
            </div>
            <h2 className="text-base font-semibold truncate max-w-[24ch] text-[hsl(var(--theme-text-primary))]">
              {currentChannel?.name || "Select a channel"}
            </h2>
          </div>
          
          {/* Channel Description - hidden on mobile */}
          {currentChannel?.description && (
            <div className="hidden sm:flex items-center gap-3 pr-4 h-full min-w-0 flex-1">
              <div className="w-px h-4 shrink-0 bg-[hsl(var(--theme-border-default))]" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="min-w-0 flex-1 truncate text-sm text-[hsl(var(--theme-text-muted))]">
                    {currentChannel.description}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-sm whitespace-pre-wrap">
                  {currentChannel.description}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Connection Status - Subtle. Hidden entirely during the very
              first (normal, harmless) socket handshake on page load — only
              shown once connected, or if a connection that existed before
              actually drops. Nothing to alarm the user about before then. */}
          {hasConnectedOnce && !isConnected && (
            <div className="ml-2 flex shrink-0 items-center gap-1 px-2 text-destructive" role="status">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="text-xs">Reconnecting...</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2 pr-2 sm:pr-4">
          {/* Pinned Messages */}
          {currentChannel && (
            <HeaderIconButton
              label="Pinned messages"
              active={pinsOpen}
              onClick={() => setPinsOpen(prev => !prev)}
              badge={pinnedCount}
            >
              <Pin className="w-4 h-4" />
            </HeaderIconButton>
          )}

          {/* Aura: panel + Assist actions + summaries / knowledge, one menu */}
          {currentChannel && (
            <AgentBar
              channelId={currentChannel.id}
              channelName={currentChannel.name}
              communityId={currentCommunity?.id ?? null}
              onOpenPanel={(tab) => {
                setAgentPanelTab(tab);
                setAgentPanelOpen(true);
              }}
              panelOpen={auraOpen}
              onTogglePanel={() => {
                if (auraOpen) { setAgentPanelOpen(false); setKbPanelOpen(false); }
                else { setAgentPanelTab(isCommunityAdmin ? 'activity' : 'recap'); setAgentPanelOpen(true); }
              }}
              summaryCount={savedSummaries.length}
              onOpenSummaryHistory={() => setSummaryHistoryOpen(true)}
              onOpenKnowledgeBase={() => setKbPanelOpen(true)}
            />
          )}

          {/* Auto-translate language (per-viewer inline translation) */}
          {currentChannel && (
            <LanguageMenu value={translateLang} onChange={setTranslateLang} />
          )}

          {/* Member list toggle */}
          {currentChannel && (
            <HeaderIconButton
              label={membersOpen ? 'Hide member list' : 'Show member list'}
              active={membersOpen}
              onClick={toggleMembers}
              className="hidden xl:flex"
            >
              <Users className="w-4 h-4" />
            </HeaderIconButton>
          )}

          {/* Search - Ctrl+K */}
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search messages"
            className="hidden md:flex min-w-0 shrink items-center gap-2 pl-2 pr-2 h-7 rounded-md text-sm transition-[width,colors] bg-[hsl(var(--theme-input-bg))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] w-40 focus-visible:w-56"
          >
            <span className="min-w-0 flex-1 truncate text-left text-sm">Search</span>
            <Search className="w-4 h-4 flex-shrink-0" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
      {/* Pinned Message Banner — fixed below header */}
      <PinnedMessageBanner
        pin={activePin}
        currentUserId={authUser?.id ?? null}
        onUnpin={handleUnpinMessage}
        onJumpToMessage={scrollToMessage}
      />

      {showNewBar && firstUnreadMsg && entry && (
        <NewMessagesBar
          count={entry.count}
          since={new Date(firstUnreadMsg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          onJump={() => scrollToMessage(firstUnreadMsg.id)}
          onMarkRead={() => setNewBarDismissed(currentChannel!.id)}
        />
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
        {isLoadingMessages && messages.length === 0 && <MessageListSkeleton />}
        {!currentChannel ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg px-4 sm:px-6">
              <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full mx-auto mb-5 flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                <Hash className="w-7 h-7 sm:w-10 sm:h-10 text-[hsl(var(--theme-text-muted))]" />
              </div>
              <h3 className="text-2xl font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
                Welcome to Auraflow
              </h3>
              <p className="text-base leading-relaxed text-[hsl(var(--theme-text-secondary))]">
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
              <p className="text-sm sm:text-base text-[hsl(var(--theme-text-secondary))]">
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
              <p className="text-base text-[hsl(var(--theme-text-secondary))]">
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
            <div className="flex-1" role="log" aria-label={`Messages in ${currentChannel?.name || 'channel'}`}>
              {visibleMessages.map((msg, index) => {
                const prevMsg = visibleMessages[index - 1];
                const showDateDivider = index !== 0 && startsNewDay(prevMsg, msg);
                // The "New" line starts a fresh group, so the first unread message has its header.
                const grouped = !startsGroup(prevMsg, msg) && entryUnreadRef.current?.firstId !== msg.id;
                const authorName = msg.author || "Unknown User";
                const replyCount = replyIndex.get(msg.id)?.length ?? 0;

                return (
                  <div key={`${msg.id}-${index}`}>
                    {showDateDivider && <DayDivider label={formatDayLabel(msg.created_at)} />}
                    {entryUnreadRef.current?.firstId === msg.id && <NewMessagesLine />}

                    {/* ── System Event Label (join / leave / remove / ban) ── */}
                    {msg.message_type === 'system' ? (
                      <SystemEventMessage
                        content={msg.content}
                        timestamp={formatMessageTime(msg.created_at)}
                      />
                    ) : msg.message_type === 'ai' ? (
                      <div id={`msg-${msg.id}`}>
                        <AgentMessageShell
                          agentName={agentSlugFromAuthor((msg as any).author)}
                          displayName={((msg as any).author && String((msg as any).author).trim()) || 'AI Bot'}
                          onOpenAgent={(() => {
                            const a = agentForAuthor((msg as any).author);
                            return a ? () => openAgent(a) : undefined;
                          })()}
                          timestamp={formatMessageTime(msg.created_at)}
                          grouped={grouped}
                          shortTimeLabel={new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        >
                          {msg.reply_to_preview && (
                            <ReplyPreview
                              preview={msg.reply_to_preview}
                              onClick={() => scrollToMessage(msg.reply_to_preview!.id)}
                            />
                          )}
                          {(msg as any).card ? (
                            <AgentCardFrame><EngagementCard card={(msg as any).card} messageId={msg.id} /></AgentCardFrame>
                          ) : (
                            <div className="text-ui leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                              {msg.content}
                            </div>
                          )}
                        </AgentMessageShell>
                      </div>
                    ) : (
                    /* ── Regular User Message ────────────────── */
                    <MessageRow
                      domId={`msg-${msg.id}`}
                      authorName={authorName}
                      avatarUrl={msg.avatar_url}
                      username={msg.author || authorName}
                      timeLabel={formatMessageTime(msg.created_at)}
                      shortTimeLabel={new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      grouped={grouped}
                      pinned={!!msg.is_pinned}
                      selected={isMobile && selectedMessageId === msg.id}
                      onAuthorClick={(e) => handleProfileClick(msg.author || authorName, e)}
                      onClick={() => {
                        if (!isMobile) return;
                        setSelectedMessageId((prev) => (prev === msg.id ? null : msg.id));
                      }}
                      headerExtra={
                        <>
                          {msg.is_blocked && (
                            <span className="rounded bg-destructive/15 px-1.5 text-xs font-semibold text-destructive">Removed</span>
                          )}
                          {msg.moderation && (
                            <ModerationBadge
                              action={msg.moderation.action}
                              severity={msg.moderation.severity}
                              reasons={msg.moderation.reasons}
                            />
                          )}
                        </>
                      }
                      reactions={
                        messageReactions[msg.id]?.length > 0 ? (
                          <MessageReactions
                            reactions={messageReactions[msg.id]}
                            onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                          />
                        ) : undefined
                      }
                      footer={replyCount > 0 ? <RepliesLink count={replyCount} onClick={() => openThread(msg.id)} /> : undefined}
                      toolbar={
                        <MessageToolbar
                          quickEmoji={quickEmoji}
                          visible={isMobile && selectedMessageId === msg.id}
                          onReact={(emoji) => handleReactionToggle(msg.id, emoji)}
                          onOpenPicker={() => setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id)}
                          actions={[
                            { key: 'reply', label: 'Reply', icon: Reply, onClick: () => handleReply(msg) },
                            { key: 'translate', label: 'Translate', icon: Languages, onClick: () => handleTranslateMessage(msg) },
                            {
                              key: 'pin',
                              label: msg.is_pinned ? 'View / unpin' : 'Pin message',
                              icon: msg.is_pinned ? PinOff : Pin,
                              active: !!msg.is_pinned,
                              onClick: () => handlePinMessage(msg.id),
                            },
                          ]}
                        />
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
                      {/* Show Removed tag even when the header is hidden */}
                      {grouped && msg.is_blocked && (
                        <span className="mr-2 rounded bg-destructive/15 px-1.5 text-xs font-semibold text-destructive">Removed</span>
                      )}
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
                          <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(displayContent.trim()) ? 'text-4xl leading-tight' : ''}>
                            {displayContent}
                          </span>
                        );
                      })()}

                      {/* Autonomous inline translation (per-viewer) */}
                      {translateLang !== 'off' && msg.content && (
                        <InlineTranslation
                          state={autoTranslate.get(msg.id)}
                          targetLang={translateLang}
                          collapsed={autoTranslate.isCollapsed(msg.id)}
                          onToggle={() => autoTranslate.toggleCollapsed(msg.id)}
                        />
                      )}

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
                    </MessageRow>
                    )}
                  </div>
                );
              })}

            </div>

            {/* Typing Indicators - Discord Style */}
            {typingUsers.length > 0 && (
              <div className="flex h-6 items-center gap-2 px-4 text-sm text-muted-foreground" role="status">
                <span>
                  <strong>{typingUsers.map((u) => u.username).join(", ")}</strong>
                  {typingUsers.length === 1 ? " is typing…" : " are typing…"}
                </span>
              </div>
            )}

            {/* Agent runs in flight for this channel */}
            <AgentThinkingIndicator agents={thinkingAgents.filter((a) => a.channelId === currentChannel?.id)} />

            {/* Things an agent is waiting to do in this channel, for the person who asked */}
            <InlineApprovals channelId={currentChannel?.id} />

            {/* Summary Skeleton Screen - Shows immediately when generating */}
            {isGeneratingSummary && (
              <AgentMessageShell
                agentName="summarizer"
                isPrivate
                variant="skeleton"
                skeletonLabel="Generating summary"
              />
            )}

            {/* Ephemeral Summary Card (private, only visible to sender) */}
            {ephemeralSummary && (
              <AgentMessageShell
                agentName="summarizer"
                isPrivate
                timestamp={formatMessageTime(ephemeralSummary.created_at)}
                onDismiss={() => { setEphemeralSummary(null); setDisplayedSummaryText(''); }}
              >
                <div className="text-ui leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                  {displayedSummaryText}
                  {displayedSummaryText.length < ephemeralSummary.content.length && (
                    <span
                      className="inline-block w-0.5 h-4 ml-0.5 align-middle"
                      style={{ backgroundColor: 'hsl(var(--agent-accent-community))' }}
                    />
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                  <span>Method: {methodLabel(ephemeralSummary.method)}</span>
                  <span>•</span>
                  <span>{ephemeralSummary.message_count} messages analyzed</span>
                </div>
              </AgentMessageShell>
            )}

            {/* Pending Scheduled Summaries (delivered when user enters channel) */}
            {pendingScheduledSummaries.map((sched) => (
              <div key={sched.id}>
                <AgentMessageShell
                  agentName="summarizer"
                  isScheduled
                  isPrivate
                  timestamp={formatMessageTime(sched.created_at)}
                  onDismiss={() => setPendingScheduledSummaries(prev => prev.filter(s => s.id !== sched.id))}
                >
                  <div className="text-ui leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                    {sched.content}
                  </div>
                  {(sched.method || sched.message_count) && (
                    <div className="mt-3 flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                      {sched.method && <span>Method: {methodLabel(sched.method)}</span>}
                      {sched.method && sched.message_count && <span>•</span>}
                      {sched.message_count && <span>{sched.message_count} messages analyzed</span>}
                    </div>
                  )}
                </AgentMessageShell>
              </div>
            ))}

            {/* KB Skeleton Screen — shows immediately when /kb is processing */}
            {isGeneratingKB && (
              <AgentMessageShell
                agentName="knowledge_builder"
                displayName="Knowledge Builder"
                isPrivate
                variant="skeleton"
                skeletonLabel="Extracting knowledge"
              />
            )}

            {/* Skeleton for synchronous agent commands (/mood, /wellness,
                /focus, /support, /ask, /translate, /extract) */}
            {pendingCommand && (
              <AgentMessageShell
                agentName={pendingCommand.agent}
                displayName={pendingCommand.displayName}
                isPrivate={['mood_tracker', 'wellness'].includes(pendingCommand.agent)}
                variant="skeleton"
                skeletonLabel={pendingCommand.label}
              />
            )}

            {/* Ephemeral KB Result Card (private, only visible to sender) */}
            {ephemeralKBResult && (
              <AgentMessageShell
                agentName="knowledge_builder"
                displayName="Knowledge Builder"
                isPrivate
                timestamp={formatMessageTime(ephemeralKBResult.created_at)}
                onDismiss={() => setEphemeralKBResult(null)}
              >
                <div className="text-ui leading-[1.5] whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                  {ephemeralKBResult.content}
                </div>
                {ephemeralKBResult.subtype === 'extract' && (
                  <div className="mt-3 flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
                    <span>Method: {methodLabel(ephemeralKBResult.method)}</span>
                    {ephemeralKBResult.total_items > 0 && (
                      <>
                        <span>•</span>
                        <span>{ephemeralKBResult.total_items} items saved</span>
                      </>
                    )}
                  </div>
                )}
              </AgentMessageShell>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </main>

      {/* Input - Discord Style */}
      {currentChannel?.type !== 'voice' && (
      <footer 
        className="px-4 pb-16 md:pb-6 pt-0 relative transition-colors duration-300"
        
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

          {/* @agent suggestions */}
          {mentionOpen && (
            <MentionPopup agents={mentionOptions} activeIndex={mentionIndex} onPick={pickMention} onHover={setMentionIndex} />
          )}

          {/* Command Suggestions Dropdown */}
          {showCommandSuggestions && availableCommands.length > 0 && (
            <div
              className="absolute bottom-full left-0 mb-2 w-full max-w-xs rounded-lg shadow-popover border overflow-hidden z-50 bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]"
              style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
            >
              <div className="px-2.5 py-1 text-xs font-medium border-b bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
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
                        ? "text-[hsl(var(--theme-text-accent))]"
                        : "text-[hsl(var(--theme-text-muted))]"
                    }`} />
                    <div className="flex-1 min-w-0 flex items-baseline gap-2">
                      <span className={`font-medium text-xs tabular-nums ${
                        index === selectedCommandIndex
                          ? "text-[hsl(var(--theme-text-accent))]"
                          : "text-[hsl(var(--theme-text-primary))]"
                      }`}>
                        {cmd.command}
                      </span>
                      <span className="truncate text-xs text-[hsl(var(--theme-text-muted))]">
                        {cmd.description}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              <div className="px-2.5 py-1 text-xs border-t flex items-center gap-2 bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
                <span><kbd className="px-1 py-0 rounded text-xs bg-[hsl(var(--theme-bg-tertiary))]">↑↓</kbd> nav</span>
                <span><kbd className="px-1 py-0 rounded text-xs bg-[hsl(var(--theme-bg-tertiary))]">Tab</kbd> select</span>
                <span><kbd className="px-1 py-0 rounded text-xs bg-[hsl(var(--theme-bg-tertiary))]">Esc</kbd> close</span>
              </div>
            </div>
          )}

          {/* F2 — pinned inline interventions (support / recap / focus drift) */}
          {currentChannel && (
            <ChannelInterventions
              channelId={currentChannel.id}
              onOpenPanel={(tab) => {
                setAgentPanelTab(tab as AgentResultTab);
                setAgentPanelOpen(true);
              }}
              onRecenter={() => {
                setAgentPanelTab('focus' as AgentResultTab);
                setAgentPanelOpen(true);
              }}
            />
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

          {/* Sending/uploading go over plain HTTP, not the socket, so none of the
              compose controls wait on isConnected: that only gates real-time
              delivery to OTHER users, not your own ability to type and send. */}
          <Composer
            value={message}
            onChange={handleInputChange}
            onValueChange={setMessage}
            onSend={handleSendMessage}
            canSend={(message.trim().length > 0 || !!pendingFile) && !!currentChannel}
            inputRef={inputRef}
            inputProps={{
              onKeyDown: handleKeyDown,
              onSelect: (e) => setCaret(e.currentTarget.selectionStart ?? 0),
            }}
            placeholder={
              message.startsWith('/')
                ? "Type a command..."
                : currentChannel
                  ? `Message #${currentChannel.name}`
                  : "Select a channel to start messaging"
            }
            disabled={!currentChannel || isSending}
            commandMode={message.startsWith('/')}
            onAttach={() => fileInputRef.current?.click()}
            trailing={
              <>
                <EmojiPickerButton
                  onEmojiSelect={handleEmojiSelect}
                  pickerPosition="top"
                  disabled={!currentChannel}
                />
                <VoiceRecorder
                  onSend={handleVoiceSend}
                  disabled={!currentChannel}
                />
              </>
            }
          />

          {/* Only warn about a dropped connection if we were actually
              connected before — never during the initial handshake, and
              sending/uploading still work over HTTP regardless. This is
              informational, not blocking. */}
          {hasConnectedOnce && !isConnected && (
            <div className="mt-2 flex items-center gap-2 text-xs text-destructive" role="status">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Realtime connection lost — messages still send, but live updates may lag until it reconnects.</span>
            </div>
          )}
        </div>
      </footer>
      )}
      </div>

      {currentChannel && membersOpen && isXl && !rightPaneContent && (
        <MemberList
          communityId={currentCommunity?.id}
          onSelectMember={(username, rect) => setProfilePopover({ username, rect })}
        />
      )}
      </div>



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
        <div className="fixed inset-y-0 right-0 w-full sm:w-[380px] z-50 flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-l border-[hsl(var(--theme-border-default)/0.5)] shadow-2xl animate-in slide-in-from-right duration-200 pt-safe pb-safe">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--theme-border-default)/0.3)]">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Summary History</h3>
              <span className="text-xs text-[hsl(var(--theme-text-muted))]">
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
                <p className="text-xs text-[hsl(var(--theme-text-muted)/0.7)] mt-1">Type /summarize in the chat to generate one</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedSummaries.map((s) => (
                  <div key={s.id} className="group rounded-xl border border-[hsl(var(--theme-border-default)/0.3)] bg-[hsl(var(--theme-bg-secondary)/0.4)] overflow-hidden">
                    {/* Summary header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--theme-border-default)/0.15)]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-purple-400">
                          {methodLabel(s.method)}
                        </span>
                        <span className="text-xs text-[hsl(var(--theme-text-muted))]">
                          {s.message_count} msgs
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[hsl(var(--theme-text-muted))]">
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
                    <div className="px-3 py-2.5 text-xs leading-[1.6] text-[hsl(var(--theme-text-secondary))] whitespace-pre-line max-h-[200px] overflow-y-auto">
                      {s.summary}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Channel Intelligence rail (Activity / Recap / Knowledge / Focus / Translations / Safety) --- */}
      {currentChannel && !isWide && (
        <AgentResultPanel
          open={agentPanelOpen || kbPanelOpen}
          onClose={() => { setAgentPanelOpen(false); setKbPanelOpen(false); }}
          channelId={currentChannel.id}
          channelName={currentChannel.name}
          communityId={currentCommunity?.id ?? null}
          initialTab={kbPanelOpen ? 'knowledge' : agentPanelTab}
          isAdmin={currentCommunity?.role === 'admin' || currentCommunity?.role === 'owner'}
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
