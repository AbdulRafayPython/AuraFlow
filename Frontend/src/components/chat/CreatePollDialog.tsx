// "Create a poll" from the composer's + menu: a question and 2 to 6 answers.
// Posts a normal message with the same poll card agents use, so people vote
// on it in the channel and see live results.
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { channelService } from '@/services/channelService';

const MIN = 2;
const MAX = 6;
const input = 'h-10 w-full rounded-lg border border-border bg-[hsl(var(--theme-input-bg))] px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary';

export default function CreatePollDialog({ open, onOpenChange, channelId, channelName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: number | null;
  channelName?: string;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setQuestion(''); setOptions(['', '']); }
  }, [open]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const distinct = new Set(filled.map((o) => o.toLowerCase())).size;
  const ready = question.trim().length > 0 && distinct >= MIN && distinct === filled.length;

  const setOption = (i: number, v: string) => setOptions((list) => list.map((o, j) => (j === i ? v : o)));

  const post = async () => {
    if (!channelId || !ready) return;
    setBusy(true);
    try {
      await channelService.createPoll(channelId, question.trim(), filled);
      toast({ title: 'Poll posted', variant: 'success' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not post the poll', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a poll</DialogTitle>
          <DialogDescription>{channelName ? `Everyone in #${channelName} can vote.` : 'Everyone in the channel can vote.'}</DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="poll-question" className="mb-1.5 block text-sm font-medium text-foreground">Question</label>
          <input
            id="poll-question"
            className={input}
            value={question}
            maxLength={200}
            placeholder="What should we do for the next meetup?"
            onChange={(e) => setQuestion(e.target.value)}
            autoFocus
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-foreground">Answers</legend>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={input}
                  value={o}
                  maxLength={80}
                  aria-label={`Answer ${i + 1}`}
                  placeholder={`Answer ${i + 1}`}
                  // A row added with Enter or "Add an answer" is ready to type in.
                  autoFocus={i >= MIN && i === options.length - 1}
                  onChange={(e) => setOption(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && i === options.length - 1 && options.length < MAX && o.trim()) {
                      e.preventDefault();
                      setOptions((list) => [...list, '']);
                    }
                  }}
                />
                {options.length > MIN && (
                  <button
                    type="button"
                    onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                    aria-label={`Remove answer ${i + 1}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < MAX && (
            <button
              type="button"
              onClick={() => setOptions((list) => [...list, ''])}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-[hsl(var(--theme-text-accent))] hover:bg-[hsl(var(--theme-bg-hover))]"
            >
              <Plus className="h-4 w-4" /> Add an answer
            </button>
          )}
          {filled.length !== distinct && <p className="mt-1.5 text-xs text-warning">Two answers are the same.</p>}
        </fieldset>

        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy}
                  className="inline-flex h-9 items-center rounded-md bg-[hsl(var(--theme-bg-tertiary))] px-4 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))]">
            Cancel
          </button>
          <button type="button" onClick={() => void post()} disabled={!ready || busy}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Post poll
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
