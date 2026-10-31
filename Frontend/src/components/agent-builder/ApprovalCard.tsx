// One thing an agent wants to do, with Approve and Reject.
import React, { useState } from 'react';
import { Check, Loader2, ShieldQuestion, X } from 'lucide-react';
import { toolLabel } from '@/lib/agentBuilder';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/services/agentBuilderService';
import { decideApproval } from '@/hooks/useApprovals';
import { describeExpiry } from '@/lib/agentBuilder';
import type { AgentApproval } from '@/types/agentBuilder';
import { btnGhost, btnPrimary, cardCls } from './styles';

/** "in_minutes" → "In minutes". */
export function humanKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Readable value: minutes as a duration, lists joined, objects compact. */
export function humanValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && /minute/.test(key)) {
    const h = Math.floor(value / 60), m = value % 60;
    return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const ApprovalCard: React.FC<{ approval: AgentApproval }> = ({ approval }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'reject');
    try {
      await decideApproval(approval.id, approve);
      toast({ title: approve ? 'Approved' : 'Rejected', description: approve ? `${approval.agent.name} will go ahead.` : undefined });
    } catch (e) {
      setBusy(null);
      toast({ title: 'Could not save your decision', description: errorMessage(e), variant: 'destructive' });
    }
  };

  return (
    <li className={`${cardCls} p-4`} data-testid="approval-card">
      <div className="flex items-start gap-3">
        <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--theme-text-muted))]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
            {approval.agent.name} needs your approval
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-[hsl(var(--theme-text-secondary))]">{approval.summary}</p>
          {approval.tool && (
            <details className="mt-2" data-testid="approval-args">
              <summary className="cursor-pointer text-xs text-[hsl(var(--theme-text-muted))]">
                Details: {toolLabel(approval.tool)}
              </summary>
              <dl className="mt-1 space-y-1 rounded-md border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-tertiary))] p-2 text-xs">
                {Object.entries(approval.args ?? {}).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="shrink-0 text-[hsl(var(--theme-text-muted))]">{humanKey(key)}</dt>
                    <dd className="min-w-0 break-words text-[hsl(var(--theme-text-primary))]">{humanValue(key, value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <p className="mt-2 text-xs text-[hsl(var(--theme-text-muted))]">{describeExpiry(approval.expires_at)}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => void decide(false)}>
          {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
        </button>
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void decide(true)}>
          {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
        </button>
      </div>
    </li>
  );
};

export default ApprovalCard;
