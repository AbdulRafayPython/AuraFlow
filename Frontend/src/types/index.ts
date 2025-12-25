// types/index.ts - Single source of truth for ALL types
// types/index.ts

export interface Reaction {
  emoji: string;
  count: number;
  users: {
    user_id: number;
    username: string;
    display_name: string;
    avatar_url?: string;
  }[];
  reacted_by_current_user: boolean;
}

export interface Message {
  id: number;
  channel_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'ai';
  created_at: string;
  author: string;
  avatar_url?: string;   // ← CHANGE THIS LINE
  edited_at?: string | null;
  reply_to?: number | null;
  reactions?: Reaction[];
  moderation?: {
    action: 'allow' | 'warn' | 'flag' | 'block' | 'remove_message' | 'remove_user' | 'block_user';
    severity: 'none' | 'low' | 'medium' | 'high';
    confidence?: number;
    reasons?: string[];
    violation_count?: number;
    message?: string;
    flagged?: boolean;
    removed_from_community?: boolean;
    blocked?: boolean;
  };
}

export interface DirectMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'ai';
  created_at: string;
  is_read: boolean;
  edited_at?: string | null;
  reactions?: Reaction[];
  sender?: {
    id: number;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
  receiver?: {
    id: number;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface SendMessageData {
  channel_id: number;
  content: string;
  message_type?: 'text' | 'image' | 'file';
  reply_to?: number;
}

export interface SendMessageResponse {
  message?: Message;
  moderation?: Message['moderation'];
}

export interface UserStatus {
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface TypingIndicator {
  username: string;
  channel_id: number;
  is_typing: boolean;
}

export interface Community {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  logo_url?: string;
  banner_url?: string;
  description?: string;
  display_name?: string;
  bio?: string;
  role?: 'owner' | 'admin' | 'member';
  member_count?: number;
  created_at?: string;
  creator?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice' | 'private' | 'announcement';
  description?: string;
  created_at: string;
  community_id?: number;
}

export interface Friend {
  id: number;
  username: string;
  display_name: string;
  avatar?: string;
  avatar_url?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status?: string;
  last_seen?: string;
}

export interface FriendRequest {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  sender?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface User {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

export interface CommunityMember extends User {
  role: 'owner' | 'admin' | 'member';
}

export interface BlockedUser {
  id: number;
  blocked_user_id: number;
  blocked_by_id?: number;
  blocked_at: string;
  blocked_user: {
    id: number;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}
export interface CreateCommunityPayload {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  display_name?: string;
  bio?: string;
}

export interface TypingUser {
  username: string;
  timestamp: number;
}