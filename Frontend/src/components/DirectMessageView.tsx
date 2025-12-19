// components/DirectMessageView.tsx - DM conversation view
import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Trash2, Edit2, ArrowLeft } from 'lucide-react';
import { useDirectMessages } from '@/contexts/DirectMessagesContext';
import { useFriends } from '@/contexts/FriendsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

  // Get current user's actual ID
  const currentUserId = currentUser?.id;

  const conversation = conversations.find(c => c.user_id === userId);
  // Sort messages chronologically with oldest first, newest last (bottom)
  const displayMessages = [...messages].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  
  // Enrich messages with sender and receiver data from friends or conversation user
  const enrichedMessages = displayMessages.map(msg => {
    console.log('[DirectMessageView] Processing message:', {
      id: msg.id,
      sender_id: msg.sender_id,
      receiver_id: msg.receiver_id,
      content: msg.content,
      currentUserId: currentUserId,
      otherUserId: userId
    });

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
  
  console.log('[DirectMessageView] All enriched messages:', enrichedMessages);

  useEffect(() => {
    // Mark unread messages as read
    enrichedMessages.forEach(msg => {
      if (!msg.is_read && msg.receiver_id === currentUserId) {
        markAsRead(msg.id).catch(console.error);
      }
    });
  }, [enrichedMessages, currentUserId, markAsRead]);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [enrichedMessages]);

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
      {/* Header - Profile Icon Centered at Top */}
      <header className="px-6 py-4 flex flex-col items-center justify-center border-b bg-slate-800/60 border-slate-700/30 flex-shrink-0">
        <div className="relative flex-shrink-0 mb-3">
          <img
            src={avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`}
            alt={displayName || username}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-slate-700"
          />
        </div>
        
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">
            {displayName || username}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Online
          </p>
        </div>
      </header>

      {/* Messages - Compact */}
      <main className={`flex-1 overflow-y-auto px-6 py-6 space-y-3 scrollbar ${isDarkMode ? 'scrollbar-thumb-slate-600 scrollbar-track-slate-800/30' : 'scrollbar-thumb-gray-400 scrollbar-track-gray-100'}`}>
        {enrichedMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center text-sm">
              <p>No messages yet</p>
              <p className="text-xs text-gray-500">Start chatting!</p>
            </div>
          </div>
        ) : (
          enrichedMessages.map((msg, index) => {
            const showDateDivider = shouldShowDateDivider(msg, enrichedMessages[index - 1]);
            const isSent = msg.sender_id === currentUserId; // Current user's message (sender on right)

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

                {/* Receiver message (left) */}
                {!isSent ? (
                  <div className="flex gap-2 group px-1 py-0.5 hover:bg-slate-800/20 rounded transition-all justify-start">
                    <div className="flex-shrink-0 mt-0.5">
                      <img
                        src={msg.sender?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender?.username || 'unknown'}`}
                        alt={msg.sender?.username || 'Unknown'}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 max-w-xs">
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
                        <p className="text-sm leading-tight break-words text-gray-100 bg-slate-700 rounded-lg px-3 py-2 w-fit">
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Sender message (right) */
                  <div className="flex gap-2 group px-1 py-0.5 hover:bg-slate-800/20 rounded transition-all justify-end">
                    {/* Message Menu */}
                    <div className="opacity-0 group-hover:opacity-100 transition relative flex-shrink-0 flex items-start pt-0.5">
                      <button
                        onClick={() => setMenuOpen(menuOpen === msg.id ? null : msg.id)}
                        className="p-0.5 hover:bg-slate-700 rounded transition text-gray-400 hover:text-white"
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

                    <div className="flex-1 min-w-0 max-w-xs text-right">
                      <div className="flex items-center gap-1.5 mb-0.5 justify-end">
                        <span className="text-xs text-gray-500">{formatTime(msg.created_at)}</span>
                        {msg.edited_at && (
                          <span className="text-xs text-gray-600">(edited)</span>
                        )}
                      </div>

                      {editingId === msg.id ? (
                        <div className="flex gap-1.5 mb-1 justify-end">
                          <button
                            onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-1.5 py-0.5 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleEdit(msg.id)}
                            className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                          >
                            Save
                          </button>
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="flex-1 px-2 py-1 bg-slate-700 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <p className="text-sm leading-tight break-words text-white bg-blue-600 rounded-lg px-3 py-2 w-fit ml-auto">
                          {msg.content}
                        </p>
                      )}
                    </div>

                    <div className="flex-shrink-0 mt-0.5">
                      <img
                        src={msg.sender?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender?.username || 'unknown'}`}
                        alt={msg.sender?.username || 'Unknown'}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input - Professional */}
      <footer className="border-t bg-slate-900/95 backdrop-blur border-slate-700/50 flex-shrink-0">
        <form onSubmit={handleSend} className="px-6 py-4">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3 border border-slate-700 bg-slate-800 hover:border-slate-600 focus-within:border-blue-500 focus-within:bg-slate-800/90 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all duration-200">
            <input
              type="text"
              placeholder={`Message ${displayName || username}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-slate-500 disabled:opacity-50"
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
              className="p-2 text-blue-500 hover:text-blue-400 hover:bg-slate-700 rounded-lg disabled:opacity-40 disabled:hover:text-blue-500 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all flex-shrink-0"
              title="Send message (Enter)"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
};
