// services/agentBuilderService.ts — client for /api/agent-builder
import api, { type ApiError } from './appService';
import type {
  AgentFormValues, AgentRunDetail, AgentRunSummary, AgentTemplate, AgentTrigger, BuilderAgent, BuilderTool,
  AgentApiKey, AgentApproval, AgentWebhook, GeneratedDraft, KnowledgeSource, McpServer, MentionableAgent,
  TemplateTrigger, TestResult, TodayView, WebhookEvent,
} from '@/types/agentBuilder';

const BASE = '/api/agent-builder';

// appService returns loosely typed JSON; this wrapper states the response type at each call site.
const http = {
  get: <T>(path: string) => api.get(path) as unknown as Promise<T>,
  post: <T>(path: string, body?: unknown) => api.post(path, body) as unknown as Promise<T>,
  put: <T>(path: string, body?: unknown) => api.put(path, body) as unknown as Promise<T>,
  patch: <T>(path: string, body?: unknown) => api.patch(path, body) as unknown as Promise<T>,
  del: (path: string) => api.del(path) as unknown as Promise<void>,
};

/** Message to show for a failed call, including the backend's per-field details when present. */
export function errorMessage(err: unknown): string {
  const e = err as ApiError | undefined;
  const details = (e?.data as { details?: string[] } | null | undefined)?.details;
  const base = e?.message || 'Something went wrong';
  return details && details.length ? `${base}: ${details.join('; ')}` : base;
}

/** What the panel sends to connect an MCP server. */
export interface McpServerInput {
  name: string;
  /** Server address (ignored for a program on the API server). */
  url?: string;
  auth?: 'token' | 'oauth';
  token?: string;
  client_id?: string;
  client_secret?: string;
  transport?: 'stdio';
  stdio_name?: string;
}

/** Where the provider sends the browser back after an OAuth login (must match the server's rule). */
export const MCP_CALLBACK_PATH = '/api/agent-builder/mcp/oauth/callback';

export interface CreateAgentInput extends Partial<AgentFormValues> {
  template?: string;
  community_id?: string | null;
  channel_id?: number | null;
  triggers?: Array<TemplateTrigger | AgentTrigger>;
}

/** PATCH body: the form's field names map 1:1 except channel_ids -> permissions.channel_ids. */
export function toPatchBody(values: Partial<AgentFormValues>): Record<string, unknown> {
  const { channel_ids, ...rest } = values;
  return channel_ids === undefined ? rest : { ...rest, permissions: { channel_ids } };
}

export const agentBuilderService = {
  async templates(): Promise<AgentTemplate[]> {
    return (await http.get<{ templates: AgentTemplate[] }>(`${BASE}/templates`)).templates;
  },
  async tools(): Promise<BuilderTool[]> {
    return (await http.get<{ tools: BuilderTool[] }>(`${BASE}/tools`)).tools;
  },
  generate(prompt: string): Promise<GeneratedDraft> {
    return http.post<GeneratedDraft>(`${BASE}/generate`, { prompt });
  },

  async list(opts: { communityId?: string } = {}): Promise<BuilderAgent[]> {
    const q = opts.communityId ? `?community_id=${encodeURIComponent(opts.communityId)}` : '';
    return (await http.get<{ agents: BuilderAgent[] }>(`${BASE}/agents${q}`)).agents;
  },
  async mentionable(communityId?: string): Promise<MentionableAgent[]> {
    const q = communityId ? `?community_id=${encodeURIComponent(communityId)}` : '';
    return (await http.get<{ agents: MentionableAgent[] }>(`${BASE}/agents/mentionable${q}`)).agents;
  },
  get(id: string): Promise<BuilderAgent> {
    return http.get<BuilderAgent>(`${BASE}/agents/${id}`);
  },
  create(input: CreateAgentInput): Promise<BuilderAgent> {
    const { channel_ids, ...rest } = input;
    const body: Record<string, unknown> = { ...rest };
    if (channel_ids) body.permissions = { channel_ids };
    return http.post<BuilderAgent>(`${BASE}/agents`, body);
  },
  update(id: string, values: Partial<AgentFormValues>): Promise<BuilderAgent> {
    return http.patch<BuilderAgent>(`${BASE}/agents/${id}`, toPatchBody(values));
  },
  publish(id: string): Promise<BuilderAgent> {
    return http.post<BuilderAgent>(`${BASE}/agents/${id}/publish`);
  },
  pause(id: string): Promise<BuilderAgent> {
    return http.post<BuilderAgent>(`${BASE}/agents/${id}/pause`);
  },
  archive(id: string): Promise<void> {
    return http.del(`${BASE}/agents/${id}`);
  },
  setTriggers(id: string, triggers: Array<Partial<AgentTrigger> & { type: AgentTrigger['type'] }>): Promise<BuilderAgent> {
    return http.put<BuilderAgent>(`${BASE}/agents/${id}/triggers`, { triggers });
  },

  async knowledge(id: string): Promise<KnowledgeSource[]> {
    return (await http.get<{ sources: KnowledgeSource[] }>(`${BASE}/agents/${id}/knowledge`)).sources;
  },
  addText(id: string, title: string, text: string): Promise<unknown> {
    return http.post(`${BASE}/agents/${id}/knowledge`, { type: 'text', title, text });
  },
  addChannel(id: string, channelId: number, title?: string): Promise<unknown> {
    return http.post(`${BASE}/agents/${id}/knowledge`, { type: 'channel', channel_id: channelId, title });
  },
  addFile(id: string, file: File, title?: string): Promise<unknown> {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    return http.post(`${BASE}/agents/${id}/knowledge`, form);
  },
  removeKnowledge(id: string, sourceId: number): Promise<void> {
    return http.del(`${BASE}/agents/${id}/knowledge/${sourceId}`);
  },

  test(id: string, message: string, channelId?: number | null): Promise<TestResult> {
    return http.post<TestResult>(`${BASE}/agents/${id}/test`, { message, channel_id: channelId ?? undefined });
  },
  async runs(id: string, limit = 20, offset = 0): Promise<AgentRunSummary[]> {
    return (await http.get<{ runs: AgentRunSummary[] }>(`${BASE}/agents/${id}/runs?limit=${limit}&offset=${offset}`)).runs;
  },
  run(runUuid: string): Promise<AgentRunDetail> {
    return http.get<AgentRunDetail>(`${BASE}/runs/${runUuid}`);
  },

  async approvals(view: 'pending' | 'recent' = 'pending'): Promise<AgentApproval[]> {
    return (await http.get<{ approvals: AgentApproval[] }>(`${BASE}/approvals?status=${view}`)).approvals;
  },
  today(): Promise<TodayView> {
    return http.get<TodayView>(`${BASE}/today`);
  },
  async apiKeys(id: string): Promise<AgentApiKey[]> {
    return (await http.get<{ keys: AgentApiKey[] }>(`${BASE}/agents/${id}/api-keys`)).keys;
  },
  createApiKey(id: string, name: string): Promise<AgentApiKey & { key: string }> {
    return http.post(`${BASE}/agents/${id}/api-keys`, { name });
  },
  revokeApiKey(id: string, keyId: number): Promise<void> {
    return http.del(`${BASE}/agents/${id}/api-keys/${keyId}`);
  },
  async mcpServers(id: string): Promise<McpServer[]> {
    return (await http.get<{ servers: McpServer[] }>(`${BASE}/agents/${id}/mcp`)).servers;
  },
  addMcpServer(id: string, body: McpServerInput): Promise<McpServer> {
    return http.post<McpServer>(`${BASE}/agents/${id}/mcp`, body);
  },
  startMcpLogin(id: string, serverId: number, redirectUri: string): Promise<{ authorization_url: string }> {
    return http.post(`${BASE}/agents/${id}/mcp/${serverId}/oauth/start`, { redirect_uri: redirectUri });
  },
  async mcpStdioServers(): Promise<string[]> {
    return (await http.get<{ servers: string[] }>(`${BASE}/mcp/stdio-servers`)).servers;
  },
  refreshMcpServer(id: string, serverId: number): Promise<McpServer> {
    return http.post<McpServer>(`${BASE}/agents/${id}/mcp/${serverId}/refresh`);
  },
  deleteMcpServer(id: string, serverId: number): Promise<void> {
    return http.del(`${BASE}/agents/${id}/mcp/${serverId}`);
  },
  async webhooks(id: string): Promise<AgentWebhook[]> {
    return (await http.get<{ webhooks: AgentWebhook[] }>(`${BASE}/agents/${id}/webhooks`)).webhooks;
  },
  createWebhook(id: string, url: string, events: WebhookEvent[]): Promise<AgentWebhook & { secret: string }> {
    return http.post(`${BASE}/agents/${id}/webhooks`, { url, events });
  },
  deleteWebhook(id: string, webhookId: number): Promise<void> {
    return http.del(`${BASE}/agents/${id}/webhooks/${webhookId}`);
  },

  approve(id: number): Promise<{ id: number; status: string }> {
    return http.post(`${BASE}/approvals/${id}/approve`);
  },
  reject(id: number): Promise<{ id: number; status: string }> {
    return http.post(`${BASE}/approvals/${id}/reject`);
  },
};

export default agentBuilderService;
