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

export interface Attachment {
  id?: number;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  duration?: number;
}

export interface ReplyToPreview {
  id: number;
  content: string;
  author: string;
  message_type: string;
}

/** Structured engagement-agent card attached to a message_type='ai' message. */
export type EngagementCard =
  | { kind: 'poll'; question: string; options: string[] }
  | { kind: 'starter'; text: string }
  | {
      kind: 'icebreaker';
      title: string;
      description?: string | null;
      questions?: string[];
      example?: string | null;
      duration?: string | null;
    }
  | {
      kind: 'challenge';
      title: string;
      description?: string | null;
      theme?: string | null;
      duration?: string | null;
    };

export interface PollState {
  tallies: number[];
  total: number;
  my_vote: number | null;
}

export interface Message {
  id: number;
  channel_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'ai' | 'voice' | 'video';
  created_at: string;
  author: string;
  card?: EngagementCard;
  avatar_url?: string;
  edited_at?: string | null;
  reply_to?: number | null;
  reply_to_preview?: ReplyToPreview;
  reactions?: Reaction[];
  attachment?: Attachment;
  is_blocked?: boolean;
  is_pinned?: boolean;
  moderation?: {
    action: 'allow' | 'warn' | 'flag' | 'block' | 'remove_message' | 'remove_user' | 'block_user';
    severity: 'none' | 'low' | 'medium' | 'high';
    confidence?: number;
    reasons?: string[];
    violation_count?: number;
    message?: string;
    explanation?: string;
    pending_ai_review?: boolean;
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
  message_type: 'text' | 'image' | 'file' | 'ai' | 'voice' | 'video' | 'call';
  created_at: string;
  is_read: boolean;
  edited_at?: string | null;
  reply_to?: number | null;
  reply_to_preview?: ReplyToPreview;
  reactions?: Reaction[];
  attachment?: Attachment;
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
  message_type?: 'text' | 'image' | 'file' | 'voice' | 'video';
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
  /** Opaque UUID (communities.public_id) — not the internal DB row id. */
  id: string;
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
  channel_count?: number;
  created_at?: string;
  creator?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
  /** Subset of {'safe','recaps','multilingual'} — drives Discover badges. */
  intelligence_profile?: string[];
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
  /** Opaque UUID (users.public_id) — used for DM URLs instead of the raw id. */
  public_id?: string;
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
  /** Opaque UUID (users.public_id) — used for DM URLs instead of the raw id. */
  public_id?: string;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

export interface CommunityMember extends User {
  role: 'owner' | 'admin' | 'member';
  is_blocked?: boolean;
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