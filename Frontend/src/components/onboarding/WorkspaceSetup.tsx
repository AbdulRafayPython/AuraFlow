import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { Plus, Users, ArrowRight, Loader } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";

interface WorkspaceSetupProps {
  onContinue: () => void;
  onBack: () => void;
}

const PRESET_COLORS = [
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#8B5A3C', // Brown
];

export default function WorkspaceSetup({ onContinue, onBack }: WorkspaceSetupProps) {
  const { isDarkMode } = useTheme();
  const { createWorkspace } = useWorkspace();
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [isLoading, setIsLoading] = useState(false);

  // Create workspace form
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDesc, setWorkspaceDesc] = useState("");
  const [workspaceIcon, setWorkspaceIcon] = useState("WS");
  const [workspaceColor, setWorkspaceColor] = useState("#8B5CF6");

  // Join workspace form
  const [inviteCode, setInviteCode] = useState("");
  
  const { showSuccess, showError, showWarning } = useNotifications();

  const generateIcon = (name: string) => {
    if (name.length >= 2) {
      const words = name.trim().split(" ");
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    return "WS";
  };

  const handleNameChange = (value: string) => {
    setWorkspaceName(value);
    const newIcon = generateIcon(value);
    setWorkspaceIcon(newIcon);
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await createWorkspace({
        name: workspaceName,
        description: workspaceDesc,
        icon: workspaceIcon,
        color: workspaceColor,
      });
      
      setWorkspaceName("");
      setWorkspaceDesc("");
      setWorkspaceIcon("WS");
      setWorkspaceColor("#8B5CF6");
      onContinue();
    } catch (error) {
      console.error("Failed to create workspace:", error);
      showError({
        title: "Failed to Create Workspace",
        description: "Please check your input and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      showWarning({
        title: "Coming Soon",
        description: "The join workspace feature will be available soon!",
      });
      setTimeout(() => onContinue(), 500);
    } catch (error) {
      showError({
        title: "Invalid Code",
        description: "The invite code is invalid. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-2xl p-8 md:p-12 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        
        {/* Choice Mode */}
        {mode === "choice" && (
          <>
            <div className="text-center mb-10">
              <h1 className={`text-3xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Create or Join Workspace
              </h1>
              <p className={`text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Choose how you want to get started with AuraFlow
              </p>
            </div>

            <div className="space-y-4 mb-10">
              {/* Create New Workspace */}
              <button
                onClick={() => setMode("create")}
                className={`w-full p-6 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                  isDarkMode 
                    ? 'border-slate-600 hover:border-blue-500 bg-slate-700' 
                    : 'border-gray-200 hover:border-blue-500 bg-white hover:shadow-lg'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Plus className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className={`text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Create a New Workspace
                    </h3>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Start fresh with your own team workspace
                    </p>
                  </div>
                  <ArrowRight className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} />
                </div>
              </button>

              {/* Join Existing Workspace */}
              <button
                onClick={() => setMode("join")}
                className={`w-full p-6 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                  isDarkMode 
                    ? 'border-slate-600 hover:border-blue-500 bg-slate-700' 
                    : 'border-gray-200 hover:border-blue-500 bg-white hover:shadow-lg'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className={`text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Join an Existing Workspace
                    </h3>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Use an invite code to join your team
                    </p>
                  </div>
                  <ArrowRight className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} />
                </div>
              </button>
            </div>

            <p className={`text-center text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              You can create or join more workspaces anytime
            </p>
          </>
        )}

        {/* Create Workspace Form */}
        {mode === "create" && (
          <>
            <button
              onClick={() => setMode("choice")}
              className={`mb-6 text-sm ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              ← Back
            </button>
            
            <div className="mb-8">
              <h1 className={`text-3xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Create Your Workspace
              </h1>
              <p className={`text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Customize your workspace with name, icon, and color
              </p>
            </div>

            {/* Icon Preview */}
            <div className="flex justify-center mb-8">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center font-bold text-2xl text-white shadow-2xl"
                style={{ backgroundColor: workspaceColor }}
              >
                {workspaceIcon}
              </div>
            </div>

            <form onSubmit={handleCreateWorkspace} className="space-y-6">
              {/* Workspace Name */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Workspace Name *
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Python Experts, AI Dev Squad"
                  required
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  value={workspaceDesc}
                  onChange={(e) => setWorkspaceDesc(e.target.value)}
                  placeholder="What's your workspace about?"
                  rows={2}
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              {/* Icon Input */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Custom Icon (Optional, max 2 characters)
                </label>
                <input
                  type="text"
                  value={workspaceIcon}
                  onChange={(e) => setWorkspaceIcon(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="WS"
                  maxLength={2}
                  className={`w-full px-4 py-3 rounded-lg border text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              {/* Color Picker */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Workspace Color
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setWorkspaceColor(color)}
                      className={`w-10 h-10 rounded-lg transition-all ${
                        workspaceColor === color ? 'ring-2 ring-offset-2 ring-white scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !workspaceName.trim()}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Workspace →"
                )}
              </button>
            </form>
          </>
        )}

        {/* Join Workspace Form */}
        {mode === "join" && (
          <>
            <button
              onClick={() => setMode("choice")}
              className={`mb-6 text-sm ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              ← Back
            </button>
            
            <div className="mb-8">
              <h1 className={`text-3xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Join a Workspace
              </h1>
              <p className={`text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Enter the invite code or workspace link
              </p>
            </div>

            <form onSubmit={handleJoinWorkspace} className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Invite Code *
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="e.g., AURA-1234-5678"
                  required
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !inviteCode.trim()}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Joining...
                  </>
                ) : (
                  "Join Workspace →"
                )}
              </button>
            </form>
          </>
        )}

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <div className={`w-8 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
          <div className="w-8 h-1.5 bg-blue-600 rounded-full"></div>
          <div className={`w-8 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
        </div>
        <p className={`text-center text-xs mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Step 2 of 3
        </p>
      </div>
    </div>
  );
}