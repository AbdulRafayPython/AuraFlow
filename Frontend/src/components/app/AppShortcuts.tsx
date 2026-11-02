import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useRealtime } from "@/hooks/useRealtime";
import { adjacentChannel, isTypingTarget } from "@/lib/shortcuts";
import { CommandPalette, OPEN_PALETTE_EVENT, OPEN_SHORTCUTS_EVENT } from "./CommandPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";

/**
 * Global keyboard shortcuts for the signed-in app: Cmd/Ctrl+K palette, "?" help,
 * Alt+Up/Down to move between channels. Mount once inside the router.
 */
export default function AppShortcuts() {
  const navigate = useNavigate();
  const { currentCommunity, channels, currentChannel } = useRealtime();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && currentCommunity) {
        const ids = channels.filter((c) => c.type !== "voice").map((c) => c.id);
        const next = adjacentChannel(ids, currentChannel?.id, e.key === "ArrowDown" ? 1 : -1);
        if (next != null) {
          e.preventDefault();
          navigate(`/community/${currentCommunity.id}/channel/${next}`);
        }
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
    };
    const openHelp = () => setHelpOpen(true);
    const openPalette = () => setPaletteOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette);
    };
  }, [navigate, currentCommunity, channels, currentChannel?.id]);

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
