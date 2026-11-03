// Where the agents are managed now: the Agents page. Used in Settings and in a community's settings.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';

interface Props {
  /** Open the Agents page on this community (its public id). */
  communityId?: string;
  communityName?: string;
  /** Called before leaving, e.g. to close a dialog. */
  onNavigate?: () => void;
}

const ManageAgentsCard: React.FC<Props> = ({ communityId, communityName, onNavigate }) => {
  const navigate = useNavigate();
  const go = () => {
    onNavigate?.();
    navigate(communityId ? `/agents/mine?community=${encodeURIComponent(communityId)}` : '/agents/mine');
  };
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4" data-testid="manage-agents">
      <div className="flex min-w-0 items-start gap-3">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{communityName ? `Agents in ${communityName}` : 'Your agents'}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Turn agents on or off, change their settings, choose the channels they act in, see what they did and
            set up daily summaries on the Agents page.
          </p>
        </div>
      </div>
      <button
        type="button" onClick={go}
        className="inline-flex h-8 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Open Agents
      </button>
    </div>
  );
};

export default ManageAgentsCard;
