// pages/Dashboard.tsx - Professional Real-time Version
import { useState, useRef, useEffect } from "react";
import { Search, Settings, Hash, Paperclip, Smile, Bot, Sun, Moon, Send, Wifi, WifiOff, Plus } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRealtime } from "@/hooks/useRealtime";

interface DashboardProps {
  toggleRightSidebar?: () => void;
}

export default function Dashboard({ toggleRightSidebar }: DashboardProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const {
    isConnected,
    currentChannel,
    messages,
    sendMessage,
    sendTyping,
    typingUsers,
    isLoadingMessages,
    loadMoreMessages,
  } = useRealtime();

  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus input when channel changes
  useEffect(() => {
    if (currentChannel && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentChannel]);

  // Handle scroll to load more messages
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    if (element.scrollTop === 0 && !isLoadingMessages) {
      const scrollHeight = element.scrollHeight;
      loadMoreMessages().then(() => {
        requestAnimationFrame(() => {
          element.scrollTop = element.scrollHeight - scrollHeight;
        });
      });
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isSending || !currentChannel) return;

    const messageToSend = message;
    setMessage("");
    setIsSending(true);

    try {
      await sendMessage(messageToSend);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessage(messageToSend);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (e.target.value.trim()) {
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
    <div className={`flex flex-col h-full ${isDarkMode ? "bg-slate-900" : "bg-white"}`}>
      {/* Header */}
      <header
        className={`px-4 h-14 flex items-center justify-between border-b ${
          isDarkMode ? "bg-slate-800/50 border-slate-700/50 backdrop-blur-sm" : "bg-white/80 border-gray-200 backdrop-blur-sm"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-md ${isDarkMode ? "bg-slate-700" : "bg-gray-100"}`}>
            <Hash className={`w-5 h-5 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`} />
          </div>
          <div>
            <h2 className={`text-base font-semibold leading-none ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {currentChannel?.name || "Select a channel"}
            </h2>
            {currentChannel?.description && (
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                {currentChannel.description}
              </p>
            )}
          </div>

          {/* Connection Status */}
          <div className={`ml-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
            isConnected 
              ? isDarkMode ? "bg-green-500/10 text-green-400" : "bg-green-50 text-green-700"
              : isDarkMode ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"
          }`}>
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 animate-pulse" />
                <span>Reconnecting...</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:block relative">
            <input
              type="text"
              placeholder="Search messages..."
              className={`pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 border transition-all ${
                isDarkMode
                  ? "bg-slate-700 border-slate-600 text-white placeholder-gray-400"
                  : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500"
              }`}
            />
            <Search className={`absolute left-3 top-2.5 w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
          </div>
          
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          <button
            onClick={toggleRightSidebar}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
            title="Toggle AI Agents"
          >
            <Bot className="w-4 h-4" />
          </button>
          
          {/* <button
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
          >
            <Settings className="w-4 h-4" />
          </button> */}
        </div>
      </header>

      {/* Messages */}
      <main
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${isDarkMode ? "bg-slate-900" : "bg-gray-50"}`}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: isDarkMode ? '#475569 transparent' : '#cbd5e1 transparent'
        }}
      >
        {isLoadingMessages && messages.length === 0 && (
          <div className="flex justify-center items-center h-full">
            <div className="text-center">
              <div className={`animate-spin rounded-full h-10 w-10 border-3 border-t-transparent mx-auto mb-4 ${
                isDarkMode ? "border-blue-400" : "border-blue-600"
              }`}></div>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Loading messages...
              </p>
            </div>
          </div>
        )}

        {!currentChannel ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-4">
              <div className={`w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
                isDarkMode ? "bg-slate-800" : "bg-gray-100"
              }`}>
                <Hash className={`w-10 h-10 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Welcome to your workspace
              </h3>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Select a channel from the sidebar to start messaging with your team
              </p>
            </div>
          </div>
        ) : messages.length === 0 && !isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-4">
              <div className={`w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
                isDarkMode ? "bg-slate-800" : "bg-gray-100"
              }`}>
                <Hash className={`w-10 h-10 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Welcome to #{currentChannel.name}
              </h3>
              <p className={`text-sm mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                This is the beginning of the #{currentChannel.name} channel. Send a message to get started!
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-4">
            {/* Loading more indicator */}
            {isLoadingMessages && messages.length > 0 && (
              <div className="flex justify-center py-4">
                <div className={`animate-spin rounded-full h-6 w-6 border-2 border-t-transparent ${
                  isDarkMode ? "border-blue-400" : "border-blue-600"
                }`}></div>
              </div>
            )}

            {messages.map((msg, index) => {
              const showDateDivider = shouldShowDateDivider(msg, messages[index - 1]);
              const showAvatar = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id;
              const isConsecutive = index > 0 && messages[index - 1]?.sender_id === msg.sender_id;
              const authorName = msg.author || "Unknown User";
              const timeSinceLastMsg = index > 0 
                ? new Date(msg.created_at).getTime() - new Date(messages[index - 1].created_at).getTime()
                : 0;
              const showTimestamp = !isConsecutive || timeSinceLastMsg > 300000; // 5 minutes

              return (
                <div key={`${msg.id}-${index}`}>
                  {/* Date Divider */}
                  {showDateDivider && (
                    <div className="flex items-center gap-3 my-6">
                      <div className={`flex-1 h-px ${isDarkMode ? "bg-slate-700" : "bg-gray-200"}`} />
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        isDarkMode ? "bg-slate-800 text-gray-300" : "bg-gray-100 text-gray-700"
                      }`}>
                        {formatDateDivider(msg.created_at)}
                      </span>
                      <div className={`flex-1 h-px ${isDarkMode ? "bg-slate-700" : "bg-gray-200"}`} />
                    </div>
                  )}

                  {/* Message */}
                  <div 
                    className={`group flex gap-3 px-4 py-1 rounded-lg transition-colors ${
                      isConsecutive && !showTimestamp ? "hover:bg-slate-800/30" : "mt-4 hover:bg-slate-800/30"
                    } ${isDarkMode ? "" : "hover:bg-gray-100/50"}`}
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0 w-10">
                      {showAvatar ? (
                        msg.avatar_url ? (
                          <img
                            src={msg.avatar_url}
                            alt={authorName}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-transparent hover:ring-blue-500/50 transition-all duration-200 cursor-pointer"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-full ${getAvatarColor(authorName)} flex items-center justify-center text-white font-semibold text-sm cursor-pointer hover:opacity-90 transition-opacity`}>
                            {getAvatarInitials(authorName)}
                          </div>
                        )
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <span className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          }`}>
                            {new Date(msg.created_at).getHours() % 12 || 12}:{String(new Date(msg.created_at).getMinutes()).padStart(2, '0')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className={`font-semibold text-sm hover:underline cursor-pointer ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}>
                            {authorName}
                          </span>
                          <span className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <div className={`text-[15px] leading-relaxed break-words ${
                        isDarkMode ? "text-gray-200" : "text-gray-800"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing Indicators */}
            {typingUsers.length > 0 && (
              <div className="flex items-start gap-3 px-4 py-2 mt-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-slate-700" : "bg-gray-200"
                }`}>
                  <div className="flex gap-1">
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? "bg-gray-400" : "bg-gray-600"}`} style={{ animationDelay: "0ms" }}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? "bg-gray-400" : "bg-gray-600"}`} style={{ animationDelay: "150ms" }}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? "bg-gray-400" : "bg-gray-600"}`} style={{ animationDelay: "300ms" }}></div>
                  </div>
                </div>
                <div className="flex-1 pt-2">
                  <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    <span className="font-medium">{typingUsers.map((u) => u.username).join(", ")}</span>
                    {" "}{typingUsers.length === 1 ? "is" : "are"} typing...
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <footer className={`px-4 py-3 border-t ${
        isDarkMode ? "bg-slate-800/50 border-slate-700/50 backdrop-blur-sm" : "bg-white/80 border-gray-200 backdrop-blur-sm"
      }`}>
        <div className="max-w-4xl mx-auto">
          <div className={`flex items-end gap-2 rounded-xl px-4 py-3 border transition-all ${
            isDarkMode 
              ? "bg-slate-900 border-slate-700 focus-within:border-blue-500" 
              : "bg-white border-gray-300 focus-within:border-blue-500 shadow-sm"
          }`}>
            <button
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
              }`}
              disabled={!currentChannel || !isConnected}
            >
              <Plus className="w-5 h-5" />
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={currentChannel ? `Message #${currentChannel.name}` : "Select a channel to start messaging"}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={!currentChannel || isSending || !isConnected}
              className={`flex-1 bg-transparent outline-none text-[15px] py-1 ${
                isDarkMode ? "text-white placeholder-gray-500" : "text-gray-900 placeholder-gray-400"
              } disabled:opacity-50`}
            />

            <div className="flex items-center gap-1">
              <button
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
                }`}
                disabled={!currentChannel || !isConnected}
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
                }`}
                disabled={!currentChannel || !isConnected}
              >
                <Smile className="w-5 h-5" />
              </button>
              <button
                onClick={handleSendMessage}
                disabled={!currentChannel || !message.trim() || isSending || !isConnected}
                className={`p-2 rounded-lg transition-all ${
                  message.trim() && currentChannel && isConnected
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25"
                    : isDarkMode
                      ? "bg-slate-700 text-gray-500 cursor-not-allowed"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSending ? (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {!isConnected && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
              <WifiOff className="w-3.5 h-3.5 animate-pulse" />
              <span>Connection lost. Attempting to reconnect...</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}