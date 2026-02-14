import { useState, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { Plus, Users, ArrowRight, Loader, ArrowLeft, Building2, Search, UserPlus, Hash } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Community } from "@/types";
import { API_SERVER } from "@/config/api";

interface WorkspaceSetupProps {
  onContinue: () => void;
  onBack: () => void;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#0ea5e9', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
];

export default function WorkspaceSetup({ onContinue, onBack }: WorkspaceSetupProps) {
  const { isDarkMode } = useTheme();
  const { createWorkspace, discoverCommunities, joinCommunity } = useWorkspace();
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [isLoading, setIsLoading] = useState(false);

  // Create workspace form
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDesc, setWorkspaceDesc] = useState("");
  const [workspaceIcon, setWorkspaceIcon] = useState("WS");
  const [workspaceColor, setWorkspaceColor] = useState("#6366f1");

  // Join workspace state
  const [searchQuery, setSearchQuery] = useState("");
  const [availableCommunities, setAvailableCommunities] = useState<Community[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  
  const { showError, showSuccess } = useNotifications();

  // Load available communities when entering join mode
  useEffect(() => {
    if (mode === "join") {
      loadCommunities();
    }
  }, [mode]);

  // Debounced search
  useEffect(() => {
    if (mode !== "join") return;
    
    const timer = setTimeout(() => {
      loadCommunities(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadCommunities = async (search: string = "") => {
    setIsSearching(true);
    try {
      const communities = await discoverCommunities(search, 10, 0);
      setAvailableCommunities(communities);
    } catch (error) {
      console.error("Failed to load communities:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const getCommunityLogoUrl = (community: Community) => {
    if (!community.logo_url) return null;
    return `${API_SERVER}${community.logo_url}`;
  };

  const getCommunityBannerUrl = (community: Community) => {
    if (!community.banner_url) return null;
    return `${API_SERVER}${community.banner_url}`;
  };

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
    setWorkspaceIcon(generateIcon(value));
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
      setWorkspaceColor("#6366f1");
      showSuccess({
        title: "Workspace Created",
        description: "Your workspace has been created successfully!",
      });
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

  const handleJoinCommunity = async (community: Community) => {
    setJoiningId(community.id);
    try {
      await joinCommunity(community.id);
      showSuccess({
        title: "Joined Successfully!",
        description: `You've joined ${community.name}`,
      });
      onContinue();
    } catch (error: any) {
      console.error("Failed to join community:", error);
      showError({
        title: "Failed to Join",
        description: error.message || "Could not join this workspace. Please try again.",
      });
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className={`w-full max-w-lg rounded-2xl shadow-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        
        {/* Choice Mode */}
        {mode === "choice" && (
          <>
            {/* Header */}
            <div className={`p-6 pb-4 text-center border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl mb-4 shadow-lg shadow-indigo-500/25">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <h1 className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Set Up Workspace
              </h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Create or join a workspace
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="space-y-3 mb-5">
                {/* Create New */}
                <button
                  onClick={() => setMode("create")}
                  className={`w-full p-4 rounded-lg border transition-all hover:border-indigo-500 ${
                    isDarkMode 
                      ? 'border-slate-600 bg-slate-700/50 hover:bg-slate-700' 
                      : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Plus className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Create New Workspace
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Start fresh with your team
                      </p>
                    </div>
                    <ArrowRight className={`w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                  </div>
                </button>

                {/* Join Existing */}
                <button
                  onClick={() => setMode("join")}
                  className={`w-full p-4 rounded-lg border transition-all hover:border-purple-500 ${
                    isDarkMode 
                      ? 'border-slate-600 bg-slate-700/50 hover:bg-slate-700' 
                      : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Join Existing Workspace
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Browse available communities
                      </p>
                    </div>
                    <ArrowRight className={`w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                  </div>
                </button>
              </div>

              <p className={`text-center text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                You can create or join more workspaces later
              </p>
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center justify-center gap-2">
                <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                <div className="w-8 h-1 bg-indigo-600 rounded-full"></div>
                <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
              </div>
              <p className={`text-center text-[10px] mt-2 font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                STEP 2 OF 3
              </p>
            </div>
          </>
        )}

        {/* Create Workspace Form */}
        {mode === "create" && (
          <>
            {/* Header */}
            <div className={`p-6 pb-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                onClick={() => setMode("choice")}
                className={`flex items-center gap-1 text-xs mb-3 ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <h1 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Create Workspace
              </h1>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Set up your team's workspace
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Icon Preview */}
              <div className="flex justify-center mb-5">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-lg"
                  style={{ backgroundColor: workspaceColor }}
                >
                  {workspaceIcon}
                </div>
              </div>

              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                {/* Workspace Name */}
                <div>
                  <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Workspace Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g., Python Experts"
                    required
                    className={`w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDarkMode 
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' 
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Description <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={workspaceDesc}
                    onChange={(e) => setWorkspaceDesc(e.target.value)}
                    placeholder="What's this workspace about?"
                    className={`w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDarkMode 
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' 
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>

                {/* Color Picker */}
                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Color
                  </label>
                  <div className="flex gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setWorkspaceColor(color)}
                        className={`w-8 h-8 rounded-lg transition-all ${
                          workspaceColor === color ? 'ring-2 ring-offset-2 ring-white scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !workspaceName.trim()}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Workspace
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Join Workspace - Browse Communities */}
        {mode === "join" && (
          <>
            {/* Header */}
            <div className={`p-6 pb-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                onClick={() => setMode("choice")}
                className={`flex items-center gap-1 text-xs mb-3 ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <h1 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Join Workspace
              </h1>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Browse and join available communities
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Search Input */}
              <div className="relative mb-4">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search communities..."
                  className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Communities List */}
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {isSearching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className={`w-5 h-5 animate-spin ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                  </div>
                ) : availableCommunities.length === 0 ? (
                  <div className={`text-center py-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">No communities found</p>
                    <p className="text-xs mt-1">
                      {searchQuery ? 'Try a different search term' : 'Be the first to create one!'}
                    </p>
                  </div>
                ) : (
                  availableCommunities.map((community) => {
                    const logoUrl = getCommunityLogoUrl(community);
                    const bannerUrl = getCommunityBannerUrl(community);
                    return (
                      <div
                        key={community.id}
                        className={`rounded-xl overflow-hidden border transition-all hover:shadow-md ${
                          isDarkMode 
                            ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Banner Section */}
                        <div className="relative h-16 overflow-hidden">
                          {bannerUrl ? (
                            <img 
                              src={bannerUrl} 
                              alt={`${community.name} banner`}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div 
                              className="absolute inset-0"
                              style={{ 
                                background: `linear-gradient(135deg, ${community.color || '#6366f1'} 0%, ${community.color || '#6366f1'}88 50%, ${community.color || '#6366f1'}44 100%)`
                              }}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        </div>

                        {/* Content Section */}
                        <div className="relative px-3 pb-3">
                          {/* Logo - Overlapping banner */}
                          <div className="absolute -top-5 left-3">
                            <div className={`w-10 h-10 rounded-xl overflow-hidden ring-2 shadow-md ${
                              isDarkMode ? 'ring-slate-700' : 'ring-white'
                            }`}>
                              {logoUrl ? (
                                <img 
                                  src={logoUrl} 
                                  alt={community.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center font-bold text-xs text-white"
                                  style={{ backgroundColor: community.color || '#6366f1' }}
                                >
                                  {community.icon || community.name?.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Info & Join Button */}
                          <div className="pt-6 flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className={`text-sm font-semibold truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                {community.name}
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  <Users className="w-2.5 h-2.5" />
                                  {community.member_count || 0}
                                </span>
                                {community.channel_count !== undefined && (
                                  <span className={`text-[10px] flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <Hash className="w-2.5 h-2.5" />
                                    {community.channel_count}
                                  </span>
                                )}
                              </div>
                              {community.description && (
                                <p className={`text-[10px] mt-1 line-clamp-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {community.description}
                                </p>
                              )}
                            </div>

                            {/* Join Button */}
                            <button
                              onClick={() => handleJoinCommunity(community)}
                              disabled={joiningId === community.id}
                              className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                            >
                              {joiningId === community.id ? (
                                <Loader className="w-3 h-3 animate-spin" />
                              ) : (
                                <UserPlus className="w-3 h-3" />
                              )}
                              Join
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Skip option */}
              <button
                onClick={onContinue}
                className={`w-full mt-4 py-2.5 text-sm font-medium rounded-lg border transition-all ${
                  isDarkMode 
                    ? 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-500' 
                    : 'border-slate-300 text-slate-500 hover:text-slate-900 hover:border-slate-400'
                }`}
              >
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
