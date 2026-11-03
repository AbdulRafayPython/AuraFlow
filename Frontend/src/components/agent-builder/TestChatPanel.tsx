// Try the agent before (or after) publishing. Nothing is posted to any channel.
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import type { TestResult } from '@/types/agentBuilder';
import type { Channel } from '@/types';
import RunTrace from './RunTrace';
import { btnPrimary, cardCls, hintCls, inputCls } from './styles';

interface Turn {
  id: number;
  role: 'user' | 'agent' | 'error';
  text: string;
  result?: TestResult;
}

interface Props {
  agentId: string;
  agentName: string;
  channels: Channel[];
  /** Unsaved edits would not be used by the test, so the panel says so. */
  hasUnsavedChanges?: boolean;
  /** No card border: for when the page already frames it (side column, sheet). */
  bare?: boolean;
}

let turnId = 0;

const TestChatPanel: React.FC<Props> = ({ agentId, agentName, channels, hasUnsavedChanges, bare = false }) => {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelId, setChannelId] = useState<number | ''>('');
  const endRef = useRef<HTMLDivElement>(null);
  const textChannels = channels.filter((c) => c.type !== 'voice');

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [turns, busy]);

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setTurns((t) => [...t, { id: ++turnId, role: 'user', text: message }]);
    setBusy(true);
    try {
      const result = await agentBuilderService.test(agentId, message, channelId === '' ? null : channelId);
      setTurns((t) => [...t, { id: ++turnId, role: 'agent', text: result.text || '(no answer)', result }]);
    } catch (err) {
      setTurns((t) => [...t, { id: ++turnId, role: 'error', text: errorMessage(err) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${bare ? '' : cardCls} flex h-full min-h-[420px] flex-col`} aria-label="Test chat">
      <header className="border-b border-[hsl(var(--theme-border-default))] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
          <MessageSquare className="h-4 w-4 text-[hsl(var(--theme-text-accent))]" /> Try {agentName}
        </h3>
        <p className={hintCls}>A private test. Nothing is posted to your channels.</p>
        {textChannels.length > 0 && (
          <select className={`${inputCls} mt-2 py-1.5 text-xs`} value={channelId} aria-label="Test in channel"
                  onChange={(e) => setChannelId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">No channel (general questions)</option>
            {textChannels.map((c) => <option key={c.id} value={c.id}>As if asked in # {c.name}</option>)}
          </select>
        )}
        {hasUnsavedChanges && (
          <p className="mt-2 text-xs text-warning">You have unsaved changes. Save first: the test uses the saved version.</p>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">Ask something it should be able to answer. Try one of these:</p>
            {['What can you help me with?', 'Hi! Who are you?'].map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => setInput(q)}
                      className="block w-full rounded-lg border border-[hsl(var(--theme-border-default))] px-3 py-2 text-left text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]">
                {q}
              </button>
            ))}
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={t.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
              t.role === 'user' ? 'bg-[hsl(var(--theme-accent-primary))] text-white'
                : t.role === 'error' ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-primary))]'}`}>
              <div className="whitespace-pre-line">{t.text}</div>
              {t.result && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[hsl(var(--theme-text-muted))]">
                    {t.result.tool_calls > 0 ? `${t.result.tool_calls} tool${t.result.tool_calls === 1 ? '' : 's'} used` : 'Answered without tools'} · run trace
                  </summary>
                  <RunTrace steps={t.result.steps} tokens={t.result.tokens} model={t.result.model} />
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--theme-text-muted))]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> {agentName} is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="flex gap-2 border-t border-[hsl(var(--theme-border-default))] p-3"
            onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input className={inputCls} value={input} onChange={(e) => setInput(e.target.value)}
               placeholder="Type a test question…" aria-label="Test message" maxLength={1000} disabled={busy} />
        <button type="submit" className={btnPrimary} disabled={busy || !input.trim()} aria-label="Send test message">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
};

export default TestChatPanel;
