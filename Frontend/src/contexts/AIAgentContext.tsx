import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { aiAgentService, SummaryResult, MoodTrackingResult, EngagementMetrics, WellnessInsights, KnowledgeEntry } from '@/services/aiAgentService';
import { useAuth } from './AuthContext';
import { useRealtime } from '@/hooks/useRealtime';

interface AIAgentContextType {
  // Agent Status
  agentStatus: Record<string, string>;
  isLoadingAgents: boolean;
  
  // Summarizer
  generateSummary: (channelId: number, messageCount?: number) => Promise<SummaryResult>;
  getChannelSummaries: (channelId: number) => Promise<SummaryResult[]>;
  summaries: Record<number, SummaryResult[]>; // channelId -> summaries
  
  // Mood Tracker
  trackMood: (timePeriodHours?: number) => Promise<MoodTrackingResult>;
  getMoodHistory: (limit?: number) => Promise<any[]>;
  analyzeMessageSentiment: (text: string) => Promise<any>;
  reanalyzeMoodHistory: (days?: number) => Promise<any>;
  currentMoodAnalysis: MoodTrackingResult | null;
  
  // Moderation
  moderateMessage: (text: string, channelId?: number) => Promise<any>;
  getModerationLog: (channelId: number) => Promise<any[]>;
  getModerationHistory: (communityId: number, channelId?: number, limit?: number) => Promise<any[]>;
  getModerationStats: (communityId: number, days?: number, channelId?: number) => Promise<any>;
  moderationAlerts: any[];
  
  // Engagement
  analyzeEngagement: (timePeriodHours: number, channelId?: number) => Promise<any>;
  getEngagementMetrics: (hours?: number) => Promise<any>;
  getEngagementHistory: (limit?: number) => Promise<any[]>;
  getEngagementTrends: (days?: number) => Promise<any[]>;
  engagementData: Record<number, EngagementMetrics>; // channelId -> metrics
  
  // Wellness
  checkWellness: () => Promise<any>;
  analyzeWellness: (timePeriodHours: number) => Promise<any>;
  getWellnessInsights: (days?: number) => Promise<any>;
  getWellnessRecommendations: () => Promise<any>;
  getWellnessHistory: (limit?: number) => Promise<any[]>;
  getWellnessTrends: (days?: number) => Promise<any>;
  wellnessData: any | null;
  
  // Knowledge Builder
  extractKnowledge: (timePeriodHours: number, topic?: string) => Promise<any>;
  searchKnowledge: (query: string, limit?: number) => Promise<any[]>;
  getKnowledgeBase: (channelId: number) => Promise<KnowledgeEntry[]>;
  getKnowledgeInsights: (timePeriodHours: number) => Promise<any>;
  getKnowledgeTopics: (limit?: number) => Promise<any[]>;
  getKnowledgeStats: () => Promise<any>;
  knowledgeBase: Record<number, KnowledgeEntry[]>; // channelId -> knowledge
  
  // Focus
  startFocusSession: (type: 'work' | 'break' | 'meeting', duration: number) => Promise<any>;
  endFocusSession: (sessionId: number) => Promise<any>;
  getFocusStats: (days?: number) => Promise<any>;
  analyzeFocus: (timePeriodHours: number, channelId?: number) => Promise<any>;
  getFocusMetrics: (days?: number) => Promise<any>;
  getFocusRecommendations: () => Promise<any[]>;
  setFocusGoal: (goal: any) => Promise<any>;
  activeFocusSession: any | null;
  focusStats: any | null;
  
  // Error Handling
  error: string | null;
  clearError: () => void;
}

const AIAgentContext = createContext<AIAgentContextType | undefined>(undefined);

export function AIAgentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { currentChannel, currentCommunity } = useRealtime();
  
  // State
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>({});
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [summaries, setSummaries] = useState<Record<number, SummaryResult[]>>({});
  const [currentMoodAnalysis, setCurrentMoodAnalysis] = useState<MoodTrackingResult | null>(null);
  const [moderationAlerts, setModerationAlerts] = useState<any[]>([]);
  const [engagementData, setEngagementData] = useState<Record<number, EngagementMetrics>>({});
  const [wellnessData, setWellnessData] = useState<WellnessInsights | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<Record<number, KnowledgeEntry[]>>({});
  const [activeFocusSession, setActiveFocusSession] = useState<any | null>(null);
  const [focusStats, setFocusStats] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize agent status
  useEffect(() => {
    if (user) {
      checkAgentStatus();
    }
  }, [user]);

  const checkAgentStatus = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      const status = await aiAgentService.getAgentStatus();
      setAgentStatus(status);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  // =====================================================
  // SUMMARIZER FUNCTIONS
  // =====================================================
  const generateSummary = useCallback(async (channelId: number, messageCount: number = 100): Promise<SummaryResult> => {
    try {
      const result = await aiAgentService.summarizeChannel(channelId, messageCount);
      
      // Update summaries cache
      setSummaries(prev => ({
        ...prev,
        [channelId]: [result, ...(prev[channelId] || [])].slice(0, 10) // Keep latest 10
      }));
      
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const getChannelSummaries = useCallback(async (channelId: number): Promise<SummaryResult[]> => {
    try {
      const results = await aiAgentService.getChannelSummaries(channelId);
      setSummaries(prev => ({
        ...prev,
        [channelId]: results
      }));
      setError(null);
      return results;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  // =====================================================
  // MOOD TRACKER FUNCTIONS
  // =====================================================
  const trackMood = useCallback(async (timePeriodHours: number = 24): Promise<MoodTrackingResult> => {
    if (!user?.id) {
      // Return empty result if user not ready yet
      return {
        success: false,
        overall_mood: 'neutral',
        confidence: 0,
        message_count: 0,
        sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
        trend: 'stable',
        dominant_emotions: [],
        time_period_hours: timePeriodHours
      };
    }
    
    try {
      const result = await aiAgentService.trackUserMood(user.id, timePeriodHours);
      setCurrentMoodAnalysis(result);
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  const getMoodHistory = useCallback(async (limit: number = 10): Promise<any[]> => {
    if (!user?.id) {
      // Return empty array if user not ready yet
      return [];
    }
    
    try {
      const history = await aiAgentService.getMoodHistoryByUser(user.id, limit);
      setError(null);
      return history;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  const analyzeMessageSentiment = useCallback(async (text: string): Promise<any> => {
    try {
      const analysis = await aiAgentService.analyzeMessage(text);
      setError(null);
      return analysis;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const reanalyzeMoodHistory = useCallback(async (days: number = 30): Promise<any> => {
    if (!user?.id) {
      return { success: false, error: 'User not authenticated' };
    }
    
    try {
      const result = await aiAgentService.reanalyzeMoodHistory(user.id, days);
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  // =====================================================
  // MODERATION FUNCTIONS
  // =====================================================
  const moderateMessage = useCallback(async (text: string, channelId?: number): Promise<any> => {
    try {
      const result = await aiAgentService.moderateMessage(text, channelId);
      
      // Add to alerts if severity is medium or higher
      if (result.severity === 'medium' || result.severity === 'high' || result.severity === 'critical') {
        setModerationAlerts(prev => [
          { ...result, timestamp: new Date().toISOString(), text, channelId },
          ...prev.slice(0, 49) // Keep latest 50
        ]);
      }
      
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const getModerationLog = useCallback(async (channelId: number): Promise<any[]> => {
    try {
      const log = await aiAgentService.getModerationLog(channelId);
      setError(null);
      return log;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Additional Moderation Methods
  const getModerationHistory = useCallback(async (communityId: number, channelId?: number, limit = 10) => {
    try {
      return await aiAgentService.getModerationHistory(communityId, channelId, limit);
    } catch (error) {
      console.error('Error fetching moderation history:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch moderation history');
      throw error;
    }
  }, []);

  const getModerationStats = useCallback(async (communityId: number, days = 7, channelId?: number) => {
    try {
      return await aiAgentService.getModerationStats(communityId, days, channelId);
    } catch (error) {
      console.error('Error fetching moderation stats:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch moderation stats');
      throw error;
    }
  }, []);

  // =====================================================
  // ENGAGEMENT FUNCTIONS
  // =====================================================

  // Additional Engagement Methods
  const analyzeEngagement = useCallback(async (timePeriodHours: number, channelId?: number) => {
    try {
      const targetChannelId = channelId || currentChannel?.id;
      return await aiAgentService.analyzeEngagement(timePeriodHours, targetChannelId?.toString());
    } catch (error) {
      console.error('Error analyzing engagement:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze engagement');
      throw error;
    }
  }, [currentChannel]);

  const getEngagementMetrics = useCallback(async (hours = 24) => {
    try {
      const channelId = currentChannel?.id;
      if (!channelId) throw new Error('No channel selected');
      return await aiAgentService.getEngagementMetrics(channelId, hours);
    } catch (error) {
      console.error('Error getting engagement metrics:', error);
      setError(error instanceof Error ? error.message : 'Failed to get engagement metrics');
      throw error;
    }
  }, [currentChannel]);

  const getEngagementHistory = useCallback(async (limit = 10) => {
    try {
      const channelId = currentChannel?.id;
      if (!channelId) throw new Error('No channel selected');
      return await aiAgentService.getEngagementHistory(channelId, limit);
    } catch (error) {
      console.error('Error getting engagement history:', error);
      setError(error instanceof Error ? error.message : 'Failed to get engagement history');
      throw error;
    }
  }, [currentChannel]);

  const getEngagementTrends = useCallback(async (days = 7) => {
    try {
      const channelId = currentChannel?.id || 1;
      return await aiAgentService.getEngagementHistory(channelId, days);
    } catch (error) {
      console.error('Error fetching engagement trends:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch engagement trends');
      throw error;
    }
  }, [currentChannel]);

  // =====================================================
  // WELLNESS FUNCTIONS
  // =====================================================
  const checkWellness = useCallback(async () => {
    try {
      const result = await aiAgentService.checkWellness();
      setWellnessData(result);
      setError(null);
      return result;
    } catch (error) {
      console.error('Error checking wellness:', error);
      setError(error instanceof Error ? error.message : 'Failed to check wellness');
      throw error;
    }
  }, []);

  const analyzeWellness = useCallback(async (timePeriodHours: number) => {
    try {
      const result = await aiAgentService.analyzeWellness(timePeriodHours);
      setWellnessData(result);
      setError(null);
      return result;
    } catch (error) {
      console.error('Error analyzing wellness:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze wellness');
      throw error;
    }
  }, []);

  const getWellnessInsights = useCallback(async (days: number = 7) => {
    if (!user?.id) throw new Error('User not authenticated');
    
    try {
      const insights = await aiAgentService.getWellnessInsights(user.id, days);
      setError(null);
      return insights;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  const getWellnessRecommendations = useCallback(async () => {
    try {
      return await aiAgentService.getWellnessRecommendations();
    } catch (error) {
      console.error('Error fetching wellness recommendations:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch wellness recommendations');
      throw error;
    }
  }, []);

  const getWellnessHistory = useCallback(async (limit: number = 10) => {
    try {
      return await aiAgentService.getWellnessHistory(limit);
    } catch (error) {
      console.error('Error fetching wellness history:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch wellness history');
      throw error;
    }
  }, []);

  const getWellnessTrends = useCallback(async (days: number = 7) => {
    try {
      return await aiAgentService.getWellnessTrends(days);
    } catch (error) {
      console.error('Error fetching wellness trends:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch wellness trends');
      throw error;
    }
  }, []);

  // =====================================================
  // KNOWLEDGE BUILDER FUNCTIONS
  // =====================================================
  const extractKnowledge = useCallback(async (timePeriodHours: number, topic?: string): Promise<any> => {
    if (!currentCommunity?.id) throw new Error('Select a community to extract knowledge');
    try {
      const result = await aiAgentService.extractKnowledge(timePeriodHours, topic, currentCommunity.id);
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [currentCommunity?.id]);

  const searchKnowledge = useCallback(async (query: string, channelId?: number): Promise<KnowledgeEntry[]> => {
    try {
      const results = await aiAgentService.searchKnowledge(query, currentCommunity?.id || undefined, channelId);
      setError(null);
      return results;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [currentCommunity?.id]);

  const getKnowledgeBase = useCallback(async (channelId: number): Promise<KnowledgeEntry[]> => {
    try {
      const knowledge = await aiAgentService.getKnowledgeBase(channelId);
      setKnowledgeBase(prev => ({
        ...prev,
        [channelId]: knowledge
      }));
      setError(null);
      return knowledge;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Additional Knowledge Methods
  const getKnowledgeInsights = useCallback(async (timePeriodHours: number) => {
    if (!currentCommunity?.id) throw new Error('Select a community to view insights');
    try {
      return await aiAgentService.getKnowledgeInsights(timePeriodHours, currentCommunity.id);
    } catch (error) {
      console.error('Error fetching knowledge insights:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch knowledge insights');
      throw error;
    }
  }, [currentCommunity?.id]);

  const getKnowledgeTopics = useCallback(async (limit = 20) => {
    if (!currentCommunity?.id) throw new Error('Select a community to view topics');
    try {
      return await aiAgentService.getKnowledgeTopics(limit, currentCommunity.id);
    } catch (error) {
      console.error('Error fetching knowledge topics:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch knowledge topics');
      throw error;
    }
  }, [currentCommunity?.id]);

  const getKnowledgeStats = useCallback(async () => {
    if (!currentCommunity?.id) throw new Error('Select a community to view stats');
    try {
      return await aiAgentService.getKnowledgeStats(currentCommunity.id);
    } catch (error) {
      console.error('Error fetching knowledge stats:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch knowledge stats');
      throw error;
    }
  }, [currentCommunity?.id]);

  // =====================================================
  // FOCUS FUNCTIONS
  // =====================================================
  const startFocusSession = useCallback(async (type: 'work' | 'break' | 'meeting', duration: number): Promise<any> => {
    try {
      const session = await aiAgentService.startFocusSession(type, duration);
      setActiveFocusSession(session);
      setError(null);
      return session;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const endFocusSession = useCallback(async (sessionId: number): Promise<any> => {
    try {
      const session = await aiAgentService.endFocusSession(sessionId);
      setActiveFocusSession(null);
      
      // Refresh focus stats
      if (user?.id) {
        const stats = await aiAgentService.getFocusStats(user.id);
        setFocusStats(stats);
      }
      
      setError(null);
      return session;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  const getFocusStats = useCallback(async (days: number = 7): Promise<any> => {
    if (!user?.id) throw new Error('User not authenticated');
    
    try {
      const stats = await aiAgentService.getFocusStats(user.id, days);
      setFocusStats(stats);
      setError(null);
      return stats;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  // Additional Focus Methods
  const analyzeFocus = useCallback(async (timePeriodHours: number, channelId?: number) => {
    try {
      const targetChannelId = channelId ?? currentChannel?.id;
      return await aiAgentService.analyzeFocus(timePeriodHours, targetChannelId);
    } catch (error) {
      console.error('Error analyzing focus:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze focus');
      throw error;
    }
  }, [currentChannel?.id]);

  const getFocusMetrics = useCallback(async (days = 7) => {
    try {
      return await aiAgentService.getFocusMetrics(days);
    } catch (error) {
      console.error('Error fetching focus metrics:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch focus metrics');
      throw error;
    }
  }, []);

  const getFocusRecommendations = useCallback(async () => {
    try {
      return await aiAgentService.getFocusRecommendations();
    } catch (error) {
      console.error('Error fetching focus recommendations:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch focus recommendations');
      throw error;
    }
  }, []);

  const setFocusGoal = useCallback(async (goal: any) => {
    try {
      return await aiAgentService.setFocusGoal(goal);
    } catch (error) {
      console.error('Error setting focus goal:', error);
      setError(error instanceof Error ? error.message : 'Failed to set focus goal');
      throw error;
    }
  }, []);

  // =====================================================
  // AUTO-LOAD DATA FOR CURRENT CHANNEL
  // =====================================================
  useEffect(() => {
    if (currentChannel && user) {
      // Auto-load engagement metrics for current channel
      getEngagementMetrics().catch(() => {});
      
      // Auto-load knowledge base for current channel
      getKnowledgeBase(currentChannel.id).catch(() => {});
    }
  }, [currentChannel, user, getEngagementMetrics, getKnowledgeBase]);

  // Clear error function
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AIAgentContextType = {
    // Status
    agentStatus,
    isLoadingAgents,
    
    // Summarizer
    generateSummary,
    getChannelSummaries,
    summaries,
    
    // Mood Tracker
    trackMood,
    getMoodHistory,
    analyzeMessageSentiment,
    reanalyzeMoodHistory,
    currentMoodAnalysis,
    
    // Moderation
    moderateMessage,
    getModerationLog,
    getModerationHistory,
    getModerationStats,
    moderationAlerts,
    
    // Engagement
    analyzeEngagement,
    getEngagementMetrics,
    getEngagementHistory,
    getEngagementTrends,
    engagementData,
    
    // Wellness
    checkWellness,
    analyzeWellness,
    getWellnessInsights,
    getWellnessRecommendations,
    getWellnessHistory,
    getWellnessTrends,
    wellnessData,
    
    // Knowledge Builder
    extractKnowledge,
    searchKnowledge,
    getKnowledgeBase,
    getKnowledgeInsights,
    getKnowledgeTopics,
    getKnowledgeStats,
    knowledgeBase,
    
    // Focus
    startFocusSession,
    endFocusSession,
    getFocusStats,
    analyzeFocus,
    getFocusMetrics,
    getFocusRecommendations,
    setFocusGoal,
    activeFocusSession,
    focusStats,
    
    // Error Handling
    error,
    clearError,
  };

  return (
    <AIAgentContext.Provider value={value}>
      {children}
    </AIAgentContext.Provider>
  );
}

export function useAIAgents() {
  const context = useContext(AIAgentContext);
  if (context === undefined) {
    throw new Error('useAIAgents must be used within an AIAgentProvider');
  }
  return context;
}