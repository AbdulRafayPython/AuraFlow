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

  // Initialize conversations from friends list
  useEffect(() => {
    if (friends && friends.length > 0) {
      const newConversations: Conversation[] = friends.map(friend => ({
        user_id: friend.id,
        user: {
          id: friend.id,
          username: friend.username,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url,
          email: ''  // Add required field
        } as User,
        unread_count: 0,
        last_message_time: new Date().toISOString(),
        last_message: undefined
      }));
      setConversations(newConversations);
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

  // Fetch conversations
  const getConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("Fetching conversations...");
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

      // Join DM socket room
      socketService.joinDMConversation(userId);

      // Mark all as read
      if (msgs.length > 0) {
        for (const msg of msgs.filter(m => !m.is_read)) {
          await directMessageService.markAsRead(msg.id);
        }
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

  // Send message
  const sendMessage = useCallback(
    async (receiverId: number, content: string, replyTo?: number) => {
      setError(null);
      try {
        const message = await directMessageService.sendDirectMessage(receiverId, content, 'text', replyTo);
        
        // Add to local state immediately
        addMessage(message);

        // Broadcast via socket with full message data
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
      } catch (err: any) {
        console.error('[DirectMessagesContext] Error sending message:', err);
        setError(err.response?.data?.message || "Failed to send message");
        throw err;
      }
    },
    []
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
      if (message.sender_id !== currentUserId && typeof window !== 'undefined') {
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
    
    // Register global listener
    const unsubscribe = socketService.onDirectMessage(handleGlobalDirectMessage);
    return unsubscribe;
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