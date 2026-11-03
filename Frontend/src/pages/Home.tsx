import { useCallback, useState } from 'react';
import { ChevronRight, Compass, Plus, UserRound, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/use-toast';
import CreateCommunityModal, { type CommunityFormData } from '@/components/modals/CreateCommunityModal';
import { PageHeader } from '@/components/app/PageHeader';
import { Section } from '@/components/app/Section';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { channelService } from '@/services/channelService';
import { API_SERVER } from '@/config/api';
import { readableTextOn } from '@/lib/utils';
import type { Community } from '@/types';


function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function CommunityRow({ community, onOpen }: { community: Community; onOpen: () => void }) {
  const logo = community.logo_url
    ? (/^https?:\/\//i.test(community.logo_url) ? community.logo_url : `${API_SERVER}${community.logo_url}`)
    : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-3 text-left transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))]"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-sm font-semibold"
        style={!logo ? { backgroundColor: community.color || 'hsl(var(--theme-accent-primary))', color: community.color ? readableTextOn(community.color) : '#fff' } : undefined}
      >
        {logo ? <img src={logo} alt="" loading="lazy" className="h-full w-full object-cover" /> : (community.icon || community.name.slice(0, 2).toUpperCase())}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-foreground">{community.display_name || community.name}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {community.description?.trim() || (typeof community.member_count === 'number'
            ? `${community.member_count} ${community.member_count === 1 ? 'member' : 'members'}`
            : 'Open community')}
        </span>
      </span>
      <Icon icon={ChevronRight} size="md" className="text-muted-foreground" />
    </button>
  );
}

function ActionCard({ icon, title, hint, onClick }: { icon: typeof Compass; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-4 text-left transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-accent))]">
        <Icon icon={icon} size="lg" />
      </span>
      <span className="text-base font-semibold text-foreground">{title}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
    </button>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { communities } = useRealtime();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleCreateCommunity = useCallback(async (data: CommunityFormData): Promise<Community> => {
    try {
      setApiError(null);
      const community = await channelService.createCommunity(data);
      toast({ title: 'Community created' });
      return community;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create community';
      setApiError(message);
      toast({ title: 'Could not create community', description: message, variant: 'destructive' });
      throw error;
    }
  }, [toast]);

  const firstName = (user?.display_name || user?.username || 'there').trim().split(/\s+/)[0];

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        title="Home"
        className="pl-16 md:pl-4"
        actions={
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Icon icon={Plus} size="md" /> Create community
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-24 sm:px-6 md:pb-8">
          <h1 className="text-2xl font-semibold text-foreground">{greeting()}, {firstName}</h1>
          <p className="mt-1 text-base text-muted-foreground">Your communities and people, in one place.</p>

          {apiError && <div className="mt-4"><ErrorState message={apiError} /></div>}

          <Section title={`Your communities (${communities.length})`} className="mt-6">
            {communities.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {communities.map((community) => (
                  <CommunityRow key={community.id} community={community} onOpen={() => navigate(`/community/${community.id}`)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="Find your first community"
                description="Join one that feels like yours, or create one for your people."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => navigate('/discover')} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                      Explore communities
                    </button>
                    <button type="button" onClick={() => setShowCreateModal(true)} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))]">
                      Create one
                    </button>
                  </div>
                }
              />
            )}
          </Section>

          <Section title="Get started">
            <div className="grid gap-2 sm:grid-cols-3">
              <ActionCard icon={Compass} title="Explore communities" hint="Find a place to belong" onClick={() => navigate('/discover')} />
              <ActionCard icon={UserRound} title="Find your friends" hint="Message the people you know" onClick={() => navigate('/friends')} />
              <ActionCard icon={Plus} title="Create a community" hint="Start a space for your group" onClick={() => setShowCreateModal(true)} />
            </div>
          </Section>
        </div>
      </main>

      <CreateCommunityModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreateCommunity={handleCreateCommunity} />
    </div>
  );
}
