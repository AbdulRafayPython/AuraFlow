import * as React from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Compass, Home, MessageSquare, Plus } from "lucide-react";
import { cn, readableTextOn } from "@/lib/utils";
import { API_SERVER } from "@/config/api";
import { useFriends } from "@/contexts/FriendsContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useApprovals } from "@/hooks/useApprovals";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { channelService } from "@/services/channelService";
import { Icon } from "@/components/app/Icon";
import { NotificationButton } from "@/components/NotificationButton";
import CreateCommunityModal from "@/components/modals/CreateCommunityModal";
import { AccountMenu } from "./AccountMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CommunityFormData } from "./DirectsSidebar";

interface NavRailProps {
  currentView: string;
  selectedCommunity?: string;
  /** Raise toast alerts for pending approvals. Only one mounted rail should set this. */
  alerts?: boolean;
  /** A modal owned by a sibling panel is open: freeze the rail like the old sidebar did. */
  frozen?: boolean;
  /** Show the account avatar at the bottom; off when the sidebar's user panel is visible. */
  showAccount?: boolean;
  className?: string;
}

interface RailButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
  className?: string;
}

/** 40px rail button with tooltip, active indicator and aria-label. */
function RailButton({ label, active, onClick, badge, testId, children, className }: RailButtonProps) {
  return (
    <div className="relative flex w-full justify-center">
      {active && (
        <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-foreground" />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            data-testid={testId}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150",
              active
                ? "bg-[hsl(var(--theme-bg-active))] text-foreground"
                : "text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
              className,
            )}
          >
            {children}
            {badge}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function CountBadge({ count, testId, label }: { count: number; testId?: string; label?: string }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid={testId}
      aria-label={label}
      className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[hsl(var(--theme-sidebar-bg))] bg-[hsl(0_68%_46%)] px-1 text-xs font-semibold leading-none text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

/**
 * 56px workspace rail: Home, Friends & DMs, Discover, Agents, Notifications,
 * then the user's communities, "add community" and the profile menu.
 * The contextual 260px panel (channels or DMs) lives next to it.
 */
export default function NavRail({ currentView, selectedCommunity, alerts = true, frozen = false, showAccount = true, className }: NavRailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isDiscoverPage = location.pathname === "/discover";
  const isAgentsPage = location.pathname === "/agents" || location.pathname.startsWith("/agents/");
  const { approvals } = useApprovals({ alerts });
  const { pendingRequests } = useFriends();
  const { communities } = useRealtime();
  const { getCommunityUnread } = useUnreadCounts();

  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);

  const handleCreateCommunity = async (data: CommunityFormData) => {
    try {
      return await channelService.createCommunity(data);
    } catch (error) {
      console.error("Failed to create community:", error);
      throw error;
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex h-full w-rail shrink-0 flex-col items-center gap-1 border-r border-border py-3",
          frozen && "pointer-events-none",
          className,
        )}
        style={{ background: "var(--theme-sidebar-gradient)" }}
      >
        <RailButton label="Home" active={currentView === "home" && !isDiscoverPage} onClick={() => navigate("/")}>
          <Icon icon={Home} size="lg" filled={currentView === "home" && !isDiscoverPage} />
        </RailButton>

        <RailButton
          label={pendingRequests.length > 0 ? `Friends and messages (${pendingRequests.length} requests)` : "Friends and messages"}
          active={currentView === "friends" || currentView === "direct-message"}
          onClick={() => navigate("/friends")}
          badge={<CountBadge count={pendingRequests.length} />}
        >
          <Icon icon={MessageSquare} size="lg" filled={currentView === "friends" || currentView === "direct-message"} />
        </RailButton>

        <RailButton label="Discover communities" active={isDiscoverPage} onClick={() => navigate("/discover")}>
          <Icon icon={Compass} size="lg" />
        </RailButton>

        <RailButton
          label="Agents"
          active={isAgentsPage}
          onClick={() => navigate("/agents")}
          testId="nav-agents"
          badge={
            <CountBadge
              count={approvals.length}
              testId="approvals-badge"
              label={`${approvals.length} waiting for approval`}
            />
          }
        >
          <Icon icon={Bot} size="lg" />
        </RailButton>

        <NotificationButton
          placement="sidebar"
          onNavigate={(view) => {
            if (view === "friends") navigate("/friends");
            else if (view === "dm") navigate("/friends");
          }}
        />

        <div aria-hidden className="my-1 h-px w-8 bg-border" />

        {/* Communities */}
        <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto scrollbar-none py-1">
          {communities.map((community) => {
            const communityId = community.id.toString();
            const isSelected = selectedCommunity === communityId;
            const logoUrl = community.logo_url ? `${API_SERVER}${community.logo_url}` : null;
            const unread = getCommunityUnread(community.id);
            return (
              <RailButton
                key={community.id}
                label={community.name}
                active={isSelected}
                onClick={() => navigate(`/community/${communityId}`)}
                badge={!isSelected ? <CountBadge count={unread} /> : null}
                className="overflow-hidden text-sm font-semibold text-white"
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center bg-[hsl(var(--theme-bg-tertiary))] text-foreground"
                    style={community.color ? { backgroundColor: community.color, color: readableTextOn(community.color) } : undefined}
                  >
                    {community.icon || initialsOf(community.name)}
                  </span>
                )}
              </RailButton>
            );
          })}
        </div>

        <RailButton label="Create community" onClick={() => setShowCreateCommunityModal(true)}>
          <Icon icon={Plus} size="lg" />
        </RailButton>

        {showAccount && <AccountMenu variant="rail" />}
      </div>

      <CreateCommunityModal
        isOpen={showCreateCommunityModal}
        onClose={() => setShowCreateCommunityModal(false)}
        onCreateCommunity={handleCreateCommunity}
      />
    </>
  );
}
