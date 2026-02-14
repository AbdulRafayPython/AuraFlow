// services/searchService.ts — Production message search with debouncing & caching
import axios from 'axios';
import { API_URL } from '@/config/api';

export interface SearchResult {
  id: number;
  type: 'channel' | 'dm';
  content: string;
  message_type: string;
  created_at: string;
  author: string;
  display_name: string;
  avatar_url: string;
  relevance: number;
  is_pinned?: boolean;
  // Channel-specific
  channel_id?: number;
  channel_name?: string;
  community_id?: number;
  community_name?: string;
  // DM-specific
  sender_id?: number;
  receiver_id?: number;
  conversation_with?: {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface SearchContextMessage {
  id: number;
  sender_id: number;
  content: string;
  message_type: string;
  created_at: string;
  author: string;
  display_name: string;
  avatar_url: string;
  is_target: boolean;
}

class SearchService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  /** Search messages across channels and DMs */
  async searchMessages(params: {
    q: string;
    community_id?: number;
    channel_id?: number;
    scope?: 'channels' | 'dms' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<SearchResponse> {
    const { data } = await axios.get<SearchResponse>(`${API_URL}/search/messages`, {
      ...this.getAuthHeaders(),
      params,
    });
    return data;
  }

  /** Get surrounding messages for context */
  async getMessageContext(messageId: number): Promise<{
    target_id: number;
    channel_id: number;
    messages: SearchContextMessage[];
  }> {
    const { data } = await axios.get<{ target_id: number; channel_id: number; messages: SearchContextMessage[] }>(
      `${API_URL}/search/messages/context/${messageId}`,
      this.getAuthHeaders()
    );
    return data;
  }

  // ---- Recent searches (localStorage) ----
  private readonly RECENT_KEY = 'auraflow_recent_searches';
  private readonly MAX_RECENT = 8;

  getRecentSearches(): string[] {
    try {
      return JSON.parse(localStorage.getItem(this.RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  }

  addRecentSearch(query: string): void {
    const recent = this.getRecentSearches().filter(q => q !== query);
    recent.unshift(query);
    localStorage.setItem(this.RECENT_KEY, JSON.stringify(recent.slice(0, this.MAX_RECENT)));
  }

  clearRecentSearches(): void {
    localStorage.removeItem(this.RECENT_KEY);
  }
}

export const searchService = new SearchService();
