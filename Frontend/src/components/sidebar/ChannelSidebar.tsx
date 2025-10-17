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

export default function ChannelSidebar() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [expandedSections, setExpandedSections] = useState({
    workspaces: true,
    agents: true,
    settings: true,
  });
  const [showSettings, setShowSettings] = useState(false);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
    }
  };

  return (
    <div className={`flex flex-col h-full w-full ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Logo Header */}
      <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-base">
            A
          </div>
          <h1 className="text-base font-semibold">AuraFlow</h1>
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

        {/* Settings Section */}
        <div>
          <button
            onClick={() => toggleSection("settings")}
            className={`flex items-center gap-1.5 w-full px-1.5 py-1 text-xs font-semibold uppercase tracking-wide ${
              isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-gray-600 hover:text-gray-800'
            } transition-colors`}
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${!expandedSections.settings ? "-rotate-90" : ""}`}
            />
            Settings
          </button>
          {expandedSections.settings && (
            <div className="mt-0.5 space-y-0.5">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                  isDarkMode 
                    ? 'text-slate-300 hover:bg-slate-700 hover:text-slate-100' 
                    : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                } transition-colors`}
              >
                <Settings className="w-3.5 h-3.5" />
                Preferences
              </button>
              {showSettings && (
                <div className={`ml-6 px-2 py-2 rounded text-sm ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                  {/* Dark Mode Toggle */}
                  <button
                    onClick={toggleTheme}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded mb-1 ${
                      isDarkMode ? 'hover:bg-slate-600' : 'hover:bg-gray-300'
                    } transition-colors`}
                  >
                    <span className="text-sm">Dark Mode</span>
                    <div className="flex items-center gap-2">
                      {isDarkMode ? (
                        <Moon className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Sun className="w-4 h-4 text-yellow-500" />
                      )}
                      <div className={`w-10 h-5 rounded-full transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-gray-400'} relative`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                  </button>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded ${
                      isDarkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'
                    } transition-colors`}
                  >
                    <span className="text-sm">Logout</span>
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}