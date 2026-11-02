// What Aura remembers of your private questions (the Ask box), and a way to clear it.
import React, { useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';

const AuraMemoryCard: React.FC = () => {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await agentBuilderService.clearAuraMemory();
      toast({ title: 'Aura forgot your earlier questions' });
    } catch (e) {
      toast({ title: 'Could not clear it', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4" data-testid="aura-memory">
      <div className="flex min-w-0 items-start gap-3">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">What Aura remembers</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            In the Ask box Aura keeps your last 5 questions and answers for 30 minutes, so follow-ups work.
            Only you can see them.
          </p>
        </div>
      </div>
      <button
        type="button" disabled={busy} onClick={() => setConfirming(true)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Clear
      </button>
      <ConfirmDialog
        isOpen={confirming}
        title="Clear what Aura remembers?"
        description="Aura forgets your earlier questions in the Ask box. Nothing else changes."
        confirmText="Clear"
        isDangerous
        isLoading={busy}
        onConfirm={clear}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};

export default AuraMemoryCard;
