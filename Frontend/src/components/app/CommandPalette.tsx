import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bot, Compass, Hash, Home, Keyboard, MessageSquare, Moon, Search, Settings, Sun, Users } from "lucide-react";
import { useRealtime } from "@/hooks/useRealtime";
import { useFriends } from "@/contexts/FriendsContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Icon } from "./Icon";

export const OPEN_SEARCH_EVENT = "auraflow:open-search";
export const OPEN_SHORTCUTS_EVENT = "auraflow:open-shortcuts";

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-[hsl(var(--theme-text-secondary))] data-[selected=true]:bg-[hsl(var(--theme-bg-active))] data-[selected=true]:text-foreground";
const headingClass = "px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2";

/**
 * Cmd/Ctrl+K "jump to" palette: channels of the current community, communities,
 * friends, pages and a few actions. Keyboard only works end to end (arrows,
 * Enter, Esc).
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { communities, currentCommunity, channels } = useRealtime();
  const { friends = [] } = useFriends();
  const { isDarkMode, toggleTheme } = useTheme();

  const run = (fn: () => void) => () => {
    onOpenChange(false);
    // Let the dialog unmount first so focus returns cleanly.
    setTimeout(fn, 0);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-black/60" />
        <DialogPrimitive.Content
          aria-label="Command palette"
          className="fixed left-1/2 top-[18%] z-[10001] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-popover"
        >
          <DialogPrimitive.Title className="sr-only">Jump to</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to find a channel, community, person or page. Use the arrow keys and Enter.
          </DialogPrimitive.Description>
          <Command label="Jump to" loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Icon icon={Search} size="md" className="text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Jump to a channel, person or page"
                className="h-11 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found.</Command.Empty>

              {currentCommunity && channels.length > 0 && (
                <Command.Group heading={`Channels in ${currentCommunity.name}`} className={headingClass}>
                  {channels.filter((c) => c.type !== "voice").map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`channel ${c.name}`}
                      onSelect={run(() => navigate(`/community/${currentCommunity.id}/channel/${c.id}`))}
                      className={itemClass}
                    >
                      <Icon icon={Hash} size="md" /> {c.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {communities.length > 0 && (
                <Command.Group heading="Communities" className={headingClass}>
                  {communities.map((c) => (
                    <Command.Item key={c.id} value={`community ${c.name}`} onSelect={run(() => navigate(`/community/${c.id}`))} className={itemClass}>
                      <Icon icon={Users} size="md" /> {c.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {friends.length > 0 && (
                <Command.Group heading="People" className={headingClass}>
                  {friends.filter((f) => f.public_id).map((f) => (
                    <Command.Item
                      key={f.id}
                      value={`message ${f.display_name} ${f.username}`}
                      onSelect={run(() => navigate(`/dm/${f.public_id}`))}
                      className={itemClass}
                    >
                      <Icon icon={MessageSquare} size="md" /> {f.display_name || f.username}
                      <span className="ml-auto text-xs text-muted-foreground">@{f.username}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Go to" className={headingClass}>
                <Command.Item value="home" onSelect={run(() => navigate("/"))} className={itemClass}><Icon icon={Home} size="md" /> Home</Command.Item>
                <Command.Item value="friends messages" onSelect={run(() => navigate("/friends"))} className={itemClass}><Icon icon={MessageSquare} size="md" /> Friends and messages</Command.Item>
                <Command.Item value="discover communities" onSelect={run(() => navigate("/discover"))} className={itemClass}><Icon icon={Compass} size="md" /> Discover communities</Command.Item>
                <Command.Item value="agents hub" onSelect={run(() => navigate("/agents"))} className={itemClass}><Icon icon={Bot} size="md" /> Agents</Command.Item>
                <Command.Item value="settings preferences" onSelect={run(() => navigate("/settings"))} className={itemClass}><Icon icon={Settings} size="md" /> Settings</Command.Item>
              </Command.Group>

              <Command.Group heading="Actions" className={headingClass}>
                <Command.Item value="search messages in this channel" onSelect={run(() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT)))} className={itemClass}>
                  <Icon icon={Search} size="md" /> Search messages in this channel
                </Command.Item>
                <Command.Item value="toggle theme dark light" onSelect={run(toggleTheme)} className={itemClass}>
                  <Icon icon={isDarkMode ? Sun : Moon} size="md" /> {isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
                </Command.Item>
                <Command.Item value="keyboard shortcuts help" onSelect={run(() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT)))} className={itemClass}>
                  <Icon icon={Keyboard} size="md" /> Keyboard shortcuts
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
