// components/DirectMessageView.tsx - DM conversation view
import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Trash2, Edit2, ArrowLeft, SmilePlus } from 'lucide-react';
import { useDirectMessages } from '@/contexts/DirectMessagesContext';
import { useFriends } from '@/contexts/FriendsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAvatarUrl } from '@/lib/utils';
import EmojiPickerButton from '@/components/EmojiPickerButton';
import ReactionPicker from '@/components/ReactionPicker';
import MessageReactions from '@/components/MessageReactions';
import { reactionService } from '@/services/reactionService';
import { socket } from '@/socket';
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
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [dmReactions, setDmReactions] = useState<Record<number, any[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessagesLengthRef = useRef(0);

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

  // Load reactions for all messages - only when message IDs change
  useEffect(() => {
    const loadReactions = async () => {
      if (enrichedMessages.length === 0) return;
      
      const messageIds = enrichedMessages.map(m => m.id).join(',');
      const currentIds = Object.keys(dmReactions).join(',');
      
      // Only load if message IDs have actually changed
      if (messageIds === currentIds) return;
      
      const reactionsMap: Record<number, any[]> = {};
      
      // Only load reactions for new messages
      for (const msg of enrichedMessages) {
        // Skip if we already have reactions for this message
        if (dmReactions[msg.id]) {
          reactionsMap[msg.id] = dmReactions[msg.id];
          continue;
        }
        
        try {
          const { reactions } = await reactionService.getDMReactions(msg.id);
          // Only store if there are reactions
          if (reactions && reactions.length > 0) {
            reactionsMap[msg.id] = reactions;
          }
        } catch (error) {
          console.error(`Failed to load reactions for DM ${msg.id}:`, error);
        }
      }
      
      setDmReactions(reactionsMap);
    };

    loadReactions();
  }, [enrichedMessages.length]); // Only depend on length, not full array

  // Socket.IO listeners for real-time reaction updates
  useEffect(() => {
    const handleDMReactionAdded = (data: any) => {
      console.log('[DirectMessageView] Reaction added:', data);
      setDmReactions(prev => ({
        ...prev,
        [data.dm_id]: data.reactions
      }));
    };

    const handleDMReactionRemoved = (data: any) => {
      console.log('[DirectMessageView] Reaction removed:', data);
      setDmReactions(prev => ({
        ...prev,
        [data.dm_id]: data.reactions
      }));
    };

    socket.on('dm_reaction_added', handleDMReactionAdded);
    socket.on('dm_reaction_removed', handleDMReactionRemoved);

    return () => {
      socket.off('dm_reaction_added', handleDMReactionAdded);
      socket.off('dm_reaction_removed', handleDMReactionRemoved);
    };
  }, []);

  useEffect(() => {
    // Check if user is near bottom before auto-scrolling
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    const hasNewMessage = enrichedMessages.length > prevMessagesLengthRef.current;
    
    // Update the previous length
    prevMessagesLengthRef.current = enrichedMessages.length;

    // Only auto-scroll if user is near bottom or if it's a new message
    if (isNearBottom || hasNewMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [enrichedMessages]);

  // Track scroll position to determine if we should auto-scroll
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  };

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

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleReactionToggle = async (dmId: number, emoji: string) => {
    try {
      const result = await reactionService.toggleDMReaction(dmId, emoji);
      
      // Immediately reload reactions for this message to ensure consistency
      const { reactions: updatedReactions } = await reactionService.getDMReactions(dmId);
      
      // Update state with fresh data from server (prevents duplicates)
      setDmReactions(prev => {
        const newState = { ...prev };
        if (updatedReactions && updatedReactions.length > 0) {
          newState[dmId] = updatedReactions;
        } else {
          // Remove from state if no reactions left
          delete newState[dmId];
        }
        return newState;
      });
    } catch (error) {
      console.error('Failed to toggle DM reaction:', error);
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

  // Check if consecutive messages are from the same user within 5 minutes
  const shouldShowAvatar = (current: DirectMessage, previous: DirectMessage | undefined) => {
    if (!previous) return true;
    if (current.sender_id !== previous.sender_id) return true;
    const timeDiff = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
    return timeDiff > 5 * 60 * 1000; // 5 minutes
  };

  return (
    <div className={`flex-1 flex flex-col h-full ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Header - Clean and Simple */}
      <header className={`px-6 py-3 border-b flex-shrink-0 flex items-center gap-3 ${
        isDarkMode ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-gray-200'
      }`}>
        {onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition ${
              isDarkMode ? 'hover:bg-slate-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3 flex-1">
          <img
            src={getAvatarUrl(avatar, username)}
            alt={displayName || username}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <h2 className={`text-base font-semibold truncate ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {displayName || username}
            </h2>
            <p className={`text-xs ${
              isDarkMode ? 'text-slate-400' : 'text-gray-500'
            }`}>
              Online
            </p>
          </div>
        </div>
      </header>

      {/* Messages - Professional and Clean */}
      <main 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto px-4 py-4 scrollbar ${isDarkMode ? 'scrollbar-thumb-slate-600 scrollbar-track-slate-800/30' : 'scrollbar-thumb-gray-400 scrollbar-track-gray-100'}`}
      >
        {enrichedMessages.length === 0 ? (
          <div className={`h-full flex items-center justify-center ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>
            <div className="text-center text-sm">
              <p>No messages yet</p>
              <p className={`text-xs mt-1 ${
                isDarkMode ? 'text-gray-500' : 'text-gray-400'
              }`}>Start chatting!</p>
            </div>
          </div>
        ) : (
          enrichedMessages.map((msg, index) => {
            const showDateDivider = shouldShowDateDivider(msg, enrichedMessages[index - 1]);
            const showAvatar = shouldShowAvatar(msg, enrichedMessages[index - 1]);
            const isSent = msg.sender_id === currentUserId;

            return (
              <div key={msg.id} className={showAvatar ? 'mt-4' : 'mt-0.5'}>
                {showDateDivider && (
                  <div className="flex items-center gap-3 my-6">
                    <div className={`flex-1 h-px ${
                      isDarkMode ? 'bg-slate-700' : 'bg-gray-300'
                    }`} />
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                      isDarkMode ? 'bg-slate-800 text-gray-400' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {formatDate(msg.created_at)}
                    </span>
                    <div className={`flex-1 h-px ${
                      isDarkMode ? 'bg-slate-700' : 'bg-gray-300'
                    }`} />
                  </div>
                )}

                {/* Receiver message (left) */}
                {!isSent ? (
                  <div 
                    className={`flex gap-2 group px-2 py-0.5 rounded-lg transition-all justify-start relative ${
                      isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div className="flex-shrink-0">
                      {showAvatar ? (
                        <img
                          src={getAvatarUrl(msg.sender?.avatar_url, msg.sender?.username || 'unknown')}
                          alt={msg.sender?.username || 'Unknown'}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 max-w-lg">
                      {showAvatar && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-semibold text-sm ${
                            isDarkMode ? 'text-gray-100' : 'text-gray-900'
                          }`}>
                            {msg.sender?.display_name || msg.sender?.username || 'Unknown'}
                          </span>
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-500' : 'text-gray-400'
                          }`}>{formatTime(msg.created_at)}</span>
                        </div>
                      )}

                      {editingId === msg.id ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => handleEdit(msg.id)}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-3 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2">
                            <p className={`text-sm leading-relaxed break-words rounded-2xl px-4 py-2.5 w-fit max-w-md ${
                              isDarkMode ? 'text-gray-100 bg-slate-700' : 'text-gray-900 bg-gray-200'
                            }`}>
                              <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(msg.content.trim()) ? 'text-4xl leading-normal' : ''}>
                                {msg.content}
                              </span>
                              {!showAvatar && (
                                <span className={`text-xs ml-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                  {formatTime(msg.created_at)}
                                </span>
                              )}
                            </p>
                            {msg.edited_at && (
                              <span className={`text-xs mt-3 ${
                                isDarkMode ? 'text-gray-600' : 'text-gray-500'
                              }`}>(edited)</span>
                            )}
                          </div>
                          
                          {/* Reactions Display */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 ml-1">
                            {dmReactions[msg.id] && dmReactions[msg.id].length > 0 && (
                              <MessageReactions
                                reactions={dmReactions[msg.id]}
                                onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                              />
                            )}
                            
                            {/* Add Reaction Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id);
                              }}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${
                                isDarkMode 
                                  ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-600' 
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-300'
                              }`}
                              title="Add reaction"
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                      
                      {/* Reaction Picker - Shown when button clicked */}
                      {reactionPickerMessageId === msg.id && (
                        <div className="absolute left-10 mt-1 z-30 shadow-xl">
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
                ) : (
                  /* Sender message (right) */
                  <div 
                    className={`flex gap-2 group px-2 py-0.5 rounded-lg transition-all justify-end relative ${
                      isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    {/* Message Menu */}
                    <div className="opacity-0 group-hover:opacity-100 transition relative flex-shrink-0 flex items-start pt-2">
                      <button
                        onClick={() => setMenuOpen(menuOpen === msg.id ? null : msg.id)}
                        className={`p-1.5 rounded-lg transition ${
                          isDarkMode 
                            ? 'hover:bg-slate-700 text-gray-400 hover:text-white' 
                            : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpen === msg.id && (
                        <div className={`absolute left-0 top-10 w-40 rounded-lg shadow-lg z-20 border ${
                          isDarkMode 
                            ? 'bg-slate-800 border-slate-700' 
                            : 'bg-white border-gray-200'
                        }`}>
                          <button
                            onClick={() => { setEditingId(msg.id); setEditContent(msg.content); setMenuOpen(null); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition rounded-t-lg ${
                              isDarkMode 
                                ? 'text-gray-300 hover:bg-slate-700' 
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 transition border-t rounded-b-lg ${
                              isDarkMode 
                                ? 'hover:bg-slate-700 border-slate-700' 
                                : 'hover:bg-gray-100 border-gray-200'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 max-w-lg text-right">
                      {showAvatar && (
                        <div className="flex items-center gap-2 mb-1 justify-end">
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-500' : 'text-gray-400'
                          }`}>{formatTime(msg.created_at)}</span>
                          <span className={`font-semibold text-sm ${
                            isDarkMode ? 'text-gray-100' : 'text-gray-900'
                          }`}>
                            You
                          </span>
                        </div>
                      )}

                      {editingId === msg.id ? (
                        <div className="flex gap-2 justify-end">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-3 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleEdit(msg.id)}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2 justify-end">
                            {msg.edited_at && (
                              <span className={`text-xs mt-3 ${
                                isDarkMode ? 'text-gray-600' : 'text-gray-500'
                              }`}>(edited)</span>
                            )}
                            <p className="text-sm leading-relaxed break-words text-white bg-blue-600 rounded-2xl px-4 py-2.5 w-fit max-w-md">
                              <span className={/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+$/u.test(msg.content.trim()) ? 'text-4xl leading-normal' : ''}>
                                {msg.content}
                              </span>
                              {!showAvatar && (
                                <span className="text-xs ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-blue-100">
                                  {formatTime(msg.created_at)}
                                </span>
                              )}
                            </p>
                          </div>
                          
                          {/* Reactions Display */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 mr-1 justify-end">
                            {dmReactions[msg.id] && dmReactions[msg.id].length > 0 && (
                              <MessageReactions
                                reactions={dmReactions[msg.id]}
                                onReactionClick={(emoji) => handleReactionToggle(msg.id, emoji)}
                              />
                            )}
                            
                            {/* Add Reaction Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactionPickerMessageId(reactionPickerMessageId === msg.id ? null : msg.id);
                              }}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${
                                isDarkMode 
                                  ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-600' 
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-300'
                              }`}
                              title="Add reaction"
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                      
                      {/* Reaction Picker - Shown when button clicked */}
                      {reactionPickerMessageId === msg.id && (
                        <div className="absolute right-10 mt-1 z-30 shadow-xl">
                          <ReactionPicker
                            onReactionSelect={(emoji) => {
                              handleReactionToggle(msg.id, emoji);
                              setReactionPickerMessageId(null);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {showAvatar ? (
                        <img
                          src={getAvatarUrl(currentUser?.avatar_url || currentUser?.avatar, currentUser?.username || 'You')}
                          alt="You"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8" />
                      )}
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
      <footer className={`border-t backdrop-blur flex-shrink-0 ${
        isDarkMode 
          ? 'bg-slate-900/95 border-slate-700/50' 
          : 'bg-white/95 border-gray-200'
      }`}>
        <form onSubmit={handleSend} className="px-6 py-4">
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 border focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all duration-200 ${
            isDarkMode 
              ? 'border-slate-700 bg-slate-800 hover:border-slate-600 focus-within:bg-slate-800/90' 
              : 'border-gray-300 bg-gray-50 hover:border-gray-400 focus-within:bg-white'
          }`}>
            <input
              type="text"
              placeholder={`Message ${displayName || username}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending}
              className={`flex-1 bg-transparent outline-none text-sm disabled:opacity-50 ${
                isDarkMode 
                  ? 'text-white placeholder-slate-500' 
                  : 'text-gray-900 placeholder-gray-400'
              }`}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as any);
                }
              }}
            />
            <EmojiPickerButton
              onEmojiSelect={handleEmojiSelect}
              pickerPosition="top"
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={!message.trim() || isSending}
              className={`p-2 text-blue-500 rounded-lg disabled:opacity-40 disabled:hover:text-blue-500 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all flex-shrink-0 ${
                isDarkMode 
                  ? 'hover:text-blue-400 hover:bg-slate-700' 
                  : 'hover:text-blue-600 hover:bg-gray-200'
              }`}
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
