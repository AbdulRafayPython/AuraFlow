// contexts/DirectMessagesContext.tsx - Global DM state management
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
  
  // Use ref to store addMessage function for socket listener to access
  const addMessageRef = useRef<(message: DirectMessage) => void>(() => {});
  
  // Global ref to track current conversation for the global listener
  const currentConversationRef = useRef<Conversation | null>(null);

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
      console.log('[DirectMessagesContext] ===== SELECTING CONVERSATION =====');
      console.log('[DirectMessagesContext] Other user ID:', userId);
      
      // Set current conversation
      const conversation = conversations.find(c => c.user_id === userId);
      if (conversation) {
        setCurrentConversation(conversation);
      }

      // Fetch messages
      const msgs = await directMessageService.getDirectMessages(userId);
      console.log('[DirectMessagesContext] Fetched messages:', msgs.length);
      setMessages(msgs);

      // Join DM socket room
      console.log('[DirectMessagesContext] 🚪 Joining DM socket room for user:', userId);
      socketService.joinDMConversation(userId);
      console.log('[DirectMessagesContext] ✅ Joined DM socket room');

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
        console.log('[DirectMessagesContext] Fetching messages for user:', userId);
        const msgs = await directMessageService.getDirectMessages(userId, limit, offset);
        console.log('[DirectMessagesContext] Received messages from API:', msgs);
        if (offset === 0) {
          setMessages(msgs);
        } else {
          setMessages(prev => [...msgs, ...prev]);
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
    async (receiverId: number, content: string) => {
      setError(null);
      try {
        console.log('[DirectMessagesContext] 📤📤📤 SEND MESSAGE START - receiverId:', receiverId, 'content:', content);
        const message = await directMessageService.sendDirectMessage(receiverId, content);
        console.log('[DirectMessagesContext] 📤 API response received:', {
          id: message.id,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id,
        });
        
        // Add to local state immediately
        console.log('[DirectMessagesContext] 📤 Adding message to local state');
        addMessage(message);

        // Broadcast via socket
        console.log('[DirectMessagesContext] 📤 Broadcasting via socket...');
        socketService.broadcastDirectMessage({
          id: message.id,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id,
          content: message.content,
          message_type: message.message_type,
          created_at: message.created_at,
          is_read: message.is_read,
        });
        console.log('[DirectMessagesContext] 📤 Socket broadcast complete');
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
    } catch (err: any) {
      console.error("Error marking messages as read:", err);
    }
  }, []);

  // Local state updates
  const addMessage = useCallback((message: DirectMessage) => {
    console.log('[DirectMessagesContext] Adding message to state:', message.id);
    setMessages(prev => {
      if (prev.some(m => m.id === message.id)) {
        console.log('[DirectMessagesContext] Message already exists, skipping:', message.id);
        return prev;
      }
      console.log('[DirectMessagesContext] ✅ Message added to messages array');
      return [...prev, message];
    });
  }, []);

  // Keep ref updated so socket listener can access latest addMessage
  useEffect(() => {
    addMessageRef.current = addMessage;
  }, [addMessage]);

  // Keep current conversation ref up to date
  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  // GLOBAL SOCKET LISTENER - Set up once to listen for all direct messages
  useEffect(() => {
    console.log('[DirectMessagesContext] 🌍🌍🌍 GLOBAL SOCKET LISTENER SETUP STARTING');
    
    const handleGlobalDirectMessage = (message: any) => {
      console.log('[DirectMessagesContext] 🌍🌍🌍 SOCKET MESSAGE RECEIVED IN HANDLER');
      console.log('[DirectMessagesContext] 🌍 Message:', {
        id: message.id,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        content: message.content?.substring(0, 30),
      });
      console.log('[DirectMessagesContext] 🌍 Active conversation user_id:', currentConversationRef.current?.user_id);
      
      // Check if this message is relevant to the current conversation
      if (!currentConversationRef.current) {
        console.log('[DirectMessagesContext] 🌍 ❌ No active conversation - IGNORING MESSAGE');
        return;
      }
      
      const isRelevant = 
        (message.sender_id === currentConversationRef.current.user_id) || 
        (message.receiver_id === currentConversationRef.current.user_id);
      
      console.log('[DirectMessagesContext] 🌍 Is relevant to conversation?', isRelevant);
      
      if (isRelevant) {
        console.log('[DirectMessagesContext] 🌍 ✅ RELEVANT - Creating DirectMessage object');
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
        };
        
        console.log('[DirectMessagesContext] 🌍 ✅ Calling addMessageRef.current()');
        addMessageRef.current(newMessage);
        console.log('[DirectMessagesContext] 🌍 ✅ Message added successfully');
      } else {
        console.log('[DirectMessagesContext] 🌍 ❌ NOT RELEVANT - Ignoring message');
      }
    };
    
    // Register global listener
    try {
      console.log('[DirectMessagesContext] 🌍 Checking if socketService exists:', !!socketService);
      console.log('[DirectMessagesContext] 🌍 Checking if onDirectMessage exists:', typeof (socketService as any).onDirectMessage);
      
      if (socketService && typeof (socketService as any).onDirectMessage === 'function') {
        console.log('[DirectMessagesContext] 🌍 ✅ onDirectMessage is a function - calling it');
        const unsubscribe = (socketService as any).onDirectMessage(handleGlobalDirectMessage);
        console.log('[DirectMessagesContext] 🌍 ✅ GLOBAL listener registered successfully, got unsubscribe:', !!unsubscribe);
        return unsubscribe;
      } else {
        console.error('[DirectMessagesContext] 🌍 ❌ onDirectMessage is NOT a function!');
      }
    } catch (err) {
      console.error('[DirectMessagesContext] 🌍 ❌ Error registering listener:', err);
    }
    
    return () => {};
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

  // Setup socket listeners for real-time direct messaging
  useEffect(() => {
    if (!currentConversation) {
      console.log('[DirectMessagesContext] Conversation selected:', currentConversation?.user_id);
      return;
    }

    console.log('[DirectMessagesContext] ===== CONVERSATION CHANGED TO:', currentConversation.user_id);
  }, [currentConversation?.user_id]);

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
