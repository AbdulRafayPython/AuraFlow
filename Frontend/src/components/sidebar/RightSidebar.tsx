import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import AIAgentPanel from "../ai-agents/AIAgentPanel";
import { useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

interface RightSidebarProps {
  isCollapsed: boolean;
}

export default function RightSidebar({ isCollapsed }: RightSidebarProps) {
  const { currentTheme } = useTheme();
  const { currentCommunity } = useRealtime();
  const [isAIAgentPanelOpen, setIsAIAgentPanelOpen] = useState(true);

  // Don't show AI agents if no community is selected
  if (!currentCommunity) {
    return null;
  }

  return (
    <div className={`relative flex flex-col transition-all duration-300 ${
      isCollapsed ? 'w-0 overflow-hidden' : 'w-80'
    } h-screen`}>
      {!isCollapsed && (
        <div 
          className="flex flex-col h-full border-l border-[hsl(var(--theme-border-default)/0.3)] overflow-hidden transition-colors duration-300 relative backdrop-blur-sm"
          style={{ background: 'hsl(var(--theme-bg-primary) / 0.5)' }}
        >
          {/* Gradient overlay for depth - hidden for basic/onyx themes */}
          {currentTheme !== 'basic' && currentTheme !== 'onyx' && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 70% 30%, hsl(var(--theme-accent-secondary) / 0.03) 0%, transparent 60%)',
              }}
            />
          )}
          {/* Left edge gradient for blending effect - hidden for basic/onyx themes */}
          {currentTheme !== 'basic' && currentTheme !== 'onyx' && (
            <div 
              className="absolute left-0 top-0 w-6 h-full pointer-events-none z-10"
              style={{
                background: 'linear-gradient(90deg, hsl(var(--theme-bg-primary) / 0.5) 0%, transparent 100%)'
              }}
            />
          )}
          <AIAgentPanel 
            isOpen={isAIAgentPanelOpen}
            onClose={() => setIsAIAgentPanelOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
