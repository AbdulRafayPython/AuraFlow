// contexts/DirectMessagesContext.tsx - FIXED: Proper message reception
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { DirectMessage, User } from "@/types";
import { directMessageService } from "@/services/directMessageService";
import { socketService } from "@/services/socketService";
import { useAuth } from "./AuthContext";
import { useFriends } from "./FriendsContext";

interface Conversation {
  user_id: number;
  user: User;
  last_message?: DirectMessage;
  unread_count: number;
  last_message_time: string;
}

interface DirectMessagesContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: DirectMessage[];
  loading: boolean;
  error: string | null;

  // Conversation operations
  getConversations: () => Promise<void>;
  selectConversation: (userId: number) => Promise<void>;
  closeConversation: () => void;
  deleteConversation: (userId: number) => void;

  // Message operations
  getMessages: (userId: number, limit?: number, offset?: number) => Promise<void>;
  sendMessage: (receiverId: number, content: string, replyTo?: number) => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
  editMessage: (messageId: number, content: string) => Promise<void>;
  markAsRead: (messageId: number) => Promise<void>;
  markAllAsRead: (userId: number) => Promise<void>;

  // Socket/Local updates
  addMessage: (message: DirectMessage) => void;
  deliverUploadedMessage: (message: DirectMessage) => void;
  removeMessage: (messageId: number) => void;
  updateMessage: (messageId: number, content: string) => void;
  markMessageAsRead: (messageId: number) => void;
}

const DirectMessagesContext = createContext<DirectMessagesContextType | undefined>(undefined);

export function DirectMessagesProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { friends } = useFriends();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // CRITICAL: Use ref to track current conversation for socket listener
  const currentConversationRef = useRef<Conversation | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const messagesRef = useRef<DirectMessage[]>([]);
  const addMessageRef = useRef<any>(null);

  // Initialize conversations from friends list — preserve existing last_message
  useEffect(() => {
    if (friends && friends.length > 0) {
      setConversations(prev => {
        const existingMap = new Map(prev.map(c => [c.user_id, c]));
        return friends.map(friend => {
          const existing = existingMap.get(friend.id);
          return {
            user_id: friend.id,
            user: {
              id: friend.id,
              public_id: friend.public_id,
              username: friend.username,
              display_name: friend.display_name,
              avatar_url: friend.avatar_url,
              email: ''
            } as User,
            unread_count: existing?.unread_count ?? 0,
            last_message_time: existing?.last_message_time ?? new Date().toISOString(),
            last_message: existing?.last_message
          };
        });
      });
    }
  }, [friends]);

  // Update refs whenever state changes
  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Update current user ID from auth context
  useEffect(() => {
    if (authUser?.id) {
      currentUserIdRef.current = authUser.id;
    }
  }, [authUser?.id]);

  // On mount: fetch last message per conversation to populate Recent Messages sidebar
  useEffect(() => {
    if (!authUser?.id) return;
    directMessageService.getConversations().then(data => {
      if (!data.length) return;
      setConversations(prev => {
        const updates = new Map(data.map(d => [d.partner_id, d.last_message]));
        return prev.map(c => {
          const lastMsg = updates.get(c.user_id);
          if (lastMsg && (!c.last_message || lastMsg.id > (c.last_message.id ?? 0))) {
            return { ...c, last_message: lastMsg, last_message_time: lastMsg.created_at };
          }
          return c;
        });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  // Fetch conversations
  const getConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await directMessageService.getConversations();
      if (data.length) {
        setConversations(prev => {
          const updates = new Map(data.map(d => [d.partner_id, d.last_message]));
          return prev.map(c => {
            const lastMsg = updates.get(c.user_id);
            if (lastMsg) {
              return { ...c, last_message: lastMsg, last_message_time: lastMsg.created_at };
            }
            return c;
          });
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  // Select conversation and fetch messages
  const selectConversation = useCallback(async (userId: number) => {
    setLoading(true);
    setError(null);
    try {
      // Set current conversation
      const conversation = conversations.find(c => c.user_id === userId);
      if (conversation) {
        setCurrentConversation(conversation);
        currentConversationRef.current = conversation;
      } else {
        // Create a temporary conversation object for the ref
        currentConversationRef.current = {
          user_id: userId,
          user: {} as User,
          unread_count: 0,
          last_message_time: new Date().toISOString()
        };
      }

      // Fetch messages
      const msgs = await directMessageService.getDirectMessages(userId);
      setMessages(msgs);
      messagesRef.current = msgs;

      // Update last_message in conversations from the freshly loaded messages
      // API returns DESC order, so msgs[0] is the most recent
      if (msgs.length > 0) {
        const lastMsg = msgs[0];
        setConversations(prev => prev.map(c =>
          c.user_id === userId
            ? { ...c, last_message: lastMsg, last_message_time: lastMsg.created_at }
            : c
        ));
      }

      // Join DM socket room
      socketService.joinDMConversation(userId);

      // Mark all as read in a SINGLE round-trip (was an N-message sequential
      // await loop — on a remote DB that alone made opening a chat take seconds).
      // Update local state immediately; the network call is fire-and-forget.
      const unreadIds = msgs.filter(m => !m.is_read && m.receiver_id === currentUserIdRef.current).map(m => m.id);
      if (unreadIds.length > 0) {
        setMessages(prev => prev.map(m => (unreadIds.includes(m.id) ? { ...m, is_read: true } : m)));
        directMessageService.markMessagesRead(unreadIds).catch(err => {
          console.error('[DirectMessagesContext] Bulk mark-read failed:', err);
        });
      }
    } catch (err: any) {
      console.error('[DirectMessagesContext] Error selecting conversation:', err);
      setError(err.response?.data?.message || "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [conversations]);

  // Close current conversation
  const closeConversation = useCallback(() => {
    socketService.leaveDMConversation();
    setCurrentConversation(null);
    currentConversationRef.current = null;
    setMessages([]);
    messagesRef.current = [];
  }, []);

  // Delete conversation
  const deleteConversation = useCallback((userId: number) => {
    setConversations(prev => prev.filter(c => c.user_id !== userId));
    if (currentConversation?.user_id === userId) {
      closeConversation();
    }
  }, [currentConversation, closeConversation]);

  // Fetch messages
  const getMessages = useCallback(
    async (userId: number, limit = 50, offset = 0) => {
      setLoading(true);
      setError(null);
      try {
        console.log('[DirectMessagesContext] Fetching messages for user:', userId);
        const msgs = await directMessageService.getDirectMessages(userId, limit, offset);
        console.log('[DirectMessagesContext] Received messages from API:', msgs);
        if (offset === 0) {
          setMessages(msgs);
          messagesRef.current = msgs;
        } else {
          setMessages(prev => [...msgs, ...prev]);
          messagesRef.current = [...msgs, ...messagesRef.current];
        }
        console.log('[DirectMessagesContext] Messages state updated:', msgs);
      } catch (err: any) {
        console.error('[DirectMessagesContext] Error fetching messages:', err);
        setError(err.response?.data?.message || "Failed to fetch messages");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Send message — OPTIMISTIC.
  // The message is rendered instantly with a temporary id and the network
  // persistence runs in the background, so the input clears and the bubble
  // appears immediately regardless of DB latency. When the server responds we
  // swap the temp row for the real one and broadcast it to the receiver; if it
  // fails we roll the optimistic row back and surface the error.
  const sendMessage = useCallback(
    async (receiverId: number, content: string, replyTo?: number) => {
      setError(null);

      const tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
      const optimistic: DirectMessage = {
        id: tempId,
        sender_id: authUser?.id ?? 0,
        receiver_id: receiverId,
        content,
        message_type: 'text',
        created_at: new Date().toISOString(),
        is_read: false,
        reply_to: replyTo ?? null,
        sender: authUser
          ? {
              id: authUser.id,
              username: authUser.username,
              display_name: authUser.display_name || authUser.username,
              avatar_url: authUser.avatar_url,
            }
          : undefined,
      };
      addMessage(optimistic);

      // Fire-and-forget: do NOT await, so the caller (and the input box) is
      // released immediately.
      directMessageService
        .sendDirectMessage(receiverId, content, 'text', replyTo)
        .then(message => {
          setMessages(prev => {
            const next = prev.map(m => (m.id === tempId ? message : m));
            messagesRef.current = next;
            return next;
          });
          setConversations(prev =>
            prev.map(c =>
              c.user_id === receiverId
                ? { ...c, last_message: message, last_message_time: message.created_at }
                : c
            )
          );
          socketService.broadcastDirectMessage({
            id: message.id,
            sender_id: message.sender_id,
            receiver_id: message.receiver_id,
            content: message.content,
            message_type: message.message_type,
            created_at: message.created_at,
            is_read: message.is_read,
            reply_to: message.reply_to,
            reply_to_preview: message.reply_to_preview,
            sender: message.sender,
            receiver: message.receiver,
            edited_at: message.edited_at,
          });
        })
        .catch((err: any) => {
          setMessages(prev => {
            const next = prev.filter(m => m.id !== tempId);
            messagesRef.current = next;
            return next;
          });
          console.error('[DirectMessagesContext] Error sending message:', err);
          setError(err.response?.data?.message || 'Failed to send message');
        });
    },
    // addMessage is a stable useCallback([]) defined below; referencing it in
    // the body is fine, but it must NOT go in this deps array or it hits the
    // temporal dead zone (deps are evaluated during render, before it exists).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authUser]
  );

  // Delete message
  const deleteMessage = useCallback(async (messageId: number) => {
    setError(null);
    try {
      await directMessageService.deleteDirectMessage(messageId);
      removeMessage(messageId);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to delete message");
      throw err;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edit message
  const editMessage = useCallback(async (messageId: number, content: string) => {
    setError(null);
    try {
      const updated = await directMessageService.editDirectMessage(messageId, content);
      updateMessage(messageId, content);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to edit message");
      throw err;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark as read
  const markAsRead = useCallback(async (messageId: number) => {
    setError(null);
    try {
      await directMessageService.markAsRead(messageId);
      markMessageAsRead(messageId);
    } catch (err: any) {
      console.error("Error marking message as read:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async (userId: number) => {
    setError(null);
    try {
      await directMessageService.markAllAsRead(userId);
      setMessages(prev =>
        prev.map(m => ({ ...m, is_read: true }))
      );
      messagesRef.current = messagesRef.current.map(m => ({ ...m, is_read: true }));
    } catch (err: any) {
      console.error("Error marking messages as read:", err);
    }
  }, []);

  // Local state updates
  const addMessage = useCallback((message: DirectMessage) => {
    setMessages(prev => {
      // Check if exists using current ref
      const exists = messagesRef.current.some(m => m.id === message.id);
      if (exists) return prev;
      
      const newArray = [...prev, message];
      messagesRef.current = newArray;
      return newArray;
    });
    
    // Update conversation with last message
    setConversations(prev => {
      const otherUserId = message.sender_id === currentUserIdRef.current 
        ? message.receiver_id 
        : message.sender_id;
      
      const existingConv = prev.find(c => c.user_id === otherUserId);
      
      if (existingConv) {
        // Update existing conversation
        return prev.map(conv => 
          conv.user_id === otherUserId
            ? {
                ...conv,
                last_message: message,
                last_message_time: message.created_at,
                unread_count: message.receiver_id === currentUserIdRef.current 
                  ? conv.unread_count + 1 
                  : conv.unread_count
              }
            : conv
        );
      }
      
      return prev;
    });
  }, []);

  // GLOBAL SOCKET LISTENER - uses refs to avoid stale closures
  useEffect(() => {
    const handleGlobalDirectMessage = (message: any) => {
      const currentUserId = currentUserIdRef.current;
      
      if (!currentUserId) return;
      
      // Check if message involves current user
      const isForCurrentUser = 
        message.sender_id === currentUserId || 
        message.receiver_id === currentUserId;
      
      if (!isForCurrentUser) return;
      
      const newMessage: DirectMessage = {
        id: message.id,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        content: message.content,
        message_type: message.message_type || 'text',
        created_at: message.created_at,
        is_read: message.is_read || false,
        sender: message.sender,
        receiver: message.receiver,
        edited_at: message.edited_at,
        attachment: message.attachment,
      };
      
      addMessage(newMessage);
      
      // Emit notification event for new messages from others
      // Skip if user is currently viewing this DM conversation
      const activeConv = currentConversationRef.current;
      const isViewingThisDM = activeConv && activeConv.user_id === message.sender_id;
      if (message.sender_id !== currentUserId && !isViewingThisDM && typeof window !== 'undefined') {
        const notificationEvent = new CustomEvent('newMessageReceived', {
          detail: {
            ...newMessage,
            senderName: message.sender?.display_name || message.sender?.username || 'Unknown',
            senderUsername: message.sender?.username,
            senderAvatar: message.sender?.avatar_url,
          }
        });
        window.dispatchEvent(notificationEvent);
      }
    };
    
    // Register global listeners: new messages, plus real-time edit/delete so the
    // other participant's open chat updates without a reload.
    const unsubMsg = socketService.onDirectMessage(handleGlobalDirectMessage);
    const unsubEdit = socketService.onDirectMessageEdited((data: any) => {
      if (data?.id == null) return;
      setMessages(prev => {
        const next = prev.map(m =>
          m.id === data.id ? { ...m, content: data.content, edited_at: data.edited_at || new Date().toISOString() } : m
        );
        messagesRef.current = next;
        return next;
      });
    });
    const unsubDelete = socketService.onDirectMessageDeleted((data: any) => {
      if (data?.id == null) return;
      removeMessage(data.id);
    });
    return () => {
      unsubMsg();
      unsubEdit();
      unsubDelete();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMessage]);

  const removeMessage = useCallback((messageId: number) => {
    setMessages(prev => {
      const newArray = prev.filter(m => m.id !== messageId);
      messagesRef.current = newArray;
      return newArray;
    });
  }, []);

  const updateMessage = useCallback((messageId: number, content: string) => {
    setMessages(prev => {
      const newArray = prev.map(m =>
        m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
      );
      messagesRef.current = newArray;
      return newArray;
    });
  }, []);

  const markMessageAsRead = useCallback((messageId: number) => {
    setMessages(prev => {
      const newArray = prev.map(m => (m.id === messageId ? { ...m, is_read: true } : m));
      messagesRef.current = newArray;
      return newArray;
    });
  }, []);

  // Deliver a fully-formed message that was created server-side out-of-band
  // (e.g. a file/image upload, which doesn't go through the optimistic text
  // sendMessage path). Adds it to the local view immediately AND broadcasts it
  // so the receiver sees it in real-time — no page reload required.
  const deliverUploadedMessage = useCallback((message: DirectMessage) => {
    addMessage(message);
    socketService.broadcastDirectMessage({
      id: message.id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id,
      content: message.content,
      message_type: message.message_type,
      created_at: message.created_at,
      is_read: message.is_read,
      reply_to: message.reply_to,
      reply_to_preview: message.reply_to_preview,
      sender: message.sender,
      receiver: message.receiver,
      edited_at: message.edited_at,
      attachment: message.attachment,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: DirectMessagesContextType = {
    conversations,
    currentConversation,
    messages,
    loading,
    error,
    getConversations,
    selectConversation,
    closeConversation,
    deleteConversation,
    getMessages,
    sendMessage,
    deleteMessage,
    editMessage,
    markAsRead,
    markAllAsRead,
    addMessage,
    deliverUploadedMessage,
    removeMessage,
    updateMessage,
    markMessageAsRead,
  };

  return (
    <DirectMessagesContext.Provider value={value}>
      {children}
    </DirectMessagesContext.Provider>
  );
}

export function useDirectMessages() {
  const context = useContext(DirectMessagesContext);
  if (!context) {
    throw new Error("useDirectMessages must be used within DirectMessagesProvider");
  }
  return context;
}
