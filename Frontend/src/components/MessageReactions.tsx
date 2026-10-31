import { Reaction } from "@/types";
import { cn } from "@/lib/utils";
import { ReactionPill } from "@/components/chat/ReactionPill";

interface MessageReactionsProps {
  reactions: Reaction[];
  onReactionClick: (emoji: string) => void;
  className?: string;
}

/** The row of reaction pills under a message. */
export default function MessageReactions({ reactions, onReactionClick, className }: MessageReactionsProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {reactions.map((reaction) => (
        <ReactionPill
          key={reaction.emoji}
          emoji={reaction.emoji}
          count={reaction.count}
          reacted={reaction.reacted_by_current_user}
          names={reaction.users.map((u) => u.display_name || u.username)}
          onClick={() => onReactionClick(reaction.emoji)}
        />
      ))}
    </div>
  );
}
