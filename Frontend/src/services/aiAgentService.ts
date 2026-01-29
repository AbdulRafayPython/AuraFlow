import api from './appService';

export interface SummaryResult {
  success: boolean;
  summary_id?: number;
  summary: string;
  key_points: string[];
  message_count: number;
  participants: string[];
  time_range?: string;
  created_at?: string;
  error?: string;
}

export interface MoodAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  detected_language: string;
  detected_emotions: string[];
  score: number;
}

export interface MoodTrackingResult {
  success: boolean;
  mood_id?: number;
  overall_mood: string;
  confidence: number;
  message_count: number;
  sentiment_distribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
  trend: string;
  dominant_emotions: string[];
  time_period_hours: number;
  // Legacy fields for backward compatibility
  analysis?: {
    overall_sentiment: string;
    sentiment_distribution: Record<string, number>;
    mood_trend: string;
    time_period_hours: number;
    message_count: number;
    emotional_keywords: string[];
    recommendations: string[];
  };
  error?: string;
}

export interface ModerationResult {
  flag_type: 'toxic' | 'spam' | 'inappropriate' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  reason: string;
  action_recommended: 'none' | 'warn' | 'flag' | 'delete';
}

export interface EngagementMetrics {
  total_messages: number;
  active_users: number;
  avg_response_time: number;
  engagement_score: number;
  peak_activity_time: string;
  trends: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
}

export interface WellnessInsights {
  wellness_score: number;
  stress_indicators: number;
  activity_level: 'low' | 'moderate' | 'high' | 'excessive';
  recommendations: string[];
  break_suggestions: string[];
}

export interface KnowledgeEntry {
  id: number;
  question: string;
  answer: string;
  tags: string[];
  relevance_score: number;
  usage_count: number;
  created_at: string;
}

export interface FocusSession {
  session_type: 'work' | 'break' | 'meeting';
  duration_minutes: number;
  productivity_score: number;
  interruptions: number;
  recommendations: string[];
}

class AIAgentService {
  // =====================================================
  // SUMMARIZER AGENT
  // =====================================================
  async summarizeChannel(channelId: number, messageCount: number = 100): Promise<SummaryResult> {
    try {
      const response = await api.post(`/api/agents/summarize/channel/${channelId}`, {
        message_count: messageCount
      });
      return response as any;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to generate summary');
    }
  }

  async getChannelSummaries(channelId: number, limit: number = 5): Promise<SummaryResult[]> {
    try {
      const response: any = await api.get(`/api/agents/summaries/channel/${channelId}?limit=${limit}`);
      return response.summaries || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch summaries');
    }
  }

  // =====================================================
  // MOOD TRACKER AGENT
  // =====================================================
  async trackUserMood(userId: number, timePeriodHours: number = 24): Promise<MoodTrackingResult> {
    try {
      const response: any = await api.post(`/api/agents/mood/track/${userId}`, {
        time_period_hours: timePeriodHours
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to track mood');
    }
  }

  async getMoodHistoryByUser(userId: number, limit: number = 10): Promise<any[]> {
    try {
      const response: any = await api.get(`/api/agents/mood/history/${userId}?limit=${limit}`);
      console.log('[MOOD] History response:', response);
      return response.mood_history || [];
    } catch (error: any) {
      console.error('[MOOD] History error:', error.data || error.message);
      throw new Error(error.data?.error || 'Failed to fetch mood history');
    }
  }

  // Aliased methods for components
  async getMoodHistory(limit: number = 10): Promise<any[]> {
    // This will need user context - for now return empty
    return [];
  }

  async analyzeMessageSentiment(text: string): Promise<any> {
    return this.analyzeMessage(text);
  }

  async analyzeMessage(text: string): Promise<MoodAnalysis> {
    try {
      const response: any = await api.post('/api/agents/mood/analyze-message', { text });
      console.log('[MOOD] Analyze response:', response);
      return response.analysis;
    } catch (error: any) {
      console.error('[MOOD] Analyze error:', error.data || error.message);
      throw new Error(error.data?.error || 'Failed to analyze message');
    }
  }

  async getMoodTrends(userId: number, days: number = 7): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/mood/trends/${userId}?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch mood trends');
    }
  }

  async reanalyzeMoodHistory(userId: number, days: number = 30): Promise<any> {
    try {
      const response: any = await api.post(`/api/agents/mood/reanalyze/${userId}?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to reanalyze mood history');
    }
  }

  async getCommunityMood(communityId?: number, channelId?: number, hours: number = 24): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (communityId) params.append('community_id', communityId.toString());
      if (channelId) params.append('channel_id', channelId.toString());
      params.append('hours', hours.toString());
      
      const response: any = await api.get(`/api/agents/mood/community?${params.toString()}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch community mood');
    }
  }

  async getMoodRecommendations(userId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/mood/recommendations/${userId}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch mood recommendations');
    }
  }

  async getMoodInsights(userId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/mood/insights/${userId}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch mood insights');
    }
  }

  // =====================================================
  // MODERATION AGENT
  // =====================================================
  async moderateMessage(text: string, channelId?: number): Promise<ModerationResult> {
    try {
      const response: any = await api.post('/api/agents/moderation/check', {
        text,
        channel_id: channelId
      });
      return response.moderation;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to moderate message');
    }
  }

  async getModerationLog(channelId: number, limit: number = 20): Promise<any[]> {
    try {
      const response = await api.get(`/api/agents/moderation/log/${channelId}?limit=${limit}`);
      return response.data.log || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch moderation log');
    }
  }

  async getModerationHistory(communityId: number, channelId?: number, limit: number = 10): Promise<any[]> {
    try {
      let url = `/api/agents/moderation/history?community_id=${communityId}&limit=${limit}`;
      if (channelId) {
        url += `&channel_id=${channelId}`;
      }
      const response: any = await api.get(url);
      return response.history || [];
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch moderation history');
    }
  }

  async getModerationStats(communityId: number, days: number = 7, channelId?: number): Promise<any> {
    try {
      let url = `/api/agents/moderation/stats?community_id=${communityId}&days=${days}`;
      if (channelId) {
        url += `&channel_id=${channelId}`;
      }
      const response: any = await api.get(url);
      return response.stats;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch moderation stats');
    }
  }

  // =====================================================
  // ENGAGEMENT AGENT
  // =====================================================
  async analyzeEngagement(timePeriodHours: number, channelId?: string): Promise<any> {
    try {
      const response = await api.post('/api/agents/engagement/analyze', {
        time_period_hours: timePeriodHours,
        channel_id: channelId
      });
      return response;  // appService returns data directly
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to analyze engagement');
    }
  }

  async getEngagementMetrics(channelId: number, hours: number = 24): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/metrics/${channelId}?hours=${hours}`);
      return response;  // appService returns data directly
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch engagement metrics');
    }
  }

  async getEngagementHistory(channelId: number, limit: number = 10): Promise<any[]> {
    try {
      const response: any = await api.get(`/api/agents/engagement/trends/${channelId}?limit=${limit}`);
      return response.trends || [];
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch engagement history');
    }
  }

  // =====================================================
  // ICE-BREAKER ACTIVITIES
  // =====================================================
  async getIcebreaker(activityType: string = 'random'): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/icebreaker?type=${activityType}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch icebreaker');
    }
  }

  async getIcebreakerCategories(): Promise<any> {
    try {
      const response = await api.get('/api/agents/engagement/icebreaker/categories');
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch categories');
    }
  }

  async getQuickPoll(category: string = 'random'): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/poll?category=${category}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch poll');
    }
  }

  async getFunChallenge(challengeType: string = 'random'): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/challenge?type=${challengeType}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch challenge');
    }
  }

  async getConversationStarters(category: string = 'general'): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/starters?category=${category}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch starters');
    }
  }

  async getBoosterPack(engagementLevel: string = 'low'): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/booster-pack?level=${engagementLevel}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch booster pack');
    }
  }

  async logActivity(channelId: number, activityType: string, activityTitle: string): Promise<any> {
    try {
      const response = await api.post('/api/agents/engagement/activity/log', {
        channel_id: channelId,
        activity_type: activityType,
        activity_title: activityTitle
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to log activity');
    }
  }

  async getActivityStats(channelId: number, days: number = 7): Promise<any> {
    try {
      const response = await api.get(`/api/agents/engagement/activity/stats/${channelId}?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch activity stats');
    }
  }

  // =====================================================
  // WELLNESS AGENT
  // =====================================================
  
  /**
   * Check current wellness status
   */
  async checkWellness(): Promise<any> {
    try {
      const response: any = await api.get('/api/agents/wellness/check');
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to check wellness');
    }
  }

  /**
   * Comprehensive wellness analysis
   */
  async analyzeWellness(timePeriodHours: number = 24): Promise<any> {
    try {
      const response: any = await api.post('/api/agents/wellness/analyze', {
        time_period_hours: timePeriodHours
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to analyze wellness');
    }
  }

  /**
   * Get wellness insights for a user
   */
  async getWellnessInsights(userId: number, days: number = 7): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/wellness/insights/${userId}?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch wellness insights');
    }
  }

  /**
   * Get wellness recommendations
   */
  async getWellnessRecommendations(): Promise<any> {
    try {
      const response: any = await api.get('/api/agents/wellness/recommendations');
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch wellness recommendations');
    }
  }

  /**
   * Get wellness history
   */
  async getWellnessHistory(limit: number = 10): Promise<any[]> {
    try {
      const response: any = await api.get(`/api/agents/wellness/history?limit=${limit}`);
      return response.history || [];
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch wellness history');
    }
  }

  /**
   * Get wellness trends for charts
   */
  async getWellnessTrends(days: number = 7): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/wellness/trends?days=${days}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch wellness trends');
    }
  }

  // =====================================================
  // KNOWLEDGE BUILDER AGENT
  // =====================================================
  async extractKnowledgeByChannel(channelId: number, messageCount: number = 50): Promise<KnowledgeEntry[]> {
    try {
      const response = await api.post(`/api/agents/knowledge/extract/${channelId}`, {
        message_count: messageCount
      });
      return response.data.knowledge || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to extract knowledge');
    }
  }

  async extractKnowledgeByTime(timePeriodHours: number, topic: string | undefined, communityId: number): Promise<any> {
    try {
      const response: any = await api.post('/api/agents/knowledge/extract', {
        time_period_hours: timePeriodHours,
        topic,
        community_id: communityId
      });
      // API returns { success, total_items, faqs, definitions, decisions, channels_processed, message }
      return response.data || response;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.data?.error || error.message || 'Failed to extract knowledge');
    }
  }

  async getKnowledgeInsights(timePeriodHours: number, communityId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/knowledge/insights?time_period_hours=${timePeriodHours}&community_id=${communityId}`);
      // API returns { success: true, insights: {...} }
      return response.insights || response.data?.insights || response;
    } catch (error: any) {
      console.error('[KB Service] Insights error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch knowledge insights');
    }
  }

  async getKnowledgeTopics(limit: number = 20, communityId: number): Promise<any[]> {
    try {
      const response: any = await api.get(`/api/agents/knowledge/topics?limit=${limit}&community_id=${communityId}`);
      // API returns { success: true, topics: [...] }
      return response.topics || response.data?.topics || [];
    } catch (error: any) {
      console.error('[KB Service] Topics error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch knowledge topics');
    }
  }

  // Main extractKnowledge method for components
  async extractKnowledge(timePeriodHours: number, topic: string | undefined, communityId: number): Promise<any> {
    return this.extractKnowledgeByTime(timePeriodHours, topic, communityId);
  }

  async searchKnowledge(query: string, communityId?: number, channelId?: number): Promise<KnowledgeEntry[]> {
    try {
      const params = new URLSearchParams({ query });
      if (channelId) params.append('channel_id', channelId.toString());
      if (communityId) params.append('community_id', communityId.toString());
      const response: any = await api.get(`/api/agents/knowledge/search?${params}`);
      // API returns { success: true, results: [...] }
      return response.results || response.data?.results || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to search knowledge');
    }
  }

  async getKnowledgeBase(channelId: number, limit: number = 20): Promise<KnowledgeEntry[]> {
    try {
      const response = await api.get(`/api/agents/knowledge/base/${channelId}?limit=${limit}`);
      return response.data.knowledge || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch knowledge base');
    }
  }

  async getKnowledgeStats(communityId: number): Promise<any> {
    try {
      const response: any = await api.get(`/api/agents/knowledge/stats?community_id=${communityId}`);
      // API returns { success: true, total_items, by_type: {...} }
      return response.data || response;
    } catch (error: any) {
      console.error('[KB Service] Stats error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch knowledge stats');
    }
  }

  async getRecentKnowledge(communityId: number, limit: number = 20): Promise<any[]> {
    try {
      const response: any = await api.get(`/api/agents/knowledge/recent?community_id=${communityId}&limit=${limit}`);
      return response.items || response.data?.items || [];
    } catch (error: any) {
      console.error('[KB Service] Recent items error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch recent knowledge');
    }
  }

  // =====================================================
  // FOCUS AGENT
  // =====================================================
  async startFocusSession(sessionType: 'work' | 'break' | 'meeting', durationMinutes: number): Promise<FocusSession> {
    try {
      const response = await api.post('/api/agents/focus/session/start', {
        session_type: sessionType,
        duration_minutes: durationMinutes
      });
      return response.data.session;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to start focus session');
    }
  }

  async endFocusSession(sessionId: number): Promise<FocusSession> {
    try {
      const response = await api.post(`/api/agents/focus/session/${sessionId}/end`);
      return response.data.session;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to end focus session');
    }
  }

  async getFocusStats(userId: number, days: number = 7): Promise<any> {
    try {
      const response = await api.get(`/api/agents/focus/stats/${userId}?days=${days}`);
      return response.data.stats;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch focus stats');
    }
  }

  async analyzeFocus(timePeriodHours: number, channelId?: number): Promise<any> {
    try {
      const response = await api.post('/api/agents/focus/analyze', {
        time_period_hours: timePeriodHours,
        channel_id: channelId
      });
      // appService returns data directly, not wrapped in response.data
      return response;
    } catch (error: any) {
      console.error('[Focus Service] Analyze error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to analyze focus');
    }
  }

  async getFocusMetrics(days: number = 7): Promise<any> {
    try {
      const response = await api.get(`/api/agents/focus/metrics?days=${days}`);
      // appService returns data directly
      return response;
    } catch (error: any) {
      console.error('[Focus Service] Metrics error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch focus metrics');
    }
  }

  async getFocusRecommendations(): Promise<any[]> {
    try {
      const response = await api.get('/api/agents/focus/recommendations');
      // appService returns data directly - backend returns array
      return Array.isArray(response) ? response : [];
    } catch (error: any) {
      console.error('[Focus Service] Recommendations error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch focus recommendations');
    }
  }

  async setFocusGoal(goal: any): Promise<any> {
    try {
      const response = await api.post('/api/agents/focus/goal', { description: goal });
      // appService returns data directly
      return response;
    } catch (error: any) {
      console.error('[Focus Service] Goal error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to set focus goal');
    }
  }

  // =====================================================
  // AGENT HEALTH CHECK
  // =====================================================
  async getAgentStatus(): Promise<Record<string, string>> {
    try {
      const response = await api.get('/api/agents/health');
      return response.data.agents;
    } catch (error: any) {
      throw new Error('Failed to check agent status');
    }
  }
}

export const aiAgentService = new AIAgentService();
export default aiAgentService;