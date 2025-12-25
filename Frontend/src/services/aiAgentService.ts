import api from './appService';

export interface SummaryResult {
  success: boolean;
  summary_id?: number;
  summary: string;
  key_points: string[];
  message_count: number;
  participants: string[];
  time_range?: string;
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
  analysis: {
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
      const response = await api.post(`/api/agents/mood/track/${userId}`, {
        time_period_hours: timePeriodHours
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to track mood');
    }
  }

  async getMoodHistoryByUser(userId: number, limit: number = 10): Promise<any[]> {
    try {
      const response = await api.get(`/api/agents/mood/history/${userId}?limit=${limit}`);
      return response.data.mood_history || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch mood history');
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
      const response = await api.post('/api/agents/mood/analyze-message', { text });
      return response.data.analysis;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to analyze message');
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
  async getEngagementMetrics(channelId: number, days: number = 7): Promise<EngagementMetrics> {
    try {
      const response = await api.get(`/api/agents/engagement/metrics/${channelId}?days=${days}`);
      return response.data.metrics;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch engagement metrics');
    }
  }

  async getEngagementTrends(channelId: number, period: string = 'week'): Promise<any[]> {
    try {
      const response = await api.get(`/api/agents/engagement/trends/${channelId}?period=${period}`);
      return response.data.trends || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch engagement trends');
    }
  }

  async analyzeEngagement(timePeriodHours: number, channelId?: string): Promise<any> {
    try {
      const response = await api.post('/api/agents/engagement/analyze', {
        time_period_hours: timePeriodHours,
        channel_id: channelId
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to analyze engagement');
    }
  }

  // =====================================================
  // WELLNESS AGENT
  // =====================================================
  async getWellnessInsights(userId: number, days: number = 7): Promise<WellnessInsights> {
    try {
      const response = await api.get(`/api/agents/wellness/insights/${userId}?days=${days}`);
      return response.data.insights;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wellness insights');
    }
  }

  async getWellnessTrends(userId: number, period: string = 'month'): Promise<any[]> {
    try {
      const response = await api.get(`/api/agents/wellness/trends/${userId}?period=${period}`);
      return response.data.trends || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wellness trends');
    }
  }

  async analyzeWellness(timePeriodHours: number): Promise<any> {
    try {
      const response = await api.post('/api/agents/wellness/analyze', {
        time_period_hours: timePeriodHours
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to analyze wellness');
    }
  }

  async getWellnessRecommendations(): Promise<any[]> {
    try {
      const response = await api.get('/api/agents/wellness/recommendations');
      return response.data.recommendations || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wellness recommendations');
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

  async extractKnowledgeByTime(timePeriodHours: number, topic?: string): Promise<any> {
    try {
      const response = await api.post('/api/agents/knowledge/extract', {
        time_period_hours: timePeriodHours,
        topic
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to extract knowledge');
    }
  }

  async getKnowledgeInsights(timePeriodHours: number): Promise<any> {
    try {
      const response = await api.get(`/api/agents/knowledge/insights?time_period_hours=${timePeriodHours}`);
      return response.data.insights;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch knowledge insights');
    }
  }

  async getKnowledgeTopics(limit: number = 20): Promise<any[]> {
    try {
      const response = await api.get(`/api/agents/knowledge/topics?limit=${limit}`);
      return response.data.topics || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch knowledge topics');
    }
  }

  // Main extractKnowledge method for components
  async extractKnowledge(timePeriodHours: number, topic?: string): Promise<any> {
    return this.extractKnowledgeByTime(timePeriodHours, topic);
  }

  async searchKnowledge(query: string, channelId?: number): Promise<KnowledgeEntry[]> {
    try {
      const params = new URLSearchParams({ query });
      if (channelId) params.append('channel_id', channelId.toString());
      
      const response = await api.get(`/api/agents/knowledge/search?${params}`);
      return response.data.results || [];
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

  async analyzeFocus(timePeriodHours: number): Promise<any> {
    try {
      const response = await api.post('/api/agents/focus/analyze', {
        time_period_hours: timePeriodHours
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to analyze focus');
    }
  }

  async getFocusMetrics(days: number = 7): Promise<any> {
    try {
      const response = await api.get(`/api/agents/focus/metrics?days=${days}`);
      return response.data.metrics;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch focus metrics');
    }
  }

  async getFocusRecommendations(): Promise<any[]> {
    try {
      const response = await api.get('/api/agents/focus/recommendations');
      return response.data.recommendations || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch focus recommendations');
    }
  }

  async setFocusGoal(goal: any): Promise<any> {
    try {
      const response = await api.post('/api/agents/focus/goal', goal);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to set focus goal');
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