// components/chat/MentionPopup.tsx — "@" suggestions above the message composer
import React from 'react';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import type { MentionableAgent } from '@/types/agentBuilder';

interface Props {
  agents: MentionableAgent[];
  activeIndex: number;
  onPick: (agent: MentionableAgent) => void;
  onHover: (index: number) => void;
}

const MentionPopup: React.FC<Props> = ({ agents, activeIndex, onPick, onHover }) => {
  if (agents.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Mention an agent"
      data-testid="mention-popup"
      className="absolute bottom-full left-0 mb-2 w-full max-w-sm rounded-lg shadow-popover border overflow-hidden z-50 bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]"
    >
      <div className="px-2.5 py-1 text-xs font-semibold  border-b bg-[hsl(var(--theme-bg-secondary)/0.8)] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
        Agents
      </div>
      {agents.map((agent, i) => (
        <button
          key={agent.id}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          // mousedown (not click) so the input keeps focus and the caret position
          onMouseDown={(e) => { e.preventDefault(); onPick(agent); }}
          onMouseEnter={() => onHover(i)}
          className={`w-full px-2.5 py-1.5 text-left transition-colors flex items-center gap-2 ${
            i === activeIndex ? 'bg-[hsl(var(--theme-bg-active))]' : 'hover:bg-[hsl(var(--theme-bg-hover))]'
          }`}
        >
          <AgentLogo name={agent.name} username={agent.username} builtin={agent.builtin} avatarUrl={agent.avatar_url} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{agent.name}</span>
              <span className="text-xs text-[hsl(var(--theme-text-muted))]">@{agent.username}</span>
              <span className="ml-auto rounded border border-border px-1 text-xs font-medium text-[hsl(var(--theme-text-muted))]">APP</span>
            </span>
            {agent.description && (
              <span className="block truncate text-xs text-[hsl(var(--theme-text-muted))]">{agent.description}</span>
            )}
          </span>
        </button>
      ))}
      <div className="px-2.5 py-1 text-xs border-t flex items-center gap-2 bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] border-[hsl(var(--theme-border-default))]">
        <span><kbd className="px-1 rounded text-xs bg-[hsl(var(--theme-bg-tertiary))]">↑↓</kbd> nav</span>
        <span><kbd className="px-1 rounded text-xs bg-[hsl(var(--theme-bg-tertiary))]">Tab</kbd> select</span>
        <span><kbd className="px-1 rounded text-xs bg-[hsl(var(--theme-bg-tertiary))]">Esc</kbd> close</span>
      </div>
    </div>
  );
};

export default MentionPopup;
