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

export interface AssistantReply {
  success: boolean;
  reply: string;
  source: 'gemini' | 'lexicon' | 'fallback' | 'empty' | string;
  tag?: string;
}

export interface TranslationResult {
  success: boolean;
  translated_text: string;
  source_language: string;
  target_language: string;
  provider: 'deep_translator' | 'googletrans' | 'none' | string;
  cached?: boolean;
  error?: string;
  message_id?: number;
}

export interface SupportSource {
  id?: number;
  title?: string;
  category?: string;
}

export interface SupportAnswer {
  success: boolean;
  matched: boolean;
  answer: string;
  score?: number;
  sources?: SupportSource[];
  error?: string;
}

export interface QuickReplySuggestions {
  success: boolean;
  intent?: string;
  suggestions: string[];
}

export interface WelcomePreview {
  success: boolean;
  text: string;
  community_id?: number;
  channel_id?: number;
  posted?: boolean;
  message_id?: number;
}

export interface AgentCatalogEntry {
  agent_type: string;
  display_name: string;
  description: string;
  category: 'community' | 'personal';
  icon: string;
  default_settings: Record<string, any>;
  features: string[];
  personal_status?: {
    activated: boolean;
    enabled?: boolean;
    settings?: Record<string, any> | null;
    activated_at?: string | null;
    last_used?: string | null;
    usage_count?: number;
  };
  community_status?: {
    installed: boolean;
    enabled?: boolean;
    settings?: Record<string, any> | null;
    installed_by?: string;
    installed_at?: string | null;
    last_active?: string | null;
    usage_count?: number;
  };
}

export interface InstalledAgent {
  agent_type: string;
  display_name: string;
  description: string;
  icon: string;
  category?: string;
  features: string[];
  enabled: boolean;
  settings: Record<string, any>;
  installed_by?: string;
  installed_at?: string | null;
  activated_at?: string | null;
  last_active?: string | null;
  last_used?: string | null;
  usage_count: number;
}

export interface AgentLog {
  id: number;
  agent_name: string;
  action_type: string;
  input_data: string | null;
  output_data: string | null;
  status: string;
  execution_time_ms: number;
  community_id: number | null;
  user_id: number | null;
  created_at: string;
}

export interface AgentLogsResponse {
  success: boolean;
  logs: AgentLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
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

  async getSummarizerSchedule(communityId: number): Promise<{
    auto_summarize_enabled: boolean;
    schedule_time: string;
    auto_summarize_message_count: number;
    last_auto_summary_date: string;
    agent_enabled: boolean;
  }> {
    try {
      const response: any = await api.get(`/api/agents/summarizer/schedule/${communityId}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to get schedule');
    }
  }

  async triggerAutoSummarize(communityId: number): Promise<any> {
    try {
      const response = await api.post(`/api/agents/summarizer/trigger/${communityId}`);
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to trigger auto-summarize');
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
      const response: any = await api.get(`/api/agents/knowledge/base/${channelId}?limit=${limit}`);
      // appService returns data directly, not wrapped in response.data
      return response.knowledge || response.data?.knowledge || [];
    } catch (error: any) {
      console.error('[KB Service] getKnowledgeBase error:', error);
      // Return empty array instead of throwing - better UX
      return [];
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

  // =====================================================
  // AGENT CATALOG & MANAGEMENT
  // =====================================================
  
  async getAgentCatalog(communityId?: number): Promise<AgentCatalogEntry[]> {
    try {
      const params = communityId ? `?community_id=${communityId}` : '';
      const response = await api.get(`/api/agents/catalog${params}`);
      return response.agents || [];
    } catch (error: any) {
      console.error('[Agent Service] Catalog error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch agent catalog');
    }
  }

  async installCommunityAgent(communityId: number, agentType: string, settings?: Record<string, any>): Promise<any> {
    try {
      const response = await api.post(`/api/agents/install/community/${communityId}`, {
        agent_type: agentType,
        settings: settings || {},
      });
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Install error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to install agent');
    }
  }

  async uninstallCommunityAgent(communityId: number, agentType: string): Promise<any> {
    try {
      const response = await api.del(`/api/agents/uninstall/community/${communityId}/${agentType}`);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Uninstall error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to uninstall agent');
    }
  }

  async configureCommunityAgent(communityId: number, agentType: string, settings: Record<string, any>, enabled?: boolean): Promise<any> {
    try {
      const body: any = { settings };
      if (enabled !== undefined) body.enabled = enabled;
      const response = await api.put(`/api/agents/configure/community/${communityId}/${agentType}`, body);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Configure error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to configure agent');
    }
  }

  async getCommunityAgentStatus(communityId: number): Promise<InstalledAgent[]> {
    try {
      const response = await api.get(`/api/agents/status/community/${communityId}`);
      return response.agents || [];
    } catch (error: any) {
      console.error('[Agent Service] Community status error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to get community agent status');
    }
  }

  async activatePersonalAgent(agentType: string, settings?: Record<string, any>): Promise<any> {
    try {
      const response = await api.post('/api/agents/activate/personal', {
        agent_type: agentType,
        settings: settings || {},
      });
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Activate error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to activate agent');
    }
  }

  async deactivatePersonalAgent(agentType: string): Promise<any> {
    try {
      const response = await api.del(`/api/agents/deactivate/personal/${agentType}`);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Deactivate error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to deactivate agent');
    }
  }

  async getPersonalAgentStatus(): Promise<InstalledAgent[]> {
    try {
      const response = await api.get('/api/agents/status/personal');
      return response.agents || [];
    } catch (error: any) {
      console.error('[Agent Service] Personal status error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to get personal agent status');
    }
  }

  async configurePersonalAgent(agentType: string, settings: Record<string, any>, enabled?: boolean): Promise<any> {
    try {
      const body: any = { settings };
      if (enabled !== undefined) body.enabled = enabled;
      const response = await api.put(`/api/agents/configure/personal/${agentType}`, body);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Configure personal error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to configure personal agent');
    }
  }

  async getAgentLogs(params?: { agent_type?: string; community_id?: number; status?: string; page?: number; limit?: number }): Promise<AgentLogsResponse> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.agent_type) searchParams.set('agent_type', params.agent_type);
      if (params?.community_id) searchParams.set('community_id', String(params.community_id));
      if (params?.status) searchParams.set('status', params.status);
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));
      const response = await api.get(`/api/agents/logs?${searchParams.toString()}`);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Logs error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch agent logs');
    }
  }

  // =====================================================
  // PERSONAL SUMMARY SCHEDULES
  // =====================================================
  async getSummarySchedules(): Promise<any[]> {
    try {
      const response: any = await api.get('/api/agents/summary-schedules');
      return response.schedules || [];
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch schedules');
    }
  }

  async createSummarySchedule(data: { channel_id: number; community_id: number; schedule_time: string; timezone?: string }): Promise<any> {
    try {
      return await api.post('/api/agents/summary-schedules', data);
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to create schedule');
    }
  }

  async updateSummarySchedule(scheduleId: number, data: { schedule_time?: string; is_active?: boolean; timezone?: string }): Promise<any> {
    try {
      return await api.put(`/api/agents/summary-schedules/${scheduleId}`, data);
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to update schedule');
    }
  }

  async deleteSummarySchedule(scheduleId: number): Promise<any> {
    try {
      return await api.del(`/api/agents/summary-schedules/${scheduleId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to delete schedule');
    }
  }

  async getPendingSummaries(channelId?: number): Promise<any[]> {
    try {
      const url = channelId
        ? `/api/agents/summary-schedules/pending?channel_id=${channelId}`
        : '/api/agents/summary-schedules/pending';
      const response: any = await api.get(url);
      return response.summaries || [];
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch pending summaries');
    }
  }

  async deleteScheduledSummary(summaryId: number): Promise<void> {
    try {
      await api.del(`/api/agents/summary-schedules/pending/${summaryId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to delete scheduled summary');
    }
  }

  // =====================================================
  // MY SUMMARIES — User's generated summary history
  // =====================================================
  async getMySummaries(channelId?: number, limit: number = 20): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (channelId) params.set('channel_id', String(channelId));
      if (limit) params.set('limit', String(limit));
      const response: any = await api.get(`/api/agents/my-summaries?${params.toString()}`);
      return response.summaries || [];
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to fetch summaries');
    }
  }

  async deleteMySummary(summaryId: number): Promise<void> {
    try {
      await api.del(`/api/agents/my-summaries/${summaryId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to delete summary');
    }
  }

  // =====================================================
  // AI ASSISTANT AGENT
  // =====================================================
  async askAssistant(
    question: string,
    opts: { channelId?: number; communityId?: number; context?: string } = {},
  ): Promise<AssistantReply> {
    try {
      const response: any = await api.post('/api/agents/assistant/ask', {
        question,
        channel_id: opts.channelId,
        community_id: opts.communityId,
        context: opts.context,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to ask assistant');
    }
  }

  async getJoke(): Promise<AssistantReply> {
    try {
      return (await api.get('/api/agents/assistant/joke')) as any;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch joke');
    }
  }

  async getMotivation(): Promise<AssistantReply> {
    try {
      return (await api.get('/api/agents/assistant/motivation')) as any;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch motivation');
    }
  }

  // =====================================================
  // TRANSLATOR AGENT
  // =====================================================
  async translateText(
    text: string,
    targetLanguage: string = 'en',
    sourceLanguage: string = 'auto',
  ): Promise<TranslationResult> {
    try {
      const response: any = await api.post('/api/agents/translator/translate', {
        text,
        target_language: targetLanguage,
        source_language: sourceLanguage,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to translate');
    }
  }

  async translateMessage(messageId: number, targetLanguage: string = 'en'): Promise<TranslationResult> {
    try {
      const response: any = await api.post(`/api/agents/translator/message/${messageId}`, {
        target_language: targetLanguage,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to translate message');
    }
  }

  async getSupportedLanguages(): Promise<Record<string, string>> {
    try {
      const response: any = await api.get('/api/agents/translator/languages');
      return response.languages || {};
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch languages');
    }
  }

  async detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
    try {
      const response: any = await api.post('/api/agents/translator/detect', { text });
      return { language: response.language, confidence: response.confidence };
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to detect language');
    }
  }

  // =====================================================
  // CONTEXT-AWARE SUPPORT AGENT
  // =====================================================
  async askSupport(
    question: string,
    communityId: number,
    opts: { channelId?: number; polish?: boolean } = {},
  ): Promise<SupportAnswer> {
    try {
      const response: any = await api.post('/api/agents/support/ask', {
        question,
        community_id: communityId,
        channel_id: opts.channelId,
        polish: opts.polish ?? true,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to ask support');
    }
  }

  async refreshSupportIndex(communityId: number): Promise<void> {
    try {
      await api.post(`/api/agents/support/refresh/${communityId}`);
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to refresh support index');
    }
  }

  // =====================================================
  // AUTO MESSAGE AGENT
  // =====================================================
  async previewWelcome(params: {
    communityName: string;
    username: string;
    communityDescription?: string;
    communityId?: number;
    channelId?: number;
  }): Promise<WelcomePreview> {
    try {
      const response: any = await api.post('/api/agents/automessage/welcome/preview', {
        community_name: params.communityName,
        username: params.username,
        community_description: params.communityDescription,
        community_id: params.communityId,
        channel_id: params.channelId,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to preview welcome');
    }
  }

  async getQuickReplies(lastMessage: string, max: number = 3): Promise<QuickReplySuggestions> {
    try {
      const response: any = await api.post('/api/agents/automessage/quick-replies', {
        last_message: lastMessage,
        max,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || 'Failed to fetch quick replies');
    }
  }
}

export const aiAgentService = new AIAgentService();
export default aiAgentService;