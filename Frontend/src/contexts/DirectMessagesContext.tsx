// contexts/DirectMessagesContext.tsx - Global DM state management
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { DirectMessage, User } from "@/types";
import { directMessageService } from "@/services/directMessageService";
import { socketService } from "@/services/socketService";

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
  sendMessage: (receiverId: number, content: string) => Promise<void>;
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch conversations
  const getConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch from API - endpoint to get list of conversations
      // For now, we'll just fetch friends as potential conversations
      // This should be replaced with actual API call
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
      }

      // Fetch messages
      const msgs = await directMessageService.getDirectMessages(userId);
      setMessages(msgs);

      // Join DM socket room
      socketService.joinDMConversation(userId);

      // Mark all as read
      if (msgs.length > 0) {
        for (const msg of msgs.filter(m => !m.is_read)) {
          await directMessageService.markAsRead(msg.id);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [conversations]);

  // Close current conversation
  const closeConversation = useCallback(() => {
    socketService.leaveDMConversation();
    setCurrentConversation(null);
    setMessages([]);
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
        const msgs = await directMessageService.getDirectMessages(userId, limit, offset);
        if (offset === 0) {
          setMessages(msgs);
        } else {
          setMessages(prev => [...msgs, ...prev]);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || "Failed to fetch messages");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Send message
  const sendMessage = useCallback(
    async (receiverId: number, content: string) => {
      setError(null);
      try {
        const message = await directMessageService.sendDirectMessage(receiverId, content);
        // Add to local state immediately
        addMessage(message);

        // Broadcast via socket
        socketService.broadcastDirectMessage({
          id: message.id,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id,
          content: message.content,
          message_type: message.message_type,
          created_at: message.created_at,
          is_read: message.is_read,
        });
      } catch (err: any) {
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
    } catch (err: any) {
      console.error("Error marking messages as read:", err);
    }
  }, []);

  // Local state updates
  const addMessage = useCallback((message: DirectMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  const removeMessage = useCallback((messageId: number) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const updateMessage = useCallback((messageId: number, content: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
      )
    );
  }, []);

  const markMessageAsRead = useCallback((messageId: number) => {
    setMessages(prev =>
      prev.map(m => (m.id === messageId ? { ...m, is_read: true } : m))
    );
  }, []);

  // Setup socket listeners
  useEffect(() => {
    if (!currentConversation) return;

    // Listen for direct messages
    const handleDirectMessage = (message: any) => {
      if (currentConversation?.user_id === message.sender_id) {
        addMessage({
          id: message.id,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id,
          content: message.content,
          created_at: message.created_at,
          is_read: message.is_read,
        } as DirectMessage);
      }
    };

    // Register the handler if method exists
    let unsubscribe: (() => void) | null = null;
    if (socketService && typeof (socketService as any).onDirectMessage === 'function') {
      unsubscribe = (socketService as any).onDirectMessage(handleDirectMessage);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentConversation, addMessage]);

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
