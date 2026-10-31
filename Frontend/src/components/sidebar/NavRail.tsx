import * as React from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Check, Compass, Home, LogOut, MessageSquare, Moon, Plus, Settings, Sun, User } from "lucide-react";
import { cn, getAvatarUrl, readableTextOn } from "@/lib/utils";
import { API_SERVER } from "@/config/api";
import { useTheme } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useApprovals } from "@/hooks/useApprovals";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import authService from "@/services/authService";
import { channelService } from "@/services/channelService";
import { statusService } from "@/services/statusService";
import { socket } from "@/socket";
import { Icon } from "@/components/app/Icon";
import { NotificationButton } from "@/components/NotificationButton";
import CreateCommunityModal from "@/components/modals/CreateCommunityModal";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CommunityFormData } from "./DirectsSidebar";

type PresenceStatus = "online" | "idle" | "dnd" | "offline";

const STATUS_DOT: Record<PresenceStatus, string> = {
  online: "bg-success",
  idle: "bg-warning",
  dnd: "bg-destructive",
  offline: "bg-muted-foreground",
};

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Invisible",
};

interface NavRailProps {
  currentView: string;
  selectedCommunity?: string;
  /** Raise toast alerts for pending approvals. Only one mounted rail should set this. */
  alerts?: boolean;
  /** A modal owned by a sibling panel is open: freeze the rail like the old sidebar did. */
  frozen?: boolean;
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
export default function NavRail({ currentView, selectedCommunity, alerts = true, frozen = false, className }: NavRailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isDiscoverPage = location.pathname === "/discover";
  const isAgentsPage = location.pathname === "/agents" || location.pathname.startsWith("/agents/");
  const { approvals } = useApprovals({ alerts });
  const { isDarkMode, toggleTheme } = useTheme();
  const { pendingRequests } = useFriends();
  const { logout } = useAuth();
  const { communities } = useRealtime();
  const { getCommunityUnread } = useUnreadCounts();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<PresenceStatus>("online");
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    authService
      .getMe()
      .then(setCurrentUser)
      .catch((error) => console.error("Failed to load user data:", error));
  }, []);

  const handleCreateCommunity = async (data: CommunityFormData) => {
    try {
      return await channelService.createCommunity(data);
    } catch (error) {
      console.error("Failed to create community:", error);
      throw error;
    }
  };

  const handleStatusChange = async (status: PresenceStatus) => {
    setUserStatus(status);
    try {
      await statusService.updateMyStatus({ status });
      socket.emit("update_custom_status", { status });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const confirmLogout = async () => {
    await logout();
    setShowLogoutDialog(false);
  };

  const displayName = currentUser?.display_name || currentUser?.username || "";

  const avatar = currentUser ? (
    currentUser.avatar_url ? (
      <img
        src={getAvatarUrl(currentUser.avatar_url, currentUser.username)}
        alt={displayName}
        className="h-full w-full rounded-full object-cover"
      />
    ) : (
      <span className="flex h-full w-full items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-sm font-semibold text-foreground">
        {initialsOf(displayName)}
      </span>
    )
  ) : null;

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

        {/* Profile */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="relative mt-1 h-9 w-9 rounded-full"
                >
                  {avatar}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--theme-sidebar-bg))]",
                      STATUS_DOT[userStatus],
                    )}
                  />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Account
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="end" sideOffset={12} className="z-[9999] w-64">
            {currentUser && (
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="h-9 w-9 shrink-0">{avatar}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">@{currentUser.username}</div>
                </div>
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Status</DropdownMenuLabel>
            {(Object.keys(STATUS_LABEL) as PresenceStatus[]).map((status) => (
              <DropdownMenuItem key={status} onClick={() => handleStatusChange(status)} className="gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />
                <span className="flex-1">{STATUS_LABEL[status]}</span>
                {userStatus === status && <Icon icon={Check} size="md" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
              <Icon icon={User} size="md" />
              My profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
              <Icon icon={Settings} size="md" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleTheme} className="gap-2">
              <Icon icon={isDarkMode ? Sun : Moon} size="md" />
              {isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="gap-2 text-destructive focus:text-destructive">
              <Icon icon={LogOut} size="md" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CreateCommunityModal
        isOpen={showCreateCommunityModal}
        onClose={() => setShowCreateCommunityModal(false)}
        onCreateCommunity={handleCreateCommunity}
      />
      <ConfirmDialog
        isOpen={showLogoutDialog}
        title="Log Out"
        description="Are you sure you want to log out? You'll need to sign in again to access your account."
        cancelText="Cancel"
        confirmText="Log Out"
        isDangerous={true}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </>
  );
}
