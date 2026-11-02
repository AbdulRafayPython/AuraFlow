import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Headphones, HeadphoneOff, LogOut, Mic, MicOff, Moon, Settings, Sun, User } from "lucide-react";
import { cn, getAvatarUrl } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import authService from "@/services/authService";
import { statusService } from "@/services/statusService";
import { socket } from "@/socket";
import { Icon } from "@/components/app/Icon";
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

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

function PanelIconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
            active ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The signed-in user's avatar, status and account menu (status, profile,
 * settings, theme, log out).
 * - `panel`: Discord-style user panel at the bottom of the sidebar, with
 *   voice mute/deafen (while in a voice channel) and a settings button.
 * - `rail`: just the avatar, for pages that have no sidebar.
 */
export function AccountMenu({ variant }: { variant: "panel" | "rail" }) {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { isInVoiceChannel, isAudioEnabled, isDeafened, toggleAudio, toggleDeaf } = useVoice();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<PresenceStatus>("online");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    authService
      .getMe()
      .then((me: any) => {
        setCurrentUser(me);
        if (me?.status && me.status in STATUS_DOT) setUserStatus(me.status);
      })
      .catch((error) => console.error("Failed to load user data:", error));
  }, []);

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
  const statusText = currentUser?.custom_status || STATUS_LABEL[userStatus];

  const avatar = (size: string) => (
    <span className={cn("relative block shrink-0", size)}>
      {currentUser?.avatar_url ? (
        <img
          src={getAvatarUrl(currentUser.avatar_url, currentUser.username)}
          alt=""
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-sm font-semibold text-foreground">
          {initialsOf(displayName)}
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[hsl(var(--theme-sidebar-bg))]",
          STATUS_DOT[userStatus],
        )}
      />
    </span>
  );

  const menu = (
    <DropdownMenuContent
      side={variant === "rail" ? "right" : "top"}
      align={variant === "rail" ? "end" : "start"}
      sideOffset={variant === "rail" ? 12 : 8}
      className="z-[9999] w-64"
    >
      {currentUser && (
        <div className="flex items-center gap-3 px-2 py-2">
          {avatar("h-9 w-9")}
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
  );

  return (
    <>
      {variant === "rail" ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className="relative mt-1 h-9 w-9 rounded-full">
                  {currentUser && avatar("h-9 w-9")}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Account
            </TooltipContent>
          </Tooltip>
          {menu}
        </DropdownMenu>
      ) : (
        <section
          aria-label="User area"
          className="flex h-[52px] shrink-0 items-center gap-1 border-t border-border bg-[hsl(var(--theme-bg-secondary))] px-2"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
              >
                {currentUser ? avatar("h-8 w-8") : <span className="h-8 w-8 shrink-0 rounded-full bg-[hsl(var(--theme-bg-tertiary))]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{statusText}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
          {isInVoiceChannel && (
            <>
              <PanelIconButton label={isAudioEnabled ? "Mute" : "Unmute"} onClick={toggleAudio} active={!isAudioEnabled}>
                <Icon icon={isAudioEnabled ? Mic : MicOff} size="md" />
              </PanelIconButton>
              <PanelIconButton label={isDeafened ? "Undeafen" : "Deafen"} onClick={toggleDeaf} active={isDeafened}>
                <Icon icon={isDeafened ? HeadphoneOff : Headphones} size="md" />
              </PanelIconButton>
            </>
          )}
          <PanelIconButton label="User settings" onClick={() => navigate("/settings")}>
            <Icon icon={Settings} size="md" />
          </PanelIconButton>
        </section>
      )}

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

export default AccountMenu;
