// Types for the Agent Builder API (/api/agent-builder). Community ids are the public (uuid) ids.

export type AgentStatus = 'draft' | 'active' | 'paused' | 'archived';
export type TriggerType = 'mention' | 'keyword' | 'channel_message' | 'schedule' | 'member_joined' | 'channel_silent' | 'focus_drift'
  | 'mood_escalation';
export type ModelTier = 'fast' | 'smart';

export interface TriggerConfig {
  keywords?: string[];
  cron?: string;
  tz?: string;
  prompt?: string;
  /** channel_silent: how long the channel must have been quiet, in minutes. */
  min_minutes?: number;
  /** Where the answer goes: the channel (default) or a DM to one person. */
  delivery?: 'channel' | 'private';
}

export interface AgentTrigger {
  id?: number;
  type: TriggerType;
  channel_id: number | null;
  config: TriggerConfig;
  enabled: boolean;
}

export interface TemplateTrigger {
  type: TriggerType;
  config?: TriggerConfig;
}

export interface AgentTemplate {
  key: string;
  name: string;
  description: string;
  suggested_name: string;
  instructions: string;
  tools: string[];
  model_tier: ModelTier;
  needs_channel: boolean;
  triggers: TemplateTrigger[];
}

export interface BuilderTool {
  name: string;
  description: string;
  risk: 'read' | 'write' | 'admin';
  /** Reads the asker's own mood or DMs: used only when the agent answers them by DM. */
  private_only?: boolean;
}

export interface KnowledgeSource {
  id: number;
  type: 'text' | 'file' | 'channel';
  title: string;
  ref: string | null;
  status: 'pending' | 'ready' | 'failed';
  error: string | null;
  chunks: number;
  created_at: string;
}

export interface BuilderAgent {
  id: string;
  name: string;
  description: string;
  username: string;
  avatar_url: string | null;
  community_id: string | null;
  status: AgentStatus;
  template_key: string | null;
  is_builtin: boolean;
  // Present only for people who can manage the agent
  instructions?: string;
  model_tier?: ModelTier;
  tools?: string[];
  permissions?: { channel_ids?: number[] };
  daily_run_cap?: number;
  version?: number;
  triggers?: AgentTrigger[];
  knowledge?: KnowledgeSource[];
  notes?: string[];
}

export interface AgentDraft {
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  triggers: TemplateTrigger[];
}

export interface GeneratedDraft {
  draft: AgentDraft;
  notes: string[];
}

export interface TestStep {
  step: number;
  kind: 'llm' | 'tool_call' | 'tool_result' | 'approval' | 'final';
  tool: string | null;
  args: unknown;
  result: unknown;
  latency_ms: number | null;
}

export interface TestResult {
  status: string;
  text: string | null;
  error: string | null;
  tool_calls: number;
  tokens: { in: number; out: number };
  model: string;
  run_id: string;
  steps: TestStep[];
}

export interface AgentRunSummary {
  run_uuid: string;
  trigger_type: string;
  is_dry_run: boolean;
  status: string;
  input_text: string | null;
  output_text: string | null;
  step_count: number;
  tokens_in: number;
  tokens_out: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface AgentRunDetail extends AgentRunSummary {
  steps: TestStep[];
}

/** An agent that can be @mentioned in the current community. */
export interface MentionableAgent {
  id: string;
  name: string;
  username: string;
  description: string;
  avatar_url: string | null;
  builtin: boolean;
}

/** Fields the builder form edits. */
export interface AgentFormValues {
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  model_tier: ModelTier;
  daily_run_cap: number;
  channel_ids: number[];
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** Something an agent wants to do that waits for a person to say yes. */
export interface AgentApproval {
  id: number;
  status: ApprovalStatus;
  summary: string;
  tool: string;
  args: Record<string, unknown>;
  agent: { id: string | null; name: string };
  channel_id: number | null;
  result: { ok?: boolean; error?: string } | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

/** Socket event after an approval is decided or has run. */
export interface ApprovalResolvedEvent {
  id: number;
  status: 'approved' | 'rejected' | 'expired' | 'failed';
  summary?: string;
  agent?: string | null;
  error?: string | null;
}

export interface AgentApiKey {
  id: number;
  name: string;
  prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

export interface McpTool {
  name: string;
  remote_name: string;
  description: string;
  risk: 'read' | 'write';
}

export interface McpServer {
  id: number;
  name: string;
  url: string;
  has_token: boolean;
  /** How the server is used: no login, a bearer token, an OAuth login, or a program on the API server. */
  auth: 'none' | 'token' | 'oauth' | 'stdio';
  oauth_connected: boolean;
  enabled: boolean;
  tools: McpTool[];
  fetched_at: string | null;
  last_error: string | null;
  warning?: string;
}

export type WebhookEvent = 'run.finished' | 'approval.requested';

export interface AgentWebhook {
  id: number;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  last_status: number | null;
  last_error: string | null;
  last_at: string | null;
}

export type MarketplaceCategory = 'support' | 'community' | 'productivity' | 'learning' | 'fun' | 'other';

/** A shared agent recipe. Installing it creates a new draft agent for the installer. */
export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  status: 'published' | 'unpublished';
  installs: number;
  publisher: string | null;
  mine: boolean;
  instructions: string;
  tools: string[];
  model_tier: ModelTier;
  triggers: string[];
  /** Average stars (1 decimal), or null when nobody has rated it. */
  rating: number | null;
  rating_count: number;
  my_rating: number | null;
  updated_at: string | null;
}

/** One screen of "what needs me and what did my agents do". */
export interface TodayView {
  approvals: AgentApproval[];
  reminders: Array<{ id: number; text: string; remind_at: string; channel_id: number; channel: string; agent: string | null }>;
  agents: Array<{
    id: string; name: string; status: AgentStatus; runs: number; failed: number; waiting: number; tokens: number; daily_run_cap: number;
  }>;
  recent_runs: Array<{ run_id: string; status: string; trigger: string; started_at: string; agent: string; agent_id: string }>;
}
