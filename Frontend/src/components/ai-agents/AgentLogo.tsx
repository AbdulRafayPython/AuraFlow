import { cn, getAvatarUrl } from '@/lib/utils';
import { agentIconKey, agentIconSrc, type AgentIconInput } from '@/lib/agentIcons';

const SIZES = { xs: 'h-5 w-5 rounded', sm: 'h-8 w-8 rounded-md', md: 'h-9 w-9 rounded-lg', lg: 'h-12 w-12 rounded-lg', xl: 'h-24 w-24 rounded-xl' } as const;

interface AgentLogoProps extends AgentIconInput {
  size?: keyof typeof SIZES;
  /** An uploaded avatar wins over the generated logo. */
  avatarUrl?: string | null;
  className?: string;
}

/** The agent's app logo: its own avatar if it has one, otherwise a matching AuraFlow logo. */
export default function AgentLogo({ size = 'md', avatarUrl, className, ...input }: AgentLogoProps) {
  const src = avatarUrl ? getAvatarUrl(avatarUrl, input.username || input.name || 'agent') : agentIconSrc(agentIconKey(input));
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      draggable={false}
      className={cn('shrink-0 object-cover', SIZES[size], className)}
    />
  );
}
