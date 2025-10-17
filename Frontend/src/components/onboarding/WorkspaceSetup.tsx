import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { Plus, Users, ArrowRight, Loader } from "lucide-react";

interface WorkspaceSetupProps {
  onContinue: () => void;
  onBack: () => void;
}

export default function WorkspaceSetup({ onContinue, onBack }: WorkspaceSetupProps) {
  const { isDarkMode } = useTheme();
  const { createWorkspace, joinWorkspace } = useWorkspace();
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [isLoading, setIsLoading] = useState(false);

  // Create workspace form
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDesc, setWorkspaceDesc] = useState("");

  // Join workspace form
  const [inviteCode, setInviteCode] = useState("");

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    createWorkspace({
      name: workspaceName,
      description: workspaceDesc,
    });
    
    setIsLoading(false);
    onContinue();
  };

  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await joinWorkspace(inviteCode);
      onContinue();
    } catch (error) {
      alert("Invalid invite code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-2xl p-8 md:p-12 rounded-2xl shadow-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        
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
                Give your workspace a name and description
              </p>
            </div>

            <form onSubmit={handleCreateWorkspace} className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Workspace Name *
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g., Team AuraFlow, AI Dev Squad"
                  required
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  value={workspaceDesc}
                  onChange={(e) => setWorkspaceDesc(e.target.value)}
                  placeholder="What's your workspace about?"
                  rows={3}
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
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