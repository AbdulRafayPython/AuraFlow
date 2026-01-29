// pages/Dashboard.tsx - Professional Real-time Version with Theme Support
import { useState, useRef, useEffect } from "react";
import { Search, Settings, Hash, Paperclip, Smile, Bot, Sun, Moon, Send, Wifi, WifiOff, Plus, Mic, SmilePlus, X, Palette } from "lucide-react";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useVoice } from "@/contexts/VoiceContext";
import { getAvatarUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import VoiceChannelView from "@/components/VoiceChannelView";
import EmojiPickerButton from "@/components/EmojiPickerButton";
import ReactionPicker from "@/components/ReactionPicker";
import MessageReactions from "@/components/MessageReactions";
import { ModerationBadge } from "@/components/ModerationBadge";
import NotificationButton from "@/components/NotificationButton";
import { reactionService } from "@/services/reactionService";
import { socket } from "@/socket";
import { SocketDebugPanel } from "@/components/SocketDebugPanel";

interface DashboardProps {
  toggleRightSidebar?: () => void;
}

export default function Dashboard({ toggleRightSidebar }: DashboardProps) {
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

  // Load reactions for messages - only when message IDs change
  useEffect(() => {
    const loadReactions = async () => {
      if (messages.length === 0) return;
      
      const reactions: Record<number, any[]> = {};
      
      // Only load reactions for new messages
      for (const msg of messages) {
        // Skip if we already have reactions for this message
        if (messageReactions[msg.id]) {
          reactions[msg.id] = messageReactions[msg.id];
          continue;
        }
        
        try {
          const { reactions: msgReactions } = await reactionService.getMessageReactions(msg.id);
          if (msgReactions && msgReactions.length > 0) {
            reactions[msg.id] = msgReactions;
          }
        } catch (error) {
          console.error(`Failed to load reactions for message ${msg.id}:`, error);
        }
      }
      setMessageReactions(reactions);
    };
    
    if (messages.length > 0) {
      loadReactions();
    }
  }, [messages.length]); // Only depend on length, not full array

  // Socket.IO reaction listeners
  useEffect(() => {
    const handleReactionAdded = (data: any) => {
      setMessageReactions(prev => ({
        ...prev,
        [data.message_id]: data.reactions
      }));
    };

    const handleReactionRemoved = (data: any) => {
      setMessageReactions(prev => ({
        ...prev,
        [data.message_id]: data.reactions
      }));
    };

    socket.on('message_reaction_added', handleReactionAdded);
    socket.on('message_reaction_removed', handleReactionRemoved);

    return () => {
      socket.off('message_reaction_added', handleReactionAdded);
      socket.off('message_reaction_removed', handleReactionRemoved);
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

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleReactionToggle = async (messageId: number, emoji: string) => {
    try {
      await reactionService.toggleMessageReaction(messageId, emoji);
      
      // Immediately reload reactions for this message to ensure consistency
      const { reactions: updatedReactions } = await reactionService.getMessageReactions(messageId);
      
      // Update state with fresh data from server (prevents duplicates)
      setMessageReactions(prev => {
        const newState = { ...prev };
        if (updatedReactions && updatedReactions.length > 0) {
          newState[messageId] = updatedReactions;
        } else {
          // Remove from state if no reactions left
          delete newState[messageId];
        }
        return newState;
      });
    } catch (error) {
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

  const handleSendMessage = async () => {
    if (!message.trim() || isSending || !currentChannel) return;

    const messageToSend = message;
    setMessage("");
    setIsSending(true);

    try {
      const response = await sendMessage(messageToSend);
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
      
      {/* Voice Channel View */}
      {currentChannel?.type === 'voice' && (
        <div className="absolute inset-0 z-50">
          <VoiceChannelView
            channelId={currentChannel.id}
            channelName={currentChannel.name}
            onClose={() => {
              // Find first text channel and switch to it
              const textChannel = channels.find(ch => ch.type === 'text');
              if (textChannel) {
                selectChannel(textChannel.id);
              }
            }}
          />
        </div>
      )}

      {/* Header - Discord Style with Theme Support */}
      <header
        className="h-12 flex items-center justify-between border-b shadow-sm relative z-30 backdrop-blur-md border-[hsl(var(--theme-border-default)/0.5)] transition-colors duration-300"
        style={{ background: 'hsl(var(--theme-header-bg) / 0.85)' }}
      >
        <div className="flex items-center h-full">
          {/* Channel Info */}
          <div className="flex items-center gap-2 px-4 h-full border-r border-[hsl(var(--theme-border-default)/0.4)]">
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
          
          {/* Channel Description */}
          {currentChannel?.description && (
            <div className="flex items-center gap-3 px-4 h-full">
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

        <div className="flex items-center gap-2">
          <div className="hidden md:block relative">
            <input
              type="text"
              placeholder="Search messages..."
              className="pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] w-56 border transition-all bg-[hsl(var(--theme-input-bg))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[hsl(var(--theme-text-muted))]" />
          </div>
          
          {/* Notifications */}
          <NotificationButton />
          
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          {/* Only show AI Agents button when a community is selected */}
          {currentCommunity && toggleRightSidebar && (
            <button
              onClick={toggleRightSidebar}
              className="p-2 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
              title="Toggle AI Agents"
            >
              <Bot className="w-4 h-4" />
            </button>
          )}
          
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
            <div className="text-center max-w-lg px-6">
              <div className="w-[72px] h-[72px] rounded-full mx-auto mb-5 flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                <Hash className="w-10 h-10 text-[hsl(var(--theme-text-muted))]" />
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
              <h3 className="text-[32px] font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
                Welcome to #{currentChannel.name}!
              </h3>
              <p className="text-[15px] text-[hsl(var(--theme-text-secondary))]">
                This is the start of the <span className="font-semibold">#{currentChannel.name}</span> channel.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            {/* Channel Welcome Header */}
            <div className="px-4 pt-6 pb-4">
              <div className="w-[68px] h-[68px] rounded-full mb-4 flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                <Hash className="w-9 h-9 text-[hsl(var(--theme-text-secondary))]" />
              </div>
              <h3 className="text-[32px] font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
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
              {messages.filter(msg => !msg.content.startsWith('/')).map((msg, index, filteredMessages) => {
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
                      className={`group relative flex py-0.5 pr-12 pl-[72px] ${
                        shouldShowHeader ? 'mt-[17px]' : 'mt-0'
                      } hover:bg-[hsl(var(--theme-bg-hover)/0.3)] transition-colors`}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      {/* Avatar - Positioned absolutely */}
                      {shouldShowHeader ? (
                        <div className="absolute left-4 mt-0.5">
                          {msg.avatar_url ? (
                            <img
                              src={getAvatarUrl(msg.avatar_url, authorName)}
                              alt={authorName}
                              className="w-10 h-10 rounded-full object-cover cursor-pointer hover:shadow-lg transition-shadow"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full ${getAvatarColor(authorName)} flex items-center justify-center text-white font-medium text-sm cursor-pointer hover:shadow-lg transition-shadow`}>
                              {getAvatarInitials(authorName)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="absolute left-4 w-10 text-[11px] text-right opacity-0 group-hover:opacity-100 transition-opacity select-none text-[hsl(var(--theme-text-muted))]">
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        {shouldShowHeader && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="font-medium text-[15px] hover:underline cursor-pointer text-[hsl(var(--theme-text-primary))]">
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
                          </div>
                        )}
                        {/* Show Removed tag even when header is hidden */}
                        {!shouldShowHeader && msg.is_blocked && (
                          <span className="inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400">
                            Removed
                          </span>
                        )}
                        <div className="text-[15px] leading-[1.375rem] break-words text-[hsl(var(--theme-text-primary))]">
                          <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(msg.content.trim()) ? 'text-[44px] leading-[54px]' : ''}>
                            {msg.content}
                          </span>
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
                      <div className="absolute -top-4 right-4 opacity-0 group-hover:opacity-100 transition-all">
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
        className="px-4 pb-6 pt-0 relative transition-colors duration-300 backdrop-blur-sm"
        
      >
        <div className="relative">
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
            {/* Plus Button */}
            <button
              className="flex-shrink-0 p-3 rounded-l-lg transition-colors text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
              disabled={!currentChannel || !isConnected}
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
              className={`flex-1 bg-transparent outline-none text-[15px] py-2.5 ${
                message.startsWith('/')
                  ? "text-[hsl(var(--theme-accent-primary))] placeholder-[hsl(var(--theme-accent-primary)/0.6)]"
                  : "text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]"
              } disabled:opacity-50`}
            />

            <div className="flex items-center gap-1 pr-2">
              <button
                className="p-2 rounded-md transition-colors text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
                disabled={!currentChannel || !isConnected}
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <EmojiPickerButton
                onEmojiSelect={handleEmojiSelect}
                pickerPosition="top"
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
        <div className="fixed bottom-20 right-4 max-w-md w-full max-h-[70vh] z-50 rounded-xl shadow-2xl border overflow-hidden flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]">
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
    </div>
  );
}
