// Integrations: API keys (let another service use this agent) and webhooks (tell another service what it did).
import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, LogIn, Plug, Plus, RefreshCw, Trash2, Webhook } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/modals/ConfirmDialog';
import AppSelect from '@/components/app/AppSelect';
import agentBuilderService, { errorMessage, MCP_CALLBACK_PATH } from '@/services/agentBuilderService';
import type { AgentApiKey, AgentWebhook, BuilderAgent, McpServer, WebhookEvent } from '@/types/agentBuilder';
import { btnDanger, btnGhost, btnPrimary, cardCls, hintCls, inputCls, labelCls } from './styles';

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'run.finished': 'A run finished',
  'approval.requested': 'It needs an approval',
};

type McpAuth = 'token' | 'oauth' | 'stdio';
interface McpForm { name: string; url: string; auth: McpAuth; token: string; client_id: string; client_secret: string; stdio_name: string }
const EMPTY_MCP: McpForm = { name: '', url: '', auth: 'token', token: '', client_id: '', client_secret: '', stdio_name: '' };

/** A secret that is shown once, with a copy button. */
const OneTimeSecret: React.FC<{ label: string; value: string; onDone: () => void }> = ({ label, value, onDone }) => {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied' });
    } catch {
      toast({ title: 'Could not copy. Select the text and copy it by hand.', variant: 'destructive' });
    }
  };
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-3" role="status">
      <p className="text-sm font-medium text-warning">{label}. Copy it now: it cannot be shown again.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded bg-black/30 px-2 py-1 text-xs text-warning" data-testid="one-time-secret">{value}</code>
        <button type="button" className={btnGhost} onClick={() => void copy()} aria-label="Copy"><Copy className="h-4 w-4" /></button>
        <button type="button" className={btnGhost} onClick={onDone}>Done</button>
      </div>
    </div>
  );
};

interface Props {
  agent: BuilderAgent;
  onSaved: (agent: BuilderAgent) => void;
}

const IntegrationsPanel: React.FC<Props> = ({ agent, onSaved }) => {
  const agentId = agent.id;
  const { toast } = useToast();
  const confirm = useConfirm();
  const [keys, setKeys] = useState<AgentApiKey[] | null>(null);
  const [hooks, setHooks] = useState<AgentWebhook[] | null>(null);
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [mcp, setMcp] = useState<McpForm>(EMPTY_MCP);
  const [stdioNames, setStdioNames] = useState<string[]>([]);
  const [keyName, setKeyName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<WebhookEvent[]>(['run.finished']);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, h, m] = await Promise.all([
        agentBuilderService.apiKeys(agentId), agentBuilderService.webhooks(agentId), agentBuilderService.mcpServers(agentId),
      ]);
      setKeys(k);
      setHooks(h);
      setServers(m);
    } catch (e) {
      setKeys([]);
      setHooks([]);
      setServers([]);
      toast({ title: 'Could not load integrations', description: errorMessage(e), variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  // Only system admins get a list (everyone else gets an empty one), so the "program" choice appears for them alone.
  useEffect(() => { agentBuilderService.mcpStdioServers().then(setStdioNames).catch(() => setStdioNames([])); }, []);

  // The login window tells us when it is done.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'auraflow-mcp-oauth') return;
      if (event.data.ok) toast({ title: 'Logged in', description: 'Press refresh to fetch the tools.' });
      else toast({ title: 'Login did not finish', variant: 'destructive' });
      void load();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      toast({ title: failure, description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const addKey = () => run(async () => {
    const created = await agentBuilderService.createApiKey(agentId, keyName.trim());
    setSecret({ label: `API key "${created.name}"`, value: created.key });
    setKeyName('');
  }, 'Could not create the key');

  const addHook = () => run(async () => {
    const created = await agentBuilderService.createWebhook(agentId, hookUrl.trim(), hookEvents);
    setSecret({ label: 'Signing secret', value: created.secret });
    setHookUrl('');
  }, 'Could not add the webhook');

  const addServer = () => run(async () => {
    const base = { name: mcp.name.trim() };
    const created = await agentBuilderService.addMcpServer(agentId, mcp.auth === 'stdio'
      ? { ...base, transport: 'stdio', stdio_name: mcp.stdio_name }
      : mcp.auth === 'oauth'
        ? { ...base, url: mcp.url.trim(), auth: 'oauth', client_id: mcp.client_id.trim() || undefined, client_secret: mcp.client_secret.trim() || undefined }
        : { ...base, url: mcp.url.trim(), auth: 'token', token: mcp.token.trim() || undefined });
    setMcp(EMPTY_MCP);
    if (created.warning) toast({ title: 'Saved, but the server could not be reached', description: created.warning, variant: 'destructive' });
  }, 'Could not add the server');

  const login = (serverId: number) => run(async () => {
    const { authorization_url } = await agentBuilderService.startMcpLogin(
      agentId, serverId, `${window.location.origin}${MCP_CALLBACK_PATH}`);
    if (!window.open(authorization_url, 'auraflow-mcp-login', 'width=620,height=760')) {
      toast({ title: 'Allow pop-ups to log in', description: 'Your browser blocked the login window.', variant: 'destructive' });
    }
  }, 'Could not start the login');

  const allowed = new Set(agent.tools ?? []);
  const setToolAllowed = (name: string, on: boolean) => run(async () => {
    const next = on ? [...(agent.tools ?? []), name] : (agent.tools ?? []).filter((t) => t !== name);
    onSaved(await agentBuilderService.update(agentId, { tools: next }));
  }, 'Could not change the tools of this agent');

  const toggleEvent = (event: WebhookEvent) =>
    setHookEvents((list) => (list.includes(event) ? list.filter((e) => e !== event) : [...list, event]));

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-8">
      {secret && <OneTimeSecret label={secret.label} value={secret.value} onDone={() => setSecret(null)} />}

      <section aria-labelledby="keys-h">
        <h3 id="keys-h" className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
          <KeyRound className="h-4 w-4" /> API keys
        </h3>
        <p className={hintCls}>
          A key lets another service post a message as this agent or ask it to run. It can only use channels you can use, and anything
          the agent wants to change still waits for your approval.
        </p>
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <label className={labelCls} htmlFor="key-name">Key name</label>
            <input id="key-name" className={inputCls} placeholder="Zapier, CI, a script…" value={keyName} maxLength={60}
                   onChange={(e) => setKeyName(e.target.value)} />
          </div>
          <button type="button" className={`${btnPrimary} self-end`} disabled={busy || !keyName.trim()} onClick={() => void addKey()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create key
          </button>
        </div>
        {keys === null && <p className={hintCls} role="status">Loading…</p>}
        <ul className="mt-3 space-y-2">
          {keys?.map((k) => (
            <li key={k.id} className={`${cardCls} flex items-center justify-between gap-3 p-3`} data-testid="api-key">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                  {k.name} {k.revoked && <span className="ml-1 text-xs text-destructive">revoked</span>}
                </p>
                <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                  {k.prefix}… · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : 'never used'}
                </p>
              </div>
              {!k.revoked && (
                <button type="button" className={btnDanger} disabled={busy}
                        onClick={() => void confirm({ title: `Revoke ${k.name}?`, description: 'Anything using this key stops working right away.', confirmText: 'Revoke key', danger: true })
                          .then((ok) => ok && run(() => agentBuilderService.revokeApiKey(agentId, k.id), 'Could not revoke'))}>
                  <Trash2 className="h-4 w-4" /> Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
        <details className="mt-3 text-xs text-[hsl(var(--theme-text-muted))]">
          <summary className="cursor-pointer">How to use a key</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-3 text-xs leading-relaxed text-[hsl(var(--theme-text-secondary))]">{`# post a message as the agent
curl -X POST ${origin}/api/public/v1/messages \\
  -H "Authorization: Bearer <your key>" -H "Content-Type: application/json" \\
  -d '{"channel_id": 12, "text": "Deploy finished"}'

# ask the agent to do something (the answer appears in the channel)
curl -X POST ${origin}/api/public/v1/invoke \\
  -H "Authorization: Bearer <your key>" -H "Content-Type: application/json" \\
  -d '{"channel_id": 12, "message": "Summarise today"}'`}</pre>
        </details>
      </section>

      <section aria-labelledby="mcp-h">
        <h3 id="mcp-h" className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
          <Plug className="h-4 w-4" /> MCP servers
        </h3>
        <p className={hintCls}>
          Connect an MCP server (HTTPS) to give this agent its tools. A tool the server marks read-only runs by itself; every other tool
          asks for your approval each time and shows you the exact request. Only connect servers you trust.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
          <div>
            <label className={labelCls} htmlFor="mcp-name">Name</label>
            <input id="mcp-name" className={inputCls} placeholder="notion" value={mcp.name} maxLength={24}
                   onChange={(e) => setMcp({ ...mcp, name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="mcp-auth">How does it log in?</label>
            <AppSelect id="mcp-auth" value={mcp.auth} onChange={(v) => setMcp({ ...mcp, auth: v as McpAuth })}
                       options={[
                         { value: 'token', label: 'Access token (or none)' },
                         { value: 'oauth', label: 'Sign in with the provider (OAuth)' },
                         ...(stdioNames.length > 0 ? [{ value: 'stdio', label: 'A program on this server (admin)' }] : []),
                       ]} />
          </div>
        </div>
        {mcp.auth === 'stdio' ? (
          <div className="mt-2">
            <label className={labelCls} htmlFor="mcp-stdio">Program</label>
            <AppSelect id="mcp-stdio" value={mcp.stdio_name} onChange={(v) => setMcp({ ...mcp, stdio_name: v })} placeholder="Choose a program"
                       options={stdioNames.map((n) => ({ value: n, label: n }))} />
            <p className={hintCls}>Only programs your server operator allowed. It runs on the API server with a minimal environment.</p>
          </div>
        ) : (
          <>
            <div className="mt-2">
              <label className={labelCls} htmlFor="mcp-url">Server URL</label>
              <input id="mcp-url" className={inputCls} placeholder="https://mcp.example.com/mcp" value={mcp.url} maxLength={500}
                     onChange={(e) => setMcp({ ...mcp, url: e.target.value })} />
            </div>
            {mcp.auth === 'token' ? (
              <div className="mt-2">
                <label className={labelCls} htmlFor="mcp-token">Access token (optional)</label>
                <input id="mcp-token" type="password" autoComplete="off" className={inputCls} value={mcp.token} maxLength={2000}
                       onChange={(e) => setMcp({ ...mcp, token: e.target.value })} />
                <p className={hintCls}>Stored encrypted and never shown again.</p>
              </div>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="mcp-client-id">Client id (only if the provider needs one)</label>
                  <input id="mcp-client-id" className={inputCls} value={mcp.client_id} maxLength={300}
                         onChange={(e) => setMcp({ ...mcp, client_id: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="mcp-client-secret">Client secret (optional)</label>
                  <input id="mcp-client-secret" type="password" autoComplete="off" className={inputCls} value={mcp.client_secret} maxLength={2000}
                         onChange={(e) => setMcp({ ...mcp, client_secret: e.target.value })} />
                </div>
                <p className={`${hintCls} sm:col-span-2`}>
                  Most providers register AuraFlow automatically. After connecting, press <strong>Connect</strong> on the server to log in.
                  Your provider may need this redirect address: <code>{typeof window !== 'undefined' ? window.location.origin : ''}{MCP_CALLBACK_PATH}</code>
                </p>
              </div>
            )}
          </>
        )}
        <button type="button" className={`${btnPrimary} mt-3`}
                disabled={busy || mcp.name.trim().length < 2 || (mcp.auth === 'stdio' ? !mcp.stdio_name : !mcp.url.trim())}
                onClick={() => void addServer()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Connect server
        </button>
        <ul className="mt-3 space-y-3">
          {servers?.map((srv) => (
            <li key={srv.id} className={`${cardCls} p-3`} data-testid="mcp-server">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[hsl(var(--theme-text-primary))]">{srv.name}</p>
                  <p className={`truncate text-xs ${srv.last_error ? 'text-destructive' : 'text-[hsl(var(--theme-text-muted))]'}`}>
                    {srv.last_error ?? (srv.auth === 'oauth' ? `${srv.url} · ${srv.oauth_connected ? 'logged in' : 'not logged in yet'}` : srv.auth === 'stdio' ? `program: ${srv.url.replace('stdio:', '')}` : srv.url)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {srv.auth === 'oauth' && (
                    <button type="button" className={btnGhost} disabled={busy} aria-label={`${srv.oauth_connected ? 'Reconnect' : 'Connect'} ${srv.name}`}
                            onClick={() => void login(srv.id)}>
                      <LogIn className="h-4 w-4" /> {srv.oauth_connected ? 'Reconnect' : 'Connect'}
                    </button>
                  )}
                  <button type="button" className={btnGhost} disabled={busy} aria-label={`Refresh ${srv.name} tools`}
                          onClick={() => void run(async () => { await agentBuilderService.refreshMcpServer(agentId, srv.id); }, 'Could not refresh')}>
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button type="button" className={btnDanger} disabled={busy} aria-label={`Remove ${srv.name}`}
                          onClick={() => void confirm({ title: `Remove ${srv.name}?`, description: 'The agent can no longer use the tools this server gives it.', confirmText: 'Remove', danger: true })
                            .then((ok) => ok && run(async () => {
                            await agentBuilderService.deleteMcpServer(agentId, srv.id);
                            onSaved(await agentBuilderService.get(agentId));
                          }, 'Could not remove'))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {srv.tools.length === 0 && <p className={hintCls}>No tools yet. Press refresh once the server is reachable.</p>}
              <ul className="mt-2 space-y-1">
                {srv.tools.map((t) => (
                  <li key={t.name} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" id={`tool-${t.name}`} className="mt-1" checked={allowed.has(t.name)} disabled={busy}
                           onChange={(e) => void setToolAllowed(t.name, e.target.checked)} />
                    <label htmlFor={`tool-${t.name}`} className="min-w-0 text-[hsl(var(--theme-text-secondary))]">
                      <span className="font-medium text-[hsl(var(--theme-text-primary))]">{t.remote_name}</span>{' '}
                      <span className={`rounded px-1 text-xs font-semibold ${
                        t.risk === 'read' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                        {t.risk === 'read' ? 'runs by itself' : 'needs approval'}
                      </span>
                      {t.description && <span className="block text-xs text-[hsl(var(--theme-text-muted))]">{t.description}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hooks-h">
        <h3 id="hooks-h" className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
          <Webhook className="h-4 w-4" /> Webhooks
        </h3>
        <p className={hintCls}>
          We send a signed JSON request to your URL (HTTPS, public address only). Check the <code>X-AuraFlow-Signature</code> header:
          it is <code>sha256=</code> and the HMAC-SHA256 of the raw body using the secret.
        </p>
        <div className="mt-3">
          <label className={labelCls} htmlFor="hook-url">URL</label>
          <input id="hook-url" className={inputCls} placeholder="https://example.com/auraflow" value={hookUrl} maxLength={500}
                 onChange={(e) => setHookUrl(e.target.value)} />
        </div>
        <fieldset className="mt-3 flex flex-wrap gap-4">
          <legend className={labelCls}>Send me</legend>
          {(Object.keys(EVENT_LABELS) as WebhookEvent[]).map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm text-[hsl(var(--theme-text-secondary))]">
              <input type="checkbox" checked={hookEvents.includes(event)} onChange={() => toggleEvent(event)} /> {EVENT_LABELS[event]}
            </label>
          ))}
        </fieldset>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !hookUrl.trim() || hookEvents.length === 0}
                onClick={() => void addHook()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add webhook
        </button>
        <ul className="mt-3 space-y-2">
          {hooks?.map((h) => (
            <li key={h.id} className={`${cardCls} flex items-center justify-between gap-3 p-3`} data-testid="webhook">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[hsl(var(--theme-text-primary))]">{h.url}</p>
                <p className={`text-xs ${h.last_error ? 'text-destructive' : 'text-[hsl(var(--theme-text-muted))]'}`}>
                  {h.events.map((e) => EVENT_LABELS[e] ?? e).join(', ')} ·{' '}
                  {h.last_at ? (h.last_error ?? `last delivery OK (${h.last_status})`) : 'not called yet'}
                </p>
              </div>
              <button type="button" className={btnDanger} disabled={busy}
                      onClick={() => void run(() => agentBuilderService.deleteWebhook(agentId, h.id), 'Could not delete')}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default IntegrationsPanel;
