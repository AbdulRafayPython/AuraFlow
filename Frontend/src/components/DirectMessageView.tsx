// components/DirectMessageView.tsx - DM conversation view
import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { useDirectMessages } from '@/contexts/DirectMessagesContext';
import { useFriends } from '@/contexts/FriendsContext';
import type { DirectMessage } from '@/types';

interface DirectMessageViewProps {
  userId: number;
  username: string;
  avatar?: string;
}

export const DirectMessageView: React.FC<DirectMessageViewProps> = ({ userId, username, avatar }) => {
  const { conversations, messages, sendMessage, deleteMessage, editMessage, markAsRead } = useDirectMessages();
  const { friends } = useFriends();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const isDarkMode = true;

  const conversation = conversations.find(c => c.user_id === userId);
  const displayMessages = messages;

  useEffect(() => {
    // Mark unread messages as read
    displayMessages.forEach(msg => {
      if (!msg.is_read && msg.receiver_id === userId) {
        markAsRead(msg.id).catch(console.error);
      }
    });
  }, [displayMessages, userId, markAsRead]);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(userId, message);
      setMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
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

  return (
    <div className="flex-1 flex flex-col bg-slate-900">
      {/* Header */}
      <header className={`px-4 h-14 flex items-center justify-between border-b ${
        isDarkMode ? "bg-slate-800/50 border-slate-700/50" : "bg-white/80 border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          <img
            src={avatar || ''}
            alt={username}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <h2 className="text-base font-semibold text-white">{username}</h2>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          displayMessages.map((msg, index) => {
            const showDateDivider = shouldShowDateDivider(msg, displayMessages[index - 1]);

            return (
              <div key={msg.id}>
                {showDateDivider && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-slate-700" />
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-gray-300">
                      {formatDate(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>
                )}

                <div className="flex gap-3 group px-4 py-1 hover:bg-slate-800/40 rounded-lg transition-all">
                  <div className="flex-shrink-0">
                    <img
                      src={msg.sender?.avatar_url || ''}
                      alt={msg.sender?.username || 'Unknown'}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-white">
                        {msg.sender?.display_name || msg.sender?.username || 'Unknown User'}
                      </span>
                      <span className="text-xs text-gray-500">{formatTime(msg.created_at)}</span>
                      {msg.is_read && msg.receiver_id === userId && (
                        <span className="text-xs text-green-500 ml-auto">✓ Seen</span>
                      )}
                    </div>

                    {editingId === msg.id ? (
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="flex-1 px-3 py-1 bg-slate-700 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleEdit(msg.id)}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditContent(''); }}
                          className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm leading-relaxed break-words text-gray-200 flex-1">
                          {msg.content}
                        </p>
                        {msg.edited_at && (
                          <span className="text-xs text-gray-500">(edited)</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Message Menu */}
                  <div className="opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => setMenuOpen(menuOpen === msg.id ? null : msg.id)}
                      className="p-2 hover:bg-slate-700 rounded-lg transition text-gray-400"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpen === msg.id && (
                      <div className="absolute right-4 mt-2 w-40 bg-slate-800 rounded-lg shadow-lg z-10">
                        <button
                          onClick={() => { setEditingId(msg.id); setEditContent(msg.content); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 transition"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition border-t border-slate-700"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className={`border-t ${
        isDarkMode ? "bg-slate-800/50 border-slate-700/50 backdrop-blur-sm" : "bg-white/80 border-gray-200 backdrop-blur-sm"
      }`}>
        <form onSubmit={handleSend} className="px-4 py-3 max-w-4xl mx-auto">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-all ${
            isDarkMode
              ? "bg-slate-900 border-slate-700 focus-within:border-blue-500"
              : "bg-white border-gray-300 focus-within:border-blue-500 shadow-sm"
          }`}>
            <input
              type="text"
              placeholder={`Message ${username}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending}
              className="flex-1 bg-transparent outline-none text-sm py-0 text-white placeholder-gray-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!message.trim() || isSending}
              className="p-2 text-blue-500 hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
};
