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
  currentMoodAnalysis: MoodTrackingResult | null;
  
  // Moderation
  moderateMessage: (text: string, channelId?: number) => Promise<any>;
  getModerationLog: (channelId: number) => Promise<any[]>;
  getModerationHistory: (communityId: number, channelId?: number, limit?: number) => Promise<any[]>;
  getModerationStats: (communityId: number, days?: number, channelId?: number) => Promise<any>;
  moderationAlerts: any[];
  
  // Engagement
  getEngagementMetrics: (channelId: number, days?: number) => Promise<EngagementMetrics>;
  analyzeEngagement: (timePeriodHours: number, channelId?: string) => Promise<any>;
  getEngagementTrends: (days?: number) => Promise<any[]>;
  engagementData: Record<number, EngagementMetrics>; // channelId -> metrics
  
  // Wellness
  getWellnessInsights: (days?: number) => Promise<WellnessInsights>;
  analyzeWellness: (timePeriodHours: number) => Promise<any>;
  getWellnessRecommendations: () => Promise<any[]>;
  wellnessData: WellnessInsights | null;
  
  // Knowledge Builder
  extractKnowledge: (timePeriodHours: number, topic?: string) => Promise<any>;
  searchKnowledge: (query: string, limit?: number) => Promise<any[]>;
  getKnowledgeBase: (channelId: number) => Promise<KnowledgeEntry[]>;
  getKnowledgeInsights: (timePeriodHours: number) => Promise<any>;
  getKnowledgeTopics: (limit?: number) => Promise<any[]>;
  knowledgeBase: Record<number, KnowledgeEntry[]>; // channelId -> knowledge
  
  // Focus
  startFocusSession: (type: 'work' | 'break' | 'meeting', duration: number) => Promise<any>;
  endFocusSession: (sessionId: number) => Promise<any>;
  getFocusStats: (days?: number) => Promise<any>;
  analyzeFocus: (timePeriodHours: number) => Promise<any>;
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
  const { currentChannel } = useRealtime();
  
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
    if (!user?.id) throw new Error('User not authenticated');
    
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
    if (!user?.id) throw new Error('User not authenticated');
    
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
  const getEngagementMetrics = useCallback(async (channelId: number, days: number = 7): Promise<EngagementMetrics> => {
    try {
      const metrics = await aiAgentService.getEngagementMetrics(channelId, days);
      setEngagementData(prev => ({
        ...prev,
        [channelId]: metrics
      }));
      setError(null);
      return metrics;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Additional Engagement Methods
  const analyzeEngagement = useCallback(async (timePeriodHours: number, channelId?: string) => {
    try {
      return await aiAgentService.analyzeEngagement(timePeriodHours, channelId);
    } catch (error) {
      console.error('Error analyzing engagement:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze engagement');
      throw error;
    }
  }, []);

  const getEngagementTrends = useCallback(async (days = 7) => {
    try {
      const channelId = currentChannel?.id || 1;
      return await aiAgentService.getEngagementTrends(channelId, 'week');
    } catch (error) {
      console.error('Error fetching engagement trends:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch engagement trends');
      throw error;
    }
  }, [currentChannel]);

  // =====================================================
  // WELLNESS FUNCTIONS
  // =====================================================
  const getWellnessInsights = useCallback(async (days: number = 7): Promise<WellnessInsights> => {
    if (!user?.id) throw new Error('User not authenticated');
    
    try {
      const insights = await aiAgentService.getWellnessInsights(user.id, days);
      setWellnessData(insights);
      setError(null);
      return insights;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user?.id]);

  // Additional Wellness Methods
  const analyzeWellness = useCallback(async (timePeriodHours: number) => {
    try {
      return await aiAgentService.analyzeWellness(timePeriodHours);
    } catch (error) {
      console.error('Error analyzing wellness:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze wellness');
      throw error;
    }
  }, []);

  const getWellnessRecommendations = useCallback(async () => {
    try {
      return await aiAgentService.getWellnessRecommendations();
    } catch (error) {
      console.error('Error fetching wellness recommendations:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch wellness recommendations');
      throw error;
    }
  }, []);

  // =====================================================
  // KNOWLEDGE BUILDER FUNCTIONS
  // =====================================================
  const extractKnowledge = useCallback(async (timePeriodHours: number, topic?: string): Promise<any> => {
    try {
      const result = await aiAgentService.extractKnowledge(timePeriodHours, topic);
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const searchKnowledge = useCallback(async (query: string, channelId?: number): Promise<KnowledgeEntry[]> => {
    try {
      const results = await aiAgentService.searchKnowledge(query, channelId);
      setError(null);
      return results;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

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
    try {
      return await aiAgentService.getKnowledgeInsights(timePeriodHours);
    } catch (error) {
      console.error('Error fetching knowledge insights:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch knowledge insights');
      throw error;
    }
  }, []);

  const getKnowledgeTopics = useCallback(async (limit = 20) => {
    try {
      return await aiAgentService.getKnowledgeTopics(limit);
    } catch (error) {
      console.error('Error fetching knowledge topics:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch knowledge topics');
      throw error;
    }
  }, []);

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
  const analyzeFocus = useCallback(async (timePeriodHours: number) => {
    try {
      return await aiAgentService.analyzeFocus(timePeriodHours);
    } catch (error) {
      console.error('Error analyzing focus:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze focus');
      throw error;
    }
  }, []);

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
      getEngagementMetrics(currentChannel.id).catch(() => {});
      
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
    currentMoodAnalysis,
    
    // Moderation
    moderateMessage,
    getModerationLog,
    getModerationHistory,
    getModerationStats,
    moderationAlerts,
    
    // Engagement
    getEngagementMetrics,
    analyzeEngagement,
    getEngagementTrends,
    engagementData,
    
    // Wellness
    getWellnessInsights,
    analyzeWellness,
    getWellnessRecommendations,
    wellnessData,
    
    // Knowledge Builder
    extractKnowledge,
    searchKnowledge,
    getKnowledgeBase,
    getKnowledgeInsights,
    getKnowledgeTopics,
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