// "How did it answer?": the tools an agent called and what they returned.
import React from 'react';
import { Brain, Wrench } from 'lucide-react';
import { formatTokens, toolLabel } from '@/lib/agentBuilder';
import type { TestStep } from '@/types/agentBuilder';

function pretty(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface Props {
  steps: TestStep[];
  tokens?: { in: number; out: number };
  model?: string;
}

const RunTrace: React.FC<Props> = ({ steps, tokens, model }) => {
  const calls = steps.filter((s) => s.kind === 'tool_call');
  const results = new Map<number, TestStep>();
  // A tool_result always follows its tool_call; pair them by order.
  steps.forEach((s, i) => {
    if (s.kind === 'tool_result') {
      for (let j = i - 1; j >= 0; j--) {
        if (steps[j].kind === 'tool_call' && steps[j].tool === s.tool && !results.has(steps[j].step)) {
          results.set(steps[j].step, s);
          break;
        }
      }
    }
  });
  const llmCalls = steps.filter((s) => s.kind === 'llm').length;

  return (
    <div className="mt-2 rounded-md border border-[hsl(var(--theme-border-subtle))] bg-[hsl(var(--theme-bg-secondary)/0.6)] p-2.5 text-xs" data-testid="run-trace">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[hsl(var(--theme-text-muted))]">
        <span className="inline-flex items-center gap-1"><Brain className="h-3 w-3" />{llmCalls} model call{llmCalls === 1 ? '' : 's'}</span>
        <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" />{calls.length} tool call{calls.length === 1 ? '' : 's'}</span>
        {tokens && <span>{formatTokens(tokens)}</span>}
        {model && <span>{model}</span>}
      </div>
      {calls.length === 0 && (
        <p className="mt-2 text-[hsl(var(--theme-text-muted))]">It answered without using any tool.</p>
      )}
      <ol className="mt-2 space-y-1.5">
        {calls.map((c) => {
          const res = results.get(c.step);
          const out = res ? (res.result as { error?: string } | null) : null;
          const failed = !!(out && typeof out === 'object' && 'error' in out && out.error);
          return (
            <li key={c.step}>
              <details className="group rounded border border-[hsl(var(--theme-border-subtle))] bg-[hsl(var(--theme-bg-primary)/0.5)]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[hsl(var(--theme-text-secondary))]">
                  <span className={`h-1.5 w-1.5 rounded-full ${failed ? 'bg-destructive' : 'bg-success'}`} aria-hidden="true" />
                  <span className="font-medium">{toolLabel(c.tool ?? 'tool')}</span>
                  {res?.latency_ms != null && <span className="text-[hsl(var(--theme-text-muted))]">{res.latency_ms} ms</span>}
                  {failed && <span className="text-destructive">failed</span>}
                </summary>
                <div className="space-y-1.5 border-t border-[hsl(var(--theme-border-subtle))] p-2">
                  <div>
                    <div className="mb-0.5 font-semibold text-[hsl(var(--theme-text-muted))]">Asked with</div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[hsl(var(--theme-text-secondary))]">{pretty(c.args)}</pre>
                  </div>
                  <div>
                    <div className="mb-0.5 font-semibold text-[hsl(var(--theme-text-muted))]">Got back</div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[hsl(var(--theme-text-secondary))]">{pretty(res?.result) || '(nothing)'}</pre>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default RunTrace;
