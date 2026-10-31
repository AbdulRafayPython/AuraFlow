import React from 'react';
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/agentBuilder';
import type { AgentStatus } from '@/types/agentBuilder';

const StatusChip: React.FC<{ status: AgentStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    data-testid="agent-status"
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {STATUS_LABELS[status]}
  </span>
);

export default StatusChip;
