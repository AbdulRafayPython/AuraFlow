// Approval cards for the channel being viewed, shown under the messages so the
// person can say yes or no right where the agent asked.
import React from 'react';
import { useApprovals } from '@/hooks/useApprovals';
import ApprovalCard from '@/components/agent-builder/ApprovalCard';

const InlineApprovals: React.FC<{ channelId: number | null | undefined }> = ({ channelId }) => {
  const { approvals } = useApprovals();
  const here = channelId == null ? [] : approvals.filter((a) => a.channel_id === channelId);
  if (here.length === 0) return null;
  return (
    <ul className="mx-4 my-2 space-y-2" data-testid="inline-approvals" aria-label="Waiting for your approval">
      {here.map((a) => <ApprovalCard key={a.id} approval={a} />)}
    </ul>
  );
};

export default InlineApprovals;
