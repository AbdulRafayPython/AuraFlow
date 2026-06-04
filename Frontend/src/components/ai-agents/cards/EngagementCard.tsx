// Frontend/src/components/ai-agents/cards/EngagementCard.tsx
//
// Dispatcher for the structured engagement cards attached to message_type='ai'
// messages. Rendered as the body of AgentMessageShell in the channel message
// list. Falls back to plain text (handled by the caller) when no card is set.

import type { EngagementCard as EngagementCardData } from '@/types';
import PollCard from './PollCard';
import StarterCard from './StarterCard';
import IcebreakerCard from './IcebreakerCard';
import ChallengeCard from './ChallengeCard';

interface EngagementCardProps {
  card: EngagementCardData;
  /** Message id the card is attached to — poll voting is keyed on it. */
  messageId: number;
}

export default function EngagementCard({ card, messageId }: EngagementCardProps) {
  switch (card.kind) {
    case 'poll':
      return (
        <PollCard
          messageId={messageId}
          question={card.question}
          options={card.options}
        />
      );
    case 'starter':
      return <StarterCard text={card.text} />;
    case 'icebreaker':
      return (
        <IcebreakerCard
          title={card.title}
          description={card.description}
          questions={card.questions}
          example={card.example}
          duration={card.duration}
        />
      );
    case 'challenge':
      return (
        <ChallengeCard
          title={card.title}
          description={card.description}
          theme={card.theme}
          duration={card.duration}
        />
      );
    default:
      return null;
  }
}
