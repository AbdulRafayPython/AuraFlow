import * as React from "react";
import { cn, getAvatarUrl } from "@/lib/utils";
import { usePresence, type Presence } from "@/hooks/usePresence";
import { useCommunityMembers } from "@/hooks/useCommunityMembers";
import { useMentionableAgents } from "@/hooks/useMentionableAgents";
import { useOpenAgent } from "@/components/ai-agents/AgentDetailPane";
import AgentLogo from "@/components/ai-agents/AgentLogo";
import { SidebarListSkeleton } from "@/components/chat/MessageListSkeleton";
import type { CommunityMember } from "@/types";

export const PRESENCE_DOT: Record<Presence, string> = {
  online: "bg-success",
  idle: "bg-warning",
  dnd: "bg-destructive",
  offline: "bg-muted-foreground",
};

const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

const ROLE_LABEL: Record<CommunityMember["role"], string> = {
  owner: "Owner",
  admin: "Admins",
  member: "Members",
};

interface MemberListProps {
  communityId?: string;
  /** Open a person's profile (anchored to the clicked row). */
  onSelectMember?: (username: string, rect: DOMRect) => void;
  className?: string;
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground first:pt-1">
      {label} — {count}
    </h3>
  );
}

function MemberRow({
  member,
  presence,
  onSelect,
}: {
  member: CommunityMember;
  presence: Presence;
  onSelect?: (username: string, rect: DOMRect) => void;
}) {
  const name = member.display_name || member.username;
  const offline = presence === "offline";
  return (
    <button
      type="button"
      role="listitem"
      onClick={(e) => onSelect?.(member.username, e.currentTarget.getBoundingClientRect())}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))]",
        offline && "opacity-50 hover:opacity-100",
      )}
    >
      <span className="relative h-8 w-8 shrink-0">
        <img src={getAvatarUrl(member.avatar_url, member.username)} alt="" className="h-8 w-8 rounded-full object-cover" />
        <span
          aria-label={PRESENCE_LABEL[presence]}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[hsl(var(--theme-sidebar-bg))]",
            PRESENCE_DOT[presence],
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        {member.custom_status && (
          <span className="block truncate text-xs text-muted-foreground">{member.custom_status}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Discord-style member column: admins first, then the community's agents,
 * then everyone else split by online / offline. Presence is live from the
 * `user_status` socket event, falling back to the persisted status.
 */
export function MemberList({ communityId, onSelectMember, className }: MemberListProps) {
  const { members, loading } = useCommunityMembers(communityId);
  const presence = usePresence();
  const agents = useMentionableAgents(communityId);
  const openAgent = useOpenAgent();

  const presenceOf = React.useCallback(
    (m: CommunityMember): Presence => presence(m.username, m.id, m.status),
    [presence],
  );

  const groups = React.useMemo(() => {
    const people = members.filter((m) => !m.is_bot);
    const staff = people.filter((m) => m.role === "owner" || m.role === "admin");
    const rest = people.filter((m) => m.role === "member");
    const byName = (a: CommunityMember, b: CommunityMember) =>
      (a.display_name || a.username).localeCompare(b.display_name || b.username);
    return {
      owner: staff.filter((m) => m.role === "owner").sort(byName),
      admin: staff.filter((m) => m.role === "admin").sort(byName),
      online: rest.filter((m) => presenceOf(m) !== "offline").sort(byName),
      offline: rest.filter((m) => presenceOf(m) === "offline").sort(byName),
    };
  }, [members, presenceOf]);

  const section = (label: string, list: CommunityMember[]) =>
    list.length > 0 && (
      <div key={label} role="list" aria-label={label}>
        <GroupHeading label={label} count={list.length} />
        {list.map((m) => (
          <MemberRow key={m.id} member={m} presence={presenceOf(m)} onSelect={onSelectMember} />
        ))}
      </div>
    );

  return (
    <aside
      aria-label="Members"
      className={cn("flex w-members shrink-0 flex-col overflow-y-auto border-l border-border px-2 py-3", className)}
      style={{ background: "var(--theme-sidebar-gradient)" }}
    >
      {loading && members.length === 0 ? (
        <SidebarListSkeleton rows={6} />
      ) : (
        <>
          {section(ROLE_LABEL.owner, groups.owner)}
          {section(ROLE_LABEL.admin, groups.admin)}
          {agents.length > 0 && (
            <div role="list" aria-label="Agents">
              <GroupHeading label="Agents" count={agents.length} />
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  role="listitem"
                  onClick={() => openAgent(agent)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))]"
                >
                  <AgentLogo size="sm" avatarUrl={agent.avatar_url} name={agent.name} username={agent.username} builtin={agent.builtin} />
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
                    <span className="shrink-0 rounded bg-[hsl(var(--theme-bg-tertiary))] px-1 text-xs font-semibold text-muted-foreground">APP</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {section("Online", groups.online)}
          {section("Offline", groups.offline)}
        </>
      )}
    </aside>
  );
}

export default MemberList;
