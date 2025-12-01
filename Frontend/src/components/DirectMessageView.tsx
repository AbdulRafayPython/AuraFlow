// components/DirectMessageView.tsx - DM conversation view
import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Trash2, Edit2, ArrowLeft } from 'lucide-react';
import { useDirectMessages } from '@/contexts/DirectMessagesContext';
import { useFriends } from '@/contexts/FriendsContext';
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
    <div className="flex-1 flex flex-col bg-slate-900 h-full">
      {/* Header - Compact Professional */}
      <header className="px-4 h-14 flex items-center justify-between border-b bg-slate-800/60 border-slate-700/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded transition-colors text-gray-400 hover:text-white flex-shrink-0"
              title="Back to friends"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <img
            src={avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`}
            alt={displayName || username}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{displayName || username}</h2>
          </div>
        </div>
      </header>

      {/* Messages - Compact */}
      <main className="flex-1 overflow-y-auto p-3 space-y-1">
        {displayMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center text-sm">
              <p>No messages yet</p>
              <p className="text-xs text-gray-500">Start chatting!</p>
            </div>
          </div>
        ) : (
          displayMessages.map((msg, index) => {
            const showDateDivider = shouldShowDateDivider(msg, displayMessages[index - 1]);

            return (
              <div key={msg.id}>
                {showDateDivider && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-slate-700" />
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-gray-400">
                      {formatDate(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>
                )}

                <div className="flex gap-2 group px-1 py-0.5 hover:bg-slate-800/20 rounded transition-all">
                  <div className="flex-shrink-0 mt-0.5">
                    <img
                      src={msg.sender?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender?.username || 'unknown'}`}
                      alt={msg.sender?.username || 'Unknown'}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-medium text-xs text-gray-100">
                        {msg.sender?.display_name || msg.sender?.username || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500">{formatTime(msg.created_at)}</span>
                      {msg.edited_at && (
                        <span className="text-xs text-gray-600">(edited)</span>
                      )}
                    </div>

                    {editingId === msg.id ? (
                      <div className="flex gap-1.5 mb-1">
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="flex-1 px-2 py-1 bg-slate-700 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEdit(msg.id)}
                          className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditContent(''); }}
                          className="px-1.5 py-0.5 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm leading-tight break-words text-gray-100 max-w-2xl">
                        {msg.content}
                      </p>
                    )}
                  </div>

                  {/* Message Menu */}
                  {msg.sender_id === userId && (
                    <div className="opacity-0 group-hover:opacity-100 transition relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === msg.id ? null : msg.id)}
                        className="p-0.5 hover:bg-slate-700 rounded transition text-gray-400 hover:text-white flex-shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpen === msg.id && (
                        <div className="absolute right-0 mt-1 w-40 bg-slate-800 rounded-lg shadow-lg z-10 border border-slate-700">
                          <button
                            onClick={() => { setEditingId(msg.id); setEditContent(msg.content); setMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-slate-700 transition"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 transition border-t border-slate-700"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="border-t bg-slate-800/80 border-slate-700/50 backdrop-blur-sm flex-shrink-0">
        <form onSubmit={handleSend} className="px-3 py-2">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border bg-slate-900/50 border-slate-700 focus-within:border-blue-500 transition-all">
            <input
              type="text"
              placeholder={`Message ${displayName || username}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending}
              className="flex-1 bg-transparent outline-none text-sm py-0 text-white placeholder-gray-500 disabled:opacity-50"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as any);
                }
              }}
            />
            <button
              type="submit"
              disabled={!message.trim() || isSending}
              className="p-1.5 text-blue-500 hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
};
