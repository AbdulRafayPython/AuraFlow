// "<agent> is working…" row shown under the messages while an agent run is in flight.
import React from 'react';
import type { ThinkingAgent } from '@/types';
import { AgentAvatar, WorkingLine } from './AgentMessageShell';

interface Props {
  agents: ThinkingAgent[];
}

const AgentThinkingIndicator: React.FC<Props> = ({ agents }) => {
  if (agents.length === 0) return null;
  const names = Array.from(new Set(agents.map((a) => a.name)));
  const label = `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} working…`;
  return (
    <div className="mt-3 flex items-center gap-3 px-4" aria-live="polite" data-testid="agent-thinking">
      <AgentAvatar name={names[0]} />
      <WorkingLine label={label} />
    </div>
  );
};

export default AgentThinkingIndicator;
