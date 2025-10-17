import { useState } from "react";
import { Search, Settings, Hash, Paperclip, Smile } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface Message {
  id: string;
  author: string;
  avatar: string;
  content: string;
  time: string;
  attachment?: {
    type: "chart";
    title: string;
  };
}

const initialMessages: Message[] = [
  {
    id: "1",
    author: "Abdul Rafay",
    avatar: "AR",
    content: "Glad you're using Auraflow! The AI Translate Agent is great for translating messages.",
    time: "9:53 AM",
  },
  {
    id: "2",
    author: "Syeda Zehra Batool Abdi",
    avatar: "SZ",
    content: "Yes, it made a huge difference for our team. Can you show me how the Mood Tracking Agent works?",
    time: "9:54 AM",
  },
  {
    id: "3",
    author: "Abdul Rafay",
    avatar: "AR",
    content: "Sure! Let me share a trend from the chat right now.",
    time: "9:55 AM",
    attachment: {
      type: "chart",
      title: "Mood Trends",
    },
  },
];

export default function Dashboard() {
  const { isDarkMode } = useTheme();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [message, setMessage] = useState("");
  const [selectedChannel] = useState("general");

  const handleSendMessage = () => {
    if (message.trim()) {
      const newMessage: Message = {
        id: String(messages.length + 1),
        author: "You",
        avatar: "YO",
        content: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([...messages, newMessage]);
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Chat Header */}
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-2">
          <Hash className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {selectedChannel}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button className={`p-1.5 rounded transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
            <Search className="w-4 h-4" />
          </button>
          <button className={`p-1.5 rounded transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
            <Settings className="w-4 h-4" />
          </button>
          <div className="hidden md:block relative">
            <input
              type="text"
              placeholder="Search"
              className={`pl-8 pr-3 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-gray-500' 
                  : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500'
              } border`}
            />
            <Search className={`absolute left-2.5 top-2 w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          </div>
          <div className="w-8 h-8 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
            U
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-4 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
              {msg.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {msg.author}
                </span>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {msg.time}
                </span>
              </div>
              <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                {msg.content}
              </p>
              {msg.attachment && (
                <div className={`mt-2 rounded-lg p-3 border max-w-xl ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h4 className={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {msg.attachment.title}
                  </h4>
                  <div className={`h-36 rounded relative overflow-hidden ${
                    isDarkMode 
                      ? 'bg-gradient-to-r from-slate-800 to-slate-700' 
                      : 'bg-gradient-to-r from-gray-100 to-gray-200'
                  }`}>
                    <svg className="w-full h-full" viewBox="0 0 400 200">
                      <path
                        d="M 0 120 Q 50 100 100 110 T 200 100 T 300 80 T 400 70"
                        fill="none"
                        stroke={isDarkMode ? '#60a5fa' : '#2563eb'}
                        strokeWidth="2"
                      />
                      <path
                        d="M 0 120 Q 50 100 100 110 T 200 100 T 300 80 T 400 70 L 400 200 L 0 200 Z"
                        fill={isDarkMode ? 'rgba(96, 165, 250, 0.2)' : 'rgba(37, 99, 235, 0.1)'}
                      />
                    </svg>
                    <div className={`absolute bottom-2 left-0 right-0 flex justify-around text-xs px-3 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                      <span>Sun</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Message Input */}
      <div className={`px-4 py-3 border-t ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
          isDarkMode 
            ? 'bg-slate-800 border-slate-700' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <input
            type="text"
            placeholder="Type your message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className={`flex-1 bg-transparent outline-none text-sm ${
              isDarkMode 
                ? 'text-white placeholder-gray-400' 
                : 'text-gray-900 placeholder-gray-500'
            }`}
          />
          <button className={`p-1.5 rounded transition-colors ${
            isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-200'
          }`}>
            <Paperclip className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
          <button className={`p-1.5 rounded transition-colors ${
            isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-200'
          }`}>
            <Smile className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        </div>
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          User is typing...
        </p>
      </div>
    </div>
  );
}