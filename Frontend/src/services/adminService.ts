/**
 * Community Dashboard Service
 * Handles all admin/community dashboard API calls.
 * All endpoints are scoped to a specific community.
 * Security: All endpoints require JWT + owner/admin role for the community.
 */

import api from './appService';

// =====================================
// TYPES
// =====================================

export interface OwnedCommunity {
  id: number;
  name: string;
  icon: string;
  color: string;
  logo_url: string | null;
  member_count: number;
  channel_count: number;
  role: string;
}

export interface CommunityOverviewStats {
  users: {
    total: number;
    active_today: number;
    online: number;
  };
  messages: {
    today: number;
    this_week: number;
    trend_percent: number;
  };
  channels: {
    total: number;
  };
  communities?: {
    total: number;
    channels: number;
  };
  moderation: {
    flagged_today: number;
    blocked_users: number;
    high_severity: number;
  };
  agents: Record<string, { status: string; activity_count: number; last_activity: string | null }>;
}

export interface ModerationAlert {
  id: number;
  user: {
    id: number;
    username: string;
    avatar_url: string | null;
  };
  channel: {
    id: number;
    name: string;
  };
  message_preview: string;
  flag_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  action_taken: string;
  reason: string;
  created_at: string;
}

export interface FlaggedMessage {
  id: number;
  user: {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    violation_count: number;
  };
  channel: {
    id: number;
    name: string;
  };
  message_text: string;
  flag_type: string;
  severity: string;
  confidence: number;
  action_taken: string;
  reason: string;
  created_at: string;
}

export interface BlockedUser {
  id: number;
  user: {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    email: string;
  };
  blocked_at: string;
  reason: string;
  total_violations: number;
}

export interface CommunityMember {
  id: number;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  status: string;
  role: string;
  joined_at: string;
  created_at?: string;
  last_seen: string | null;
  stats: {
    message_count: number;
    violation_count: number;
    community_count?: number;
    ban_count?: number;
  };
}

export interface MoodTrend {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  avg_score: number;
}

export interface DailyEngagement {
  date: string;
  messages: number;
  message_count?: number;
  active_users: number;
  new_members: number;
}

export interface DailyReport {
  summary: {
    total_messages: number;
    active_users: number;
    new_users: number;
    message_trend_percent: number;
  };
  moderation: {
    total_flags: number;
    breakdown: Record<string, number>;
  };
  ai_agents: Record<string, number>;
  sentiment: Record<string, number>;
}

export interface WeeklyReport {
  period: {
    start: string;
    end: string;
  };
  summary: {
    total_messages: number;
    active_users: number;
    new_users: number;
    message_trend_percent: number;
    user_trend_percent: number;
  };
  top_communities: Array<{
    id: number;
    name: string;
    message_count: number;
  }>;
}

export interface HourlyActivity {
  hour: number;
  messages: number;
  day_of_week?: number;
  count?: number;
}

export interface ChannelStats {
  id: number;
  name: string;
  message_count: number;
  member_count: number;
  last_activity: string | null;
  community_name?: string;
}

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// =====================================
// API SERVICE
// =====================================

class AdminService {
  // =====================
  // OWNED COMMUNITIES
  // =====================
  
  /**
   * Get list of communities where the current user is owner/admin
   */
  async getOwnedCommunities(): Promise<OwnedCommunity[]> {
    try {
      const response: any = await api.get('/api/admin/owned-communities');
      return response.communities || [];
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch owned communities');
    }
  }

  // =====================
  // OVERVIEW (Community Scoped)
  // =====================
  
  /**
   * Get overview stats for a specific community
   */
  async getOverviewStats(communityId: number): Promise<CommunityOverviewStats> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/overview`);
      return response.stats;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch overview stats');
    }
  }

  /**
   * Get recent moderation alerts for a community
   */
  async getRecentAlerts(communityId: number, limit: number = 10): Promise<ModerationAlert[]> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/alerts?limit=${limit}`);
      return response.alerts || [];
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch recent alerts');
    }
  }

  // =====================
  // GLOBAL OVERVIEW (System Admin)
  // =====================

  async getGlobalOverviewStats(): Promise<CommunityOverviewStats> {
    try {
      const response: any = await api.get('/api/admin/overview/stats');
      const s = response.stats;
      // Normalize shape: backend returns communities.channels, frontend expects channels.total
      return {
        ...s,
        channels: { total: s.communities?.channels || 0 },
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch global overview stats');
    }
  }

  async getGlobalRecentAlerts(limit: number = 10): Promise<ModerationAlert[]> {
    try {
      const response: any = await api.get(`/api/admin/overview/recent-alerts?limit=${limit}`);
      return response.alerts || [];
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch global recent alerts');
    }
  }

  // =====================
  // MODERATION (Community Scoped)
  // =====================

  /**
   * Get flagged messages for a community
   */
  async getFlaggedMessages(communityId: number, params: {
    status?: string;
    severity?: string;
    flag_type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ messages: FlaggedMessage[]; pagination: PaginationInfo }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.append('status', params.status);
      if (params.severity) queryParams.append('severity', params.severity);
      if (params.flag_type) queryParams.append('flag_type', params.flag_type);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const response: any = await api.get(`/api/admin/community/${communityId}/moderation/flagged?${queryParams}`);
      return {
        messages: response.flagged_messages || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false }
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch flagged messages');
    }
  }

  /**
   * Resolve a moderation flag
   */
  async resolveModerationFlag(communityId: number, logId: number, action: 'approve' | 'warn' | 'delete' | 'ban' | 'mute', note?: string): Promise<void> {
    try {
      await api.post(`/api/admin/community/${communityId}/moderation/resolve/${logId}`, { action, note });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to resolve moderation');
    }
  }

  /**
   * Get blocked users for a community
   */
  async getBlockedUsers(communityId: number, params: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ users: BlockedUser[]; pagination: PaginationInfo }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const response: any = await api.get(`/api/admin/community/${communityId}/moderation/blocked?${queryParams}`);
      return {
        users: response.blocked_users || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false }
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch blocked users');
    }
  }

  /**
   * Unblock a user from a community
   */
  async unblockUser(communityId: number, userId: number): Promise<void> {
    try {
      await api.del(`/api/admin/community/${communityId}/moderation/unblock/${userId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to unblock user');
    }
  }

  /**
   * Block a user from a community
   */
  async blockUser(communityId: number, userId: number, reason: string): Promise<void> {
    try {
      await api.post(`/api/admin/community/${communityId}/moderation/block`, { user_id: userId, reason });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to block user');
    }
  }

  // NEW — v2
  async triggerModerationScan(communityId: number, options: { channel_id?: number; hours_back?: number } = {}): Promise<{ task_id: string }> { // NEW — v2
    try { // NEW — v2
      const res = await api.post(`/api/admin/community/${communityId}/moderation/scan`, options); // NEW — v2
      return res.data; // NEW — v2
    } catch (error: any) { // NEW — v2
      throw new Error(error.data?.error || 'Failed to start scan'); // NEW — v2
    } // NEW — v2
  } // NEW — v2

  async getModerationScanStatus(communityId: number, channelId: number): Promise<{ status: string; scanned: number; total: number; flagged: number; percent: number }> { // NEW — v2
    try { // NEW — v2
      const res = await api.get(`/api/admin/community/${communityId}/moderation/scan/status`, { params: { channel_id: channelId } }); // NEW — v2
      return res.data; // NEW — v2
    } catch (error: any) { // NEW — v2
      throw new Error(error.data?.error || 'Failed to get scan status'); // NEW — v2
    } // NEW — v2
  } // NEW — v2

  // =====================
  // MEMBER MANAGEMENT (Community Scoped)
  // =====================

  /**
   * Get members of a community
   */
  async getMembers(communityId: number, params: {
    status?: string;
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ members: CommunityMember[]; pagination: PaginationInfo }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.append('status', params.status);
      if (params.role) queryParams.append('role', params.role);
      if (params.search) queryParams.append('search', params.search);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const response: any = await api.get(`/api/admin/community/${communityId}/members?${queryParams}`);
      return {
        members: response.members || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false }
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch members');
    }
  }

  /**
   * Get member details
   */
  async getMemberDetails(communityId: number, userId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/members/${userId}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch member details');
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(communityId: number, userId: number, role: 'member' | 'admin'): Promise<void> {
    try {
      await api.put(`/api/admin/community/${communityId}/members/${userId}/role`, { role });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to update member role');
    }
  }

  /**
   * Remove member from community
   */
  async removeMember(communityId: number, userId: number): Promise<void> {
    try {
      await api.del(`/api/admin/community/${communityId}/members/${userId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to remove member');
    }
  }

  // =====================
  // ANALYTICS (Community Scoped)
  // =====================

  /**
   * Get community health metrics
   */
  async getCommunityHealth(communityId: number, days: number = 7): Promise<{
    health_score: number;
    activity_trend: 'up' | 'down' | 'stable';
    metrics: {
      engagement_rate: number;
      retention_rate: number;
      growth_rate: number;
    };
  }> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/analytics/health?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch community health');
    }
  }

  /**
   * Get mood trends for a community
   */
  async getMoodTrends(communityId: number, days: number = 7): Promise<{
    daily_trends: MoodTrend[];
    sentiment_distribution: Record<string, number>;
    sentiment_percentages?: Record<string, number>;
    trend_direction?: string;
    dominant_mood?: string;
    mood_categories?: Record<string, number>;
    hourly_summary?: Array<{ hour: string; dominant_mood: string; message_count: number }>;
    total_entries?: number;
    has_data?: boolean;
  }> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/analytics/mood?days=${days}`);
      return {
        daily_trends: response.daily_trends || [],
        sentiment_distribution: response.sentiment_distribution || {},
        sentiment_percentages: response.sentiment_percentages || {},
        trend_direction: response.trend_direction || 'stable',
        dominant_mood: response.dominant_mood || 'neutral',
        mood_categories: response.mood_categories || {},
        hourly_summary: response.hourly_summary || [],
        total_entries: response.total_entries || 0,
        has_data: response.has_data ?? false
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch mood trends');
    }
  }

  /**
   * Get engagement analytics for a community
   */
  async getEngagementAnalytics(communityId: number, days: number = 7): Promise<{
    daily_engagement: DailyEngagement[];
    hourly_distribution: HourlyActivity[];
    top_channels: ChannelStats[];
  }> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/analytics/engagement?days=${days}`);
      return {
        daily_engagement: response.daily_engagement || [],
        hourly_distribution: response.hourly_distribution || [],
        top_channels: response.top_channels || []
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch engagement analytics');
    }
  }

  // =====================
  // REPORTS (Community Scoped)
  // =====================

  /**
   * Get daily report for a community
   */
  async getDailyReport(communityId: number, date?: string): Promise<any> {
    try {
      let url = `/api/admin/community/${communityId}/reports/daily`;
      if (date) url += `?date=${date}`;
      
      const response: any = await api.get(url);
      return response.report;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch daily report');
    }
  }

  /**
   * Get weekly report for a community
   */
  async getWeeklyReport(communityId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/reports/weekly`);
      return response.report;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch weekly report');
    }
  }

  // =====================
  // COMMUNITY SETTINGS
  // =====================

  /**
   * Get community settings
   */
  async getCommunitySettings(communityId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/community/${communityId}/settings`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch community settings');
    }
  }

  /**
   * Update community settings
   */
  async updateCommunitySettings(communityId: number, settings: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
  }): Promise<void> {
    try {
      await api.put(`/api/admin/community/${communityId}/settings`, settings);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to update community settings');
    }
  }

  // =====================
  // GLOBAL / SYSTEM ADMIN METHODS
  // These call platform-wide endpoints (no community scoping)
  // =====================

  async getGlobalFlaggedMessages(params: {
    status?: string;
    severity?: string;
    flag_type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ messages: FlaggedMessage[]; pagination: PaginationInfo }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.append('status', params.status);
      if (params.severity) queryParams.append('severity', params.severity);
      if (params.flag_type) queryParams.append('flag_type', params.flag_type);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());
      const response: any = await api.get(`/api/admin/moderation/flagged?${queryParams}`);
      return {
        messages: response.flagged_messages || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false }
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch flagged messages');
    }
  }

  async resolveGlobalModerationFlag(logId: number, action: string, note?: string): Promise<void> {
    try {
      await api.post(`/api/admin/moderation/resolve/${logId}`, { action, note });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to resolve moderation');
    }
  }

  async getGlobalBlockedUsers(params: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ users: BlockedUser[]; pagination: PaginationInfo }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());
      const response: any = await api.get(`/api/admin/moderation/blocked-users?${queryParams}`);
      return {
        users: response.blocked_users || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false }
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch blocked users');
    }
  }

  async unblockGlobalUser(blockId: number): Promise<void> {
    try {
      await api.del(`/api/admin/moderation/unblock/${blockId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to unblock user');
    }
  }

  async getGlobalUsers(params: {
    status?: string;
    account_status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ members: CommunityMember[]; pagination: PaginationInfo }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.append('status', params.status);
      if (params.account_status) queryParams.append('account_status', params.account_status);
      if (params.search) queryParams.append('search', params.search);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());
      const response: any = await api.get(`/api/admin/users?${queryParams}`);
      return {
        members: (response.users || []).map((u: any) => ({
          ...u,
          role: u.system_role || 'user',
          joined_at: u.created_at,
        })),
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false }
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch users');
    }
  }

  async getGlobalUserDetails(userId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/users/${userId}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch user details');
    }
  }

  async getGlobalCommunityHealth(days: number = 7): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/analytics/community-health?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch community health');
    }
  }

  async getGlobalMoodTrends(days: number = 7): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/analytics/mood-trends?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch mood trends');
    }
  }

  async getGlobalEngagementAnalytics(days: number = 7): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/analytics/engagement?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch engagement analytics');
    }
  }

  async getGlobalDailyReport(date?: string): Promise<any> {
    try {
      let url = '/api/admin/reports/daily';
      if (date) url += `?date=${date}`;
      const response: any = await api.get(url);
      return response.report;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch daily report');
    }
  }

  async getGlobalWeeklyReport(): Promise<any> {
    try {
      const response: any = await api.get('/api/admin/reports/weekly');
      return response.report;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch weekly report');
    }
  }

  // =====================
  // SYSTEM USER MANAGEMENT
  // =====================

  async updateUserSystemRole(userId: number, role: 'user' | 'system_admin'): Promise<void> {
    try {
      await api.put(`/api/admin/system/users/${userId}/role`, { role });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to update user role');
    }
  }

  async warnUser(userId: number, reason: string): Promise<void> {
    try {
      await api.post(`/api/admin/system/users/${userId}/warn`, { reason });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to send warning');
    }
  }

  async suspendUser(userId: number, reason: string, durationDays: number = 7): Promise<void> {
    try {
      await api.post(`/api/admin/system/users/${userId}/suspend`, { reason, duration_days: durationDays });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to suspend user');
    }
  }

  async banUser(userId: number, reason: string): Promise<void> {
    try {
      await api.post(`/api/admin/system/users/${userId}/ban`, { reason });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to ban user');
    }
  }

  async unsuspendUser(userId: number): Promise<void> {
    try {
      await api.post(`/api/admin/system/users/${userId}/unsuspend`, {});
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to restore user');
    }
  }

  async getUserAdminActions(userId: number): Promise<any[]> {
    try {
      const response: any = await api.get(`/api/admin/system/users/${userId}/actions`);
      return response.actions || [];
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch user actions');
    }
  }

  // =====================
  // SYSTEM COMMUNITY MANAGEMENT
  // =====================

  async getSystemCommunities(params: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ communities: any[]; pagination: PaginationInfo }> {
    try {
      const qp = new URLSearchParams();
      if (params.search) qp.append('search', params.search);
      if (params.limit) qp.append('limit', params.limit.toString());
      if (params.offset) qp.append('offset', params.offset.toString());
      const response: any = await api.get(`/api/admin/system/communities?${qp}`);
      return {
        communities: response.communities || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false },
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch communities');
    }
  }

  async getSystemCommunityDetails(communityId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/admin/system/communities/${communityId}`);
      return response.community;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch community details');
    }
  }

  async getSystemCommunityActivity(communityId: number): Promise<{ heatmap: number[][]; trends: any }> {
    try {
      const response: any = await api.get(`/api/admin/system/communities/${communityId}/activity`);
      return { heatmap: response.heatmap, trends: response.trends };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch activity data');
    }
  }

  async updateSystemCommunity(communityId: number, data: { name: string; description: string }): Promise<void> {
    try {
      await api.put(`/api/admin/system/communities/${communityId}`, data);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to update community');
    }
  }

  async deleteSystemCommunity(communityId: number): Promise<void> {
    try {
      await api.del(`/api/admin/system/communities/${communityId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to delete community');
    }
  }

  async getSystemCommunityMembers(communityId: number, params: {
    search?: string;
    role?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ members: any[]; pagination: PaginationInfo }> {
    try {
      const qp = new URLSearchParams();
      if (params.search) qp.append('search', params.search);
      if (params.role) qp.append('role', params.role);
      if (params.limit) qp.append('limit', params.limit.toString());
      if (params.offset) qp.append('offset', params.offset.toString());
      const response: any = await api.get(`/api/admin/system/communities/${communityId}/members?${qp}`);
      return {
        members: response.members || [],
        pagination: response.pagination || { total: 0, limit: 20, offset: 0, has_more: false },
      };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch community members');
    }
  }

  async updateCommunityMemberRole(communityId: number, userId: number, role: 'admin' | 'member'): Promise<void> {
    try {
      await api.put(`/api/admin/system/communities/${communityId}/members/${userId}/role`, { role });
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to update member role');
    }
  }

  async removeCommunityMember(communityId: number, userId: number): Promise<void> {
    try {
      await api.del(`/api/admin/system/communities/${communityId}/members/${userId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to remove member');
    }
  }

  // ==================
  // AUDIT LOGS
  // ==================

  async getAuditLogs(params: {
    action_type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any> {
    try {
      const query = new URLSearchParams();
      if (params.action_type) query.set('action_type', params.action_type);
      if (params.search) query.set('search', params.search);
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset !== undefined) query.set('offset', String(params.offset));
      const res = await api.get(`/api/admin/system/audit-logs?${query.toString()}`);
      return res;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch audit logs');
    }
  }

  // ==================
  // PLATFORM SETTINGS
  // ==================

  async getPlatformSettings(): Promise<any> {
    try {
      const res = await api.get('/api/admin/system/platform-settings');
      return res;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch platform settings');
    }
  }

  async updatePlatformSettings(settings: Record<string, any>): Promise<any> {
    try {
      const res = await api.put('/api/admin/system/platform-settings', settings);
      return res;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to update platform settings');
    }
  }
}

export const adminService = new AdminService();
export default adminService;
