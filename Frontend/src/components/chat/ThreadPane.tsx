import { CornerDownRight } from "lucide-react";
import { Icon } from "@/components/app/Icon";
import { MessageRow } from "./MessageRow";

export interface ThreadMessage {
  id: number;
  authorName: string;
  avatarUrl?: string | null;
  username?: string;
  timeLabel: string;
  content: string;
  /** File name when the message is an attachment. */
  attachmentName?: string;
}

interface ThreadPaneProps {
  parent: ThreadMessage;
  replies: ThreadMessage[];
  /** Start a reply to the parent in the composer. */
  onReply: () => void;
  /** Scroll the main list to a message. */
  onJump: (id: number) => void;
}

const body = (m: ThreadMessage) => (
  <>
    {m.content && <span className="whitespace-pre-wrap">{m.content}</span>}
    {m.attachmentName && <span className="text-sm text-muted-foreground"> [{m.attachmentName}]</span>}
  </>
);

/** Right-pane view of a message and the replies loaded for it. */
export function ThreadPane({ parent, replies, onReply, onJump }: ThreadPaneProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border py-2">
        <MessageRow
          authorName={parent.authorName}
          avatarUrl={parent.avatarUrl}
          username={parent.username}
          timeLabel={parent.timeLabel}
          className="mt-0 hover:bg-transparent"
        >
          {body(parent)}
        </MessageRow>
        <div className="px-4 pt-1 text-right">
          <button
            type="button"
            onClick={() => onJump(parent.id)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Show in channel
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground">
        <Icon icon={CornerDownRight} size="sm" />
        {replies.length} {replies.length === 1 ? "reply" : "replies"}
      </div>

      <div role="log" aria-label="Replies" className="min-h-0 flex-1 overflow-y-auto pb-4">
        {replies.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No replies yet. Be the first to answer.</p>
        ) : (
          replies.map((r) => (
            <MessageRow
              key={r.id}
              authorName={r.authorName}
              avatarUrl={r.avatarUrl}
              username={r.username}
              timeLabel={r.timeLabel}
              onAuthorClick={() => onJump(r.id)}
            >
              {body(r)}
            </MessageRow>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onReply}
          className="h-8 w-full rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-3 text-left text-sm text-muted-foreground transition-colors hover:border-[hsl(var(--theme-border-hover))]"
        >
          Reply…
        </button>
      </div>
    </div>
  );
}
