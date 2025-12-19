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
      console.log('%c[✅ INITIALIZED CONVERSATIONS FROM FRIENDS]', 'color: #00ff00', {
        count: newConversations.length,
        friends: friends.map(f => f.display_name || f.username)
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

  // Update current user ID from auth context - THIS FIXES THE ISSUE
  useEffect(() => {
    if (authUser?.id) {
      console.log('%c[✅ CURRENT USER SET]', 'color: #00ff00', {
        userId: authUser.id,
        username: authUser.username,
        timestamp: new Date().toLocaleTimeString(),
      });
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
      console.log('%c[🚀 SELECT CONVERSATION START]', 'color: #00ff00; font-weight: bold', {
        target_user_id: userId,
        timestamp: new Date().toLocaleTimeString(),
      });
      
      // Set current conversation
      const conversation = conversations.find(c => c.user_id === userId);
      if (conversation) {
        console.log('%c[✅ CONVERSATION FOUND]', 'color: #00ff00', {
          user_id: userId,
        });
        setCurrentConversation(conversation);
        currentConversationRef.current = conversation; // Update ref immediately
      } else {
        console.log('%c[⚠️ CONVERSATION NOT FOUND]', 'color: #ff8800', {
          user_id: userId,
        });
        // Create a temporary conversation object for the ref
        currentConversationRef.current = {
          user_id: userId,
          user: {} as User,
          unread_count: 0,
          last_message_time: new Date().toISOString()
        };
      }

      // Fetch messages
      console.log('%c[📥 FETCHING MESSAGES]', 'color: #0088ff', {
        user_id: userId,
      });
      const msgs = await directMessageService.getDirectMessages(userId);
      console.log('%c[✅ MESSAGES FETCHED]', 'color: #00ff00', {
        user_id: userId,
        count: msgs.length,
        timestamp: new Date().toLocaleTimeString(),
      });
      setMessages(msgs);
      messagesRef.current = msgs; // Update ref immediately

      // Join DM socket room
      console.log('%c[🚪 JOINING SOCKET ROOM]', 'color: #0088ff', {
        user_id: userId,
      });
      socketService.joinDMConversation(userId);
      console.log('%c[✅ JOINED SOCKET ROOM]', 'color: #00ff00', {
        user_id: userId,
        timestamp: new Date().toLocaleTimeString(),
      });

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
    async (receiverId: number, content: string) => {
      setError(null);
      try {
        console.log('%c[📤 SEND MESSAGE START]', 'color: #00ff00; font-weight: bold', {
          receiverId,
          content_len: content.length,
          content_preview: content.substring(0, 50),
          timestamp: new Date().toLocaleTimeString(),
        });
        
        const message = await directMessageService.sendDirectMessage(receiverId, content);
        
        console.log('%c[📤 API RESPONSE RECEIVED]', 'color: #00ff00', {
          msg_id: message.id,
          from: message.sender_id,
          to: message.receiver_id,
          has_sender: !!message.sender,
          has_receiver: !!message.receiver,
          timestamp: new Date().toLocaleTimeString(),
        });
        
        // Add to local state immediately
        console.log('%c[➕ ADDING TO LOCAL STATE]', 'color: #0088ff', {
          msg_id: message.id,
        });
        addMessage(message);
        console.log('%c[✅ ADDED TO LOCAL STATE]', 'color: #00ff00');

        // Broadcast via socket with full message data
        console.log('%c[🔊 BROADCASTING VIA SOCKET]', 'color: #0088ff', {
          msg_id: message.id,
          receiver_id: receiverId,
          has_sender: !!message.sender,
          has_receiver: !!message.receiver,
          timestamp: new Date().toLocaleTimeString(),
        });
        
        socketService.broadcastDirectMessage({
          id: message.id,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id,
          content: message.content,
          message_type: message.message_type,
          created_at: message.created_at,
          is_read: message.is_read,
          sender: message.sender,
          receiver: message.receiver,
          edited_at: message.edited_at,
        });
        
        console.log('%c[✅ BROADCAST COMPLETE]', 'color: #00ff00; font-weight: bold', {
          msg_id: message.id,
          timestamp: new Date().toLocaleTimeString(),
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
    console.log('%c[📨 addMessage FUNCTION CALLED]', 'color: #0088ff; font-weight: bold', {
      message_id: message.id,
      from: message.sender_id,
      to: message.receiver_id,
      content_preview: message.content?.substring(0, 50),
      timestamp: new Date().toLocaleTimeString(),
    });
    
    setMessages(prev => {
      // Check if exists using current ref
      const exists = messagesRef.current.some(m => m.id === message.id);
      
      if (exists) {
        console.log('%c[⚠️ MESSAGE DUPLICATE]', 'color: #ff8800', {
          message_id: message.id,
          reason: 'Message already in state, skipping',
        });
        return prev;
      }
      
      const newArray = [...prev, message];
      messagesRef.current = newArray; // Update ref immediately
      console.log('%c[✅ MESSAGE ADDED TO STATE]', 'color: #00ff00; font-weight: bold', {
        message_id: message.id,
        new_array_length: newArray.length,
        prev_length: prev.length,
        timestamp: new Date().toLocaleTimeString(),
      });
      
      return newArray;
    });
  }, []);

  // GLOBAL SOCKET LISTENER - FIXED to use refs and simpler logic
  useEffect(() => {
    console.log('%c[🌍 LISTENER SETUP FIXED VERSION]', 'color: #00ff00; font-weight: bold', {
      timestamp: new Date().toLocaleTimeString(),
    });
    
    const handleGlobalDirectMessage = (message: any) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log('%c[🌍 NEW MESSAGE RECEIVED]', 'color: #ff00ff; font-weight: bold', {
        timestamp,
        msg_id: message.id,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        content_preview: message.content?.substring(0, 50),
      });
      
      // Get current user ID from ref
      const currentUserId = currentUserIdRef.current;
      
      if (!currentUserId) {
        console.log('%c[❌ NO CURRENT USER ID]', 'color: #ff0000', 'No current user ID found in ref - ignoring message');
        return;
      }
      
      console.log('%c[🔍 CHECKING MESSAGE RELEVANCE]', 'color: #ffff00', {
        currentUserId,
        message_sender: message.sender_id,
        message_receiver: message.receiver_id,
        is_sender: message.sender_id === currentUserId,
        is_receiver: message.receiver_id === currentUserId,
      });
      
      // Check if message involves current user (either as sender or receiver)
      const isForCurrentUser = 
        message.sender_id === currentUserId || 
        message.receiver_id === currentUserId;
      
      if (!isForCurrentUser) {
        console.log('%c[⚠️ MESSAGE NOT FOR ME]', 'color: #ff8800', {
          reason: 'Message does not involve current user',
          message_users: `${message.sender_id} -> ${message.receiver_id}`,
          currentUserId,
        });
        return;
      }
      
      console.log('%c[✅ MESSAGE IS RELEVANT]', 'color: #00ff00', {
        id: message.id,
        for_current_user: true,
      });
      
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
      
      console.log('%c[📨 ADDING MESSAGE TO STATE]', 'color: #0088ff', newMessage);
      addMessage(newMessage);
      console.log('%c[✅ MESSAGE PROCESSED SUCCESSFULLY]', 'color: #00ff00; font-weight: bold');
    };
    
    // Register global listener
    try {
      console.log('%c[🔌 REGISTERING SOCKET LISTENER]', 'color: #0088ff', 'Attempting to register socket listener');
      
      if (socketService && typeof (socketService as any).onDirectMessage === 'function') {
        const unsubscribe = (socketService as any).onDirectMessage(handleGlobalDirectMessage);
        console.log('%c[✅ LISTENER REGISTERED SUCCESSFULLY]', 'color: #00ff00', {
          has_unsubscribe: !!unsubscribe,
          timestamp: new Date().toLocaleTimeString(),
        });
        return unsubscribe;
      } else {
        console.error('%c[❌ onDirectMessage NOT AVAILABLE]', 'color: #ff0000', {
          type: typeof (socketService as any).onDirectMessage,
          socketService_exists: !!socketService,
        });
      }
    } catch (err) {
      console.error('%c[❌ LISTENER REGISTRATION FAILED]', 'color: #ff0000', err);
    }
    
    return () => {
      console.log('%c[🗑️ CLEANING UP LISTENER]', 'color: #ff8800', 'Socket listener cleanup');
    };
  }, [addMessage]); // Only depend on addMessage

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