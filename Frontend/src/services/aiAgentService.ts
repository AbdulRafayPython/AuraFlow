// REWRITE: ~1.4k lines; contains several API wrappers with no UI caller (see docs/CODEBASE_AUDIT.md).
import api from './appService';
import type { SettingsSchema } from '@/lib/settingsSchema';
import { registerSettingsSchema } from '@/components/ai-agents/agentSettingsMeta';

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

export interface DMSummaryResult {
  success: boolean;
  summary: string;
  key_points: string[];
  action_items?: string[];
  message_count: number;
  participants: string[];
  method?: 'extractive' | 'deepseek-ai' | 'gemini-ai';
  summary_length?: 'brief' | 'standard' | 'detailed';
  peer_user_id: number;
  time_range?: { start: string; end: string } | string;
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

// Autonomous-agent metrics shape returned by GET /api/agents/metrics.
// Matches the same JSON consumed by Frontend/src/pages/system-admin/AgentMetrics.tsx;
// promoted here so the Community Intelligence Hub (F4) can share the type.
export interface PerAgentMetricsRow {
  agent_name: string;
  acts: number;
  defers: number;
  skips: number;
  total: number;
  autonomy_ratio: number;
}

export interface MetricsResponse {
  window_days: number;
  community_id: number | null;
  autonomy: {
    acts: number;
    defers: number;
    skips: number;
    total_decisions: number;
    autonomy_ratio: number;
    human_triggered: number;
    autonomous_share: number;
  };
  goal_attainment: {
    goal_threshold: number;
    buckets: number;
    met: number;
    ratio: number;
    avg_sentiment: number;
  };
  feedback: {
    positive: number;
    negative: number;
    engaged: number;
    dismissed: number;
    ignored: number;
    feedback_ratio: number;
    total: number;
  };
  per_agent: PerAgentMetricsRow[];
}

/**
 * G1a — per-channel agent overrides keyed `channel_id → agent_type → enabled`.
 *
 * Returned by `getChannelCoverage`. Cells absent from this map inherit the
 * community-wide enabled flag from `getCommunityAgentStatus()`. Cells present
 * here win — `enabled: false` means "disabled on this channel even when the
 * agent is enabled community-wide".
 */
export interface ChannelCoverage {
  [channelId: number]: { [agentType: string]: boolean };
}

/**
 * G1b — autonomous-decision log row from `agent_actions`.
 *
 * Distinct from {@link AgentLog} (which reads `ai_agent_logs`, the human-
 * triggered post-execution log). The `correlation_id` here is a real UUID
 * that resolves against `POST /api/agents/<name>/feedback`, so Helpful /
 * Not helpful / Dismiss votes persist instead of 404ing.
 */
export type AgentDecisionLiteral = 'act' | 'defer' | 'skip';

export interface AgentAction {
  id: number;
  agent_name: string;
  community_id: number | null;
  channel_id: number | null;
  user_id: number | null;
  decision: AgentDecisionLiteral;
  reason: string;
  correlation_id: string;
  created_at: string | null;
  has_feedback: boolean;
}

class AIAgentService {
  // =====================================================
  // SUMMARIES AND MOOD
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

  /**
   * Ephemeral 1:1 DM summary. Result is only ever returned to the
   * requester — nothing persists server-side.
   */
  async summarizeDM(peerUserId: number, messageCount: number = 100): Promise<DMSummaryResult> {
    try {
      const response = await api.post(`/api/agents/summarize/dm/${peerUserId}`, {
        message_count: messageCount,
      });
      return response as any;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to generate DM summary');
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

  async analyzeMessage(text: string): Promise<MoodAnalysis> {
    try {
      const response: any = await api.post('/api/agents/mood/analyze-message', { text });
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

  // =====================================================
  // MODERATION CHECK, ENGAGEMENT POSTS AND POLLS
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

  /**
   * Post engagement content into a channel as a real AI bot message.
   * kind: 'starter' | 'poll' | 'icebreaker' | 'challenge' | 'pack'
   */
  async sendEngagementContent(
    channelId: number,
    kind: 'starter' | 'poll' | 'icebreaker' | 'challenge' | 'pack' = 'pack',
    category?: string
  ): Promise<any> {
    try {
      const response = await api.post('/api/agents/engagement/send', {
        channel_id: channelId,
        kind,
        category,
      });
      return response;
    } catch (error: any) {
      throw new Error(error.data?.error || error.message || 'Failed to send engagement content');
    }
  }

  /** Fetch current poll tallies + the caller's vote for a poll card. */
  async getPoll(messageId: number): Promise<{ tallies: number[]; total: number; my_vote: number | null }> {
    const response = await api.get(`/api/agents/engagement/poll/${messageId}`);
    return response as any;
  }

  /** Cast or change the caller's vote on a poll card. */
  async votePoll(messageId: number, optionIndex: number): Promise<{ tallies: number[]; total: number; my_vote: number }> {
    const response = await api.post(`/api/agents/engagement/poll/${messageId}/vote`, {
      option_index: optionIndex,
    });
    return response as any;
  }

  // =====================================================
  // KNOWLEDGE BASE AND FOCUS
  // =====================================================
  

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

  // =====================================================
  // AGENT HEALTH CHECK
  // =====================================================
  async getAgentStatus(): Promise<Record<string, string>> {
    try {
      const response: any = await api.get('/api/agents/health');
      return response.data.agents;
    } catch (error: any) {
      throw new Error('Failed to check agent status');
    }
  }

  // =====================================================
  // AGENT CATALOG & MANAGEMENT
  // =====================================================
  
  /** What each built-in agent lets you change, from the server. One request per page load. */
  getSettingsSchema(): Promise<SettingsSchema> {
    if (!this.settingsSchemaRequest) {
      this.settingsSchemaRequest = (api.get('/api/agents/settings-schema') as Promise<{ agents?: SettingsSchema }>)
        .then((r) => {
          const schema = r?.agents ?? {};
          registerSettingsSchema(schema);
          return schema;
        })
        .catch((error: any) => {
          this.settingsSchemaRequest = null;
          throw new Error(error.data?.error || error.message || 'Failed to load the agent settings');
        });
    }
    return this.settingsSchemaRequest;
  }

  private settingsSchemaRequest: Promise<SettingsSchema> | null = null;

  async getAgentCatalog(communityId?: string | number): Promise<AgentCatalogEntry[]> {
    try {
      const params = communityId ? `?community_id=${communityId}` : '';
      const response: any = await api.get(`/api/agents/catalog${params}`);
      return response.agents || [];
    } catch (error: any) {
      console.error('[Agent Service] Catalog error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch agent catalog');
    }
  }

  async installCommunityAgent(communityId: string | number, agentType: string, settings?: Record<string, any>): Promise<any> {
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

  async uninstallCommunityAgent(communityId: string | number, agentType: string): Promise<any> {
    try {
      const response = await api.del(`/api/agents/uninstall/community/${communityId}/${agentType}`);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Uninstall error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to uninstall agent');
    }
  }

  async configureCommunityAgent(communityId: string | number, agentType: string, settings: Record<string, any>, enabled?: boolean): Promise<any> {
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

  /**
   * G1a — per-channel agent overrides (CoverageMatrix).
   * Returns the override map; cells absent from the map inherit the
   * community-wide enabled flag from getCommunityAgentStatus.
   */
  async getChannelCoverage(communityId: string | number): Promise<ChannelCoverage> {
    try {
      const response = await api.get(`/api/agents/coverage/${communityId}`) as { coverage?: ChannelCoverage };
      const raw = response?.coverage ?? {};
      // Backend keys channel_id as a string (JSON object key). Re-key as number
      // so callers can index by Channel.id without string casts at every site.
      const out: ChannelCoverage = {};
      for (const [chKey, agentMap] of Object.entries(raw)) {
        const chId = Number(chKey);
        if (Number.isFinite(chId)) out[chId] = agentMap as Record<string, boolean>;
      }
      return out;
    } catch (error: any) {
      console.error('[Agent Service] Get coverage error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to load channel coverage');
    }
  }

  async configureChannelAgent(
    communityId: string | number,
    channelId: number,
    agentType: string,
    enabled: boolean,
  ): Promise<{ success: boolean; enabled: boolean }> {
    try {
      const response = await api.put(
        `/api/agents/configure/channel/${communityId}/${channelId}/${agentType}`,
        { enabled },
      ) as { success?: boolean; enabled?: boolean };
      return {
        success: response?.success === true,
        enabled: response?.enabled === true,
      };
    } catch (error: any) {
      console.error('[Agent Service] Configure channel agent error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to configure channel override');
    }
  }

  async getCommunityAgentStatus(communityId: string | number): Promise<InstalledAgent[]> {
    try {
      const response: any = await api.get(`/api/agents/status/community/${communityId}`);
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
      const response: any = await api.get('/api/agents/status/personal');
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
      const response: any = await api.get(`/api/agents/logs?${searchParams.toString()}`);
      return response;
    } catch (error: any) {
      console.error('[Agent Service] Logs error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch agent logs');
    }
  }

  /**
   * G1b — autonomous-decision rows from `agent_actions`. Distinct from
   * getAgentLogs (which reads `ai_agent_logs`). Each row carries a real
   * UUID correlation_id usable for /agents/<name>/feedback.
   */
  async getAgentActions(params: {
    community_id: number;
    limit?: number;
    agent_name?: string;
    decision?: AgentDecisionLiteral;
  }): Promise<AgentAction[]> {
    try {
      const sp = new URLSearchParams();
      sp.set('community_id', String(params.community_id));
      if (params.limit !== undefined) sp.set('limit', String(params.limit));
      if (params.agent_name) sp.set('agent_name', params.agent_name);
      if (params.decision) sp.set('decision', params.decision);
      const response = await api.get(`/api/agents/actions?${sp.toString()}`) as { actions?: AgentAction[] };
      return Array.isArray(response?.actions) ? response.actions : [];
    } catch (error: any) {
      console.error('[Agent Service] Actions error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch agent actions');
    }
  }

  // Autonomy / goal-attainment / feedback metrics. Backs the
  // Community Intelligence Hub outcome tiles + intelligence state pill (F4)
  // and shares the response shape with the platform-wide AgentMetrics page.
  async getAgentMetrics(params: { days?: number; community_id?: string | number } = {}): Promise<MetricsResponse> {
    try {
      const searchParams = new URLSearchParams();
      if (params.days !== undefined) searchParams.set('days', String(params.days));
      if (params.community_id !== undefined) searchParams.set('community_id', String(params.community_id));
      const qs = searchParams.toString();
      const url = qs ? `/api/agents/metrics?${qs}` : '/api/agents/metrics';
      const response = await api.get(url);
      return response as unknown as MetricsResponse;
    } catch (error: any) {
      console.error('[Agent Service] Metrics error:', error);
      throw new Error(error.data?.error || error.message || 'Failed to fetch agent metrics');
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

  async createSummarySchedule(data: { channel_id: number; community_id: string | number; schedule_time: string; timezone?: string }): Promise<any> {
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
  // TRANSLATOR AND QUICK REPLIES
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