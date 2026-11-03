// What an agent knows: pasted text, uploaded documents, or a channel's history.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Hash, Loader2, StickyNote, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import type { KnowledgeSource } from '@/types/agentBuilder';
import type { Channel } from '@/types';
import AppSelect from '@/components/app/AppSelect';
import { btnGhost, btnPrimary, cardCls, hintCls, inputCls, labelCls } from './styles';

type Mode = 'text' | 'file' | 'channel';

const ICONS = { text: StickyNote, file: FileText, channel: Hash } as const;

interface Props {
  agentId: string;
  channels: Channel[];
  /** Tells the page what it knows now (for the setup checklist). */
  onChange?: (sources: KnowledgeSource[]) => void;
}

const AgentKnowledgePanel: React.FC<Props> = ({ agentId, channels, onChange }) => {
  const { toast } = useToast();
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [channelId, setChannelId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textChannels = channels.filter((c) => c.type !== 'voice');

  const load = useCallback(async () => {
    try {
      const list = await agentBuilderService.knowledge(agentId);
      setSources(list);
      onChange?.(list);
    } catch (err) {
      setSources([]);
      toast({ title: 'Could not load knowledge', description: errorMessage(err), variant: 'destructive' });
    }
  }, [agentId, toast, onChange]);

  useEffect(() => { void load(); }, [load]);

  const done = async (message: string) => {
    toast({ title: message, variant: 'success' });
    setTitle('');
    setText('');
    if (fileRef.current) fileRef.current.value = '';
    await load();
  };

  const add = async () => {
    setBusy(true);
    try {
      if (mode === 'text') {
        await agentBuilderService.addText(agentId, title.trim() || 'Notes', text);
        await done('Notes added');
      } else if (mode === 'channel') {
        await agentBuilderService.addChannel(agentId, Number(channelId), title.trim() || undefined);
        await done('Channel history added');
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) return;
        await agentBuilderService.addFile(agentId, file, title.trim() || undefined);
        await done(`${file.name} added`);
      }
    } catch (err) {
      toast({ title: 'Could not add knowledge', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: KnowledgeSource) => {
    try {
      await agentBuilderService.removeKnowledge(agentId, s.id);
      setSources((list) => (list ?? []).filter((x) => x.id !== s.id));
    } catch (err) {
      toast({ title: 'Could not remove', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const canAdd = mode === 'text' ? text.trim().length > 0 : mode === 'channel' ? channelId !== '' : true;

  return (
    <div className="space-y-5">
      <div className={`${cardCls} p-4`}>
        <div role="tablist" aria-label="Add knowledge" className="mb-4 inline-flex rounded-md border border-[hsl(var(--theme-border-default))] p-0.5">
          {([['text', 'Write notes'], ['file', 'Upload a file'], ['channel', 'From a channel']] as Array<[Mode, string]>).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === m ? 'bg-[hsl(var(--theme-accent-primary))] text-white' : 'text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="knowledge-title">Title (optional)</label>
            <input id="knowledge-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder={mode === 'text' ? 'Fees policy' : 'Defaults to the file or channel name'} maxLength={200} />
          </div>
          {mode === 'text' && (
            <div>
              <label className={labelCls} htmlFor="knowledge-text">Notes</label>
              <textarea id="knowledge-text" className={`${inputCls} min-h-[130px]`} value={text}
                        onChange={(e) => setText(e.target.value)} placeholder="Paste the facts it should know…" />
            </div>
          )}
          {mode === 'file' && (
            <div>
              <label className={labelCls} htmlFor="knowledge-file">File</label>
              <input id="knowledge-file" ref={fileRef} type="file" accept=".txt,.md,.csv,.pdf,.docx"
                     className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-[hsl(var(--theme-bg-tertiary))] file:px-3 file:py-1 file:text-xs file:text-[hsl(var(--theme-text-primary))]`} />
              <p className={hintCls}>.txt, .md, .csv, .pdf or .docx, up to 5 MB. Scanned PDFs without text cannot be read.</p>
            </div>
          )}
          {mode === 'channel' && (
            <div>
              <label className={labelCls} htmlFor="knowledge-channel">Channel</label>
              <AppSelect id="knowledge-channel" value={String(channelId)} placeholder="Pick a channel"
                         onChange={(v) => setChannelId(v ? Number(v) : '')}
                         options={textChannels.map((c) => ({ value: String(c.id), label: `# ${c.name}` }))} />
              <p className={hintCls}>Copies the latest 300 messages. It does not follow new ones.</p>
            </div>
          )}
          <button type="button" className={btnPrimary} disabled={busy || !canAdd} onClick={() => void add()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Add to knowledge
          </button>
        </div>
      </div>

      <div>
        <h4 className={labelCls}>Sources ({sources?.length ?? 0})</h4>
        {sources === null && <p className={hintCls}>Loading…</p>}
        {sources?.length === 0 && (
          <p className="rounded-md border border-dashed border-[hsl(var(--theme-border-default))] p-4 text-sm text-[hsl(var(--theme-text-muted))]">
            Nothing yet. Add notes or a document so the agent can answer from them.
          </p>
        )}
        <ul className="space-y-2">
          {sources?.map((s) => {
            const Icon = ICONS[s.type];
            return (
              <li key={s.id} className={`${cardCls} flex items-center gap-3 px-3 py-2.5`} data-testid="knowledge-source">
                <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--theme-text-muted))]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[hsl(var(--theme-text-primary))]">{s.title}</div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                    {s.type} · {s.chunks} part{s.chunks === 1 ? '' : 's'} · {s.status}
                  </div>
                </div>
                <button type="button" className={btnGhost} onClick={() => void remove(s)} aria-label={`Remove ${s.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default AgentKnowledgePanel;
