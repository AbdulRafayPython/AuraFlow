// pages/Dashboard.tsx - Real-time Version
import { useState, useRef, useEffect } from "react";
import { Search, Settings, Hash, Paperclip, Smile, Bot, Sun, Moon, Send, Wifi, WifiOff } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRealtime } from "@/contexts/RealtimeContext";
import { format } from "date-fns";

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
        // Maintain scroll position
        requestAnimationFrame(() => {
          element.scrollTop = element.scrollHeight - scrollHeight;
        });
      });
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isSending || !currentChannel) return;

    const messageToSend = message;
    setMessage(""); // Clear input immediately for better UX
    setIsSending(true);
    
    try {
      await sendMessage(messageToSend);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessage(messageToSend); // Restore message on error
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

    // Send typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (e.target.value.trim()) {
      sendTyping();
      
      typingTimeoutRef.current = setTimeout(() => {
        // Stop typing after 3 seconds
      }, 3000);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return format(date, "h:mm a");
    } else if (diffInHours < 48) {
      return `Yesterday at ${format(date, "h:mm a")}`;
    } else {
      return format(date, "MMM d, yyyy 'at' h:mm a");
    }
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
      "bg-purple-500", "bg-pink-500", "bg-indigo-500", "bg-teal-500"
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? "bg-slate-900" : "bg-white"}`}>
      {/* Header */}
      <header
        className={`px-4 h-12 flex items-center justify-between border-b ${
          isDarkMode ? "bg-slate-800 border-slate-700/50" : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-center gap-2">
          <Hash className={`w-5 h-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
          <h2 className={`text-base font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {currentChannel?.name || "Select a channel"}
          </h2>
          {currentChannel?.description && (
            <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              - {currentChannel.description}
            </span>
          )}
          
          {/* Connection Status */}
          <div className="ml-2 flex items-center gap-1">
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5 text-green-500" aria-label="Connected" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-red-500 animate-pulse" aria-label="Disconnected" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`p-1.5 rounded transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleRightSidebar}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode ? "hover:bg-slate-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"
            }`}
            title="Toggle AI Agents Sidebar"
          >
            <Bot className="w-4 h-4" />
          </button>
          <div className="hidden md:block relative">
            <input
              type="text"
              placeholder="Search"
              className={`pl-8 pr-3 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 border ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-white placeholder-gray-500"
                  : "bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500"
              }`}
            />
            <Search className={`absolute left-2.5 top-2 w-3.5 h-3.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
          </div>
          <div className="w-8 h-8 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
            U
          </div>
        </div>
      </header>

      {/* Messages */}
      <main
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto px-4 py-3 ${
          isDarkMode ? "bg-slate-900" : "bg-white"
        }`}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: isDarkMode ? '#475569 transparent' : '#cbd5e1 transparent'
        }}
      >
        {isLoadingMessages && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${
              isDarkMode ? "border-blue-400" : "border-blue-600"
            }`}></div>
          </div>
        )}

        {!currentChannel ? (
          <div className="flex items-center justify-center h-full">
            <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Select a channel to start messaging
            </p>
          </div>
        ) : messages.length === 0 && !isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Hash className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`} />
              <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Welcome to #{currentChannel.name}
              </h3>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                This is the start of the #{currentChannel.name} channel
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const showAvatar = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id;
              const isConsecutive = index > 0 && messages[index - 1]?.sender_id === msg.sender_id;
              const authorName = msg.author || "Unknown User";

              return (
                <div key={`${msg.id}-${index}`} className={`flex gap-3 ${isConsecutive ? "mt-1" : "mt-4"}`}>
                  {showAvatar ? (
                    <div className={`w-9 h-9 rounded-full ${getAvatarColor(authorName)} flex items-center justify-center text-white font-semibold text-xs flex-shrink-0`}>
                      {msg.avatar || getAvatarInitials(authorName)}
                    </div>
                  ) : (
                    <div className="w-9 flex-shrink-0">
                      <span className={`text-xs opacity-0 hover:opacity-100 transition-opacity ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}>
                        {format(new Date(msg.created_at), "h:mm")}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {showAvatar && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className={`font-medium text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                          {authorName}
                        </span>
                        <span className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          {formatMessageTime(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <p className={`text-sm leading-relaxed break-words ${isDarkMode ? "text-gray-300" : "text-gray-800"}`}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Typing Indicators */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 mt-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center">
                  <div className="flex gap-0.5">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                  </div>
                </div>
                <p className={`text-xs italic ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                  {typingUsers.map((u) => u.username).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </main>

      {/* Input */}
      <footer
        className={`px-3 py-1.5 border-t ${
          isDarkMode ? "bg-slate-900 border-slate-700/50" : "bg-white border-gray-200"
        }`}
      >
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={currentChannel ? `Message #${currentChannel.name}` : "Select a channel"}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={!currentChannel || isSending || !isConnected}
            className={`flex-1 bg-transparent outline-none text-sm ${
              isDarkMode ? "text-white placeholder-gray-400" : "text-gray-900 placeholder-gray-500"
            } disabled:opacity-50`}
          />
          <button
            className={`p-1.5 rounded transition-colors ${
              isDarkMode ? "hover:bg-slate-700" : "hover:bg-gray-200"
            }`}
            disabled={!currentChannel || !isConnected}
          >
            <Paperclip className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
          </button>
          <button
            className={`p-1.5 rounded transition-colors ${
              isDarkMode ? "hover:bg-slate-700" : "hover:bg-gray-200"
            }`}
            disabled={!currentChannel || !isConnected}
          >
            <Smile className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
          </button>
          <button
            onClick={handleSendMessage}
            disabled={!currentChannel || !message.trim() || isSending || !isConnected}
            className={`p-1.5 rounded transition-colors ${
              message.trim() && currentChannel && isConnected
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : isDarkMode 
                ? "bg-slate-700 text-gray-500 cursor-not-allowed" 
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        {!isConnected && (
          <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
            <WifiOff className="w-3 h-3" />
            Disconnected - Attempting to reconnect...
          </p>
        )}
      </footer>
    </div>
  );
}