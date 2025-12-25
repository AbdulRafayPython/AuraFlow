import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import AIAgentPanel from "../ai-agents/AIAgentPanel";
import { useState } from "react";

interface RightSidebarProps {
  isCollapsed: boolean;
}

export default function RightSidebar({ isCollapsed }: RightSidebarProps) {
  const { isDarkMode } = useTheme();
  const [isAIAgentPanelOpen, setIsAIAgentPanelOpen] = useState(true);

  return (
    <div className={`relative flex flex-col transition-all duration-200 ${
      isCollapsed ? 'w-0 overflow-hidden' : 'w-80'
    } h-screen`}>
      {!isCollapsed && (
        <div className={`flex flex-col h-full ${
          isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
        } border-l shadow-xl overflow-hidden`}>
          <AIAgentPanel 
            isOpen={isAIAgentPanelOpen}
            onClose={() => setIsAIAgentPanelOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
