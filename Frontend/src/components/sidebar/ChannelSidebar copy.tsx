import React, { useState } from "react";
import { ChevronDown, Hash, Settings, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";

interface Workspace {
  id: string; 
  name: string;
}

interface Agent {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

interface ChannelSidebarProps {
  onNavigate?: (view: string) => void;
}

const workspaces: Workspace[] = [
  { id: "1", name: "community" },
  { id: "2", name: "projects" },
  { id: "3", name: "ai-lab" },
];

const agents: Agent[] = [
  { id: "1", name: "Summarizer", icon: "○", active: false },
  { id: "2", name: "Mood Tracker", icon: "◐", active: true },
  { id: "3", name: "Wellness", icon: "◑", active: false },
  { id: "4", name: "Engagement", icon: "○", active: false },
];

export default function ChannelSidebar({ onNavigate }: ChannelSidebarProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [expandedSections, setExpandedSections] = useState({
    workspaces: true,
    agents: true,
    settings: false, // Removed from UI but keeping state for consistency
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div className={`flex flex-col h-full w-full ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Logo Header */}
      <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2.5">
          {/* <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-base">
            {workspaces[0].name.charAt(0).toUpperCase()}
          </div> */}
          <h1 className="text-base font-semibold">{workspaces[0].name.toUpperCase()}</h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Workspaces Section */}
        <div className="mb-4">
          <button
            onClick={() => toggleSection("workspaces")}
            className={`flex items-center gap-1.5 w-full px-1.5 py-1 text-xs font-semibold uppercase tracking-wide ${
              isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-gray-600 hover:text-gray-800'
            } transition-colors`}
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${!expandedSections.workspaces ? "-rotate-90" : ""}`}
            />
            Workspaces
          </button>
          {expandedSections.workspaces && (
            <div className="mt-0.5 space-y-0.5">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => onNavigate?.("dashboard")}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                    isDarkMode 
                      ? 'text-slate-300 hover:bg-slate-700 hover:text-slate-100' 
                      : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                  } transition-colors`}
                >
                  <Hash className="w-3.5 h-3.5 text-gray-500" />
                  {workspace.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Agents Section */}
        <div className="mb-4">
          <button
            onClick={() => toggleSection("agents")}
            className={`flex items-center gap-1.5 w-full px-1.5 py-1 text-xs font-semibold uppercase tracking-wide ${
              isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-gray-600 hover:text-gray-800'
            } transition-colors`}
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${!expandedSections.agents ? "-rotate-90" : ""}`}
            />
            AI Agents
          </button>
          {expandedSections.agents && (
            <div className="mt-0.5 space-y-0.5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${
                    agent.active
                      ? isDarkMode ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-900'
                      : isDarkMode ? 'text-slate-300 hover:bg-slate-700 hover:text-slate-100' : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base">{agent.icon}</span>
                  {agent.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}