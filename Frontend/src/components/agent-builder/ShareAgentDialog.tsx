// "Share to the directory": what other people see, and a reminder of what is NOT shared.
import React, { useEffect, useState } from 'react';
import { Loader2, Store } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/services/agentBuilderService';
import marketplaceService, { CATEGORY_LABELS } from '@/services/marketplaceService';
import type { BuilderAgent, MarketplaceCategory } from '@/types/agentBuilder';
import { btnGhost, btnPrimary, hintCls, inputCls, labelCls } from './styles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: BuilderAgent;
}

const ShareAgentDialog: React.FC<Props> = ({ open, onOpenChange, agent }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [category, setCategory] = useState<MarketplaceCategory>('other');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTitle(agent.name); setDescription(agent.description ?? ''); }
  }, [open, agent.name, agent.description]);

  const share = async () => {
    setBusy(true);
    try {
      await marketplaceService.publish(agent.id, { title: title.trim(), description: description.trim(), category });
      toast({ title: 'Shared to the directory', description: 'Share again after changes to update the listing.' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not share', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))]">
        <DialogHeader>
          <DialogTitle>Share to the directory</DialogTitle>
          <DialogDescription>
            Anyone can read and install this agent&apos;s instructions, tools and triggers. Knowledge files, channels and the avatar stay with you.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className={labelCls} htmlFor="share-title">Title</label>
          <input id="share-title" className={inputCls} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="share-desc">Description</label>
          <textarea id="share-desc" className={inputCls} rows={3} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
          <p className={hintCls}>Say what it does in a sentence or two.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="share-cat">Category</label>
          <select id="share-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as MarketplaceCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={busy || title.trim().length < 2} onClick={() => void share()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />} Share
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareAgentDialog;
