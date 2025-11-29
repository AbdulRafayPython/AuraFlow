import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useFriends } from "../../contexts/FriendsContext";
import { useAuth } from "../../contexts/AuthContext";
import { Users, Plus, Home, Settings as SettingsIcon, ChevronLeft, ChevronRight, MessageCircle, Phone, Video, LogOut, Moon, Sun, Hash } from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

interface FriendsSidebarProps {
  onNavigate: (view: string) => void;
  currentView: string;
}

const statusColors = {
  online: "bg-green-500",
  idle: "bg-yellow-500",
  dnd: "bg-red-500",
  offline: "bg-gray-500",
};

export default function FriendsSidebar({ onNavigate, currentView }: FriendsSidebarProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { friends, friendRequests } = useFriends();
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { logout } = useAuth();
  const [selectedWorkspace, setSelectedWorkspace] = useState("community"); // Default to first workspace

  // Workspaces data (same as ChannelSidebar for consistency)
  const workspaces = [
    { id: "1", name: "community" },
    { id: "2", name: "projects" },
    { id: "3", name: "ai-lab" },
  ];

  // Get online friends for quick access
  const onlineFriends = friends.filter(f => f.status === "online");
  const allFriendsToShow = isCollapsed ? onlineFriends.slice(0, 5) : onlineFriends.slice(0, 10);

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = async () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = async () => {
    await logout();
    setShowLogoutDialog(false);
  };

  return (
    <div className={`flex flex-col items-center py-3 gap-2 transition-all duration-300 relative ${
      isCollapsed ? 'w-16' : 'w-20'
    } ${isDarkMode ? 'bg-slate-900' : 'bg-gray-900'}`}>
      
      {/* Collapse/Expand Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`absolute -right-3 top-4 z-50 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-lg ${
          isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gray-800 hover:bg-gray-700'
        }`}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-white" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-white" />
        )}
      </button>

      {/* Home/Dashboard Button */}
      <div className="relative group">
        <button
          onClick={() => onNavigate("dashboard")}
          className={`rounded-2xl flex items-center justify-center transition-all ${
            isCollapsed ? 'w-12 h-12' : 'w-14 h-14'
          } ${
            currentView === "dashboard"
              ? "bg-blue-600 rounded-xl"
              : isDarkMode
              ? "bg-slate-700 hover:bg-blue-600 hover:rounded-xl"
              : "bg-gray-700 hover:bg-blue-600 hover:rounded-xl"
          }`}
        >
          <Home className={`text-white ${isCollapsed ? 'w-6 h-6' : 'w-7 h-7'}`} />
        </button>
        
        {/* Tooltip */}
        {!isCollapsed && (
          <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
            isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
          } shadow-xl z-50`}>
            Dashboard
          </div>
        )}
      </div>

      {/* Divider */}
      <div className={`h-0.5 rounded-full transition-all ${
        isCollapsed ? 'w-6' : 'w-8'
      } ${isDarkMode ? 'bg-slate-700' : 'bg-gray-700'}`} />

      {/* Friends Home Button */}
      <div className="relative group">
        <button
          onClick={() => onNavigate("friends")}
          className={`relative rounded-2xl flex items-center justify-center transition-all ${
            isCollapsed ? 'w-12 h-12' : 'w-14 h-14'
          } ${
            currentView === "friends"
              ? "bg-green-600 rounded-xl"
              : isDarkMode
              ? "bg-slate-700 hover:bg-green-600 hover:rounded-xl"
              : "bg-gray-700 hover:bg-green-600 hover:rounded-xl"
          }`}
        >
          <Users className={`text-white ${isCollapsed ? 'w-6 h-6' : 'w-7 h-7'}`} />
          
          {/* Pending Requests Badge */}
          {friendRequests.length > 0 && (
            <div className={`absolute -top-1 -right-1 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-slate-900 ${
              isCollapsed ? 'w-5 h-5' : 'w-6 h-6'
            } bg-red-600`}>
              {friendRequests.length > 9 ? '9+' : friendRequests.length}
            </div>
          )}
        </button>
        
        {/* Tooltip */}
        {!isCollapsed && (
          <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
            isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
          } shadow-xl z-50`}>
            Friends
            {friendRequests.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-600 rounded-full text-xs">
                {friendRequests.length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className={`h-0.5 rounded-full transition-all ${
        isCollapsed ? 'w-6' : 'w-8'
      } ${isDarkMode ? 'bg-slate-700' : 'bg-gray-700'}`} />

      {/* Workspaces Section */}
      <div className="w-full flex flex-col items-center gap-1 py-1">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="relative group w-full">
            <button
              onClick={() => {
                setSelectedWorkspace(workspace.name);
                onNavigate?.("dashboard");
              }}
              className={`rounded-2xl flex items-center justify-center transition-all ${
                isCollapsed ? 'w-12 h-12' : 'w-14 h-14'
              } ${
                selectedWorkspace === workspace.name
                  ? "bg-blue-600 rounded-xl"
                  : isDarkMode
                  ? "bg-slate-700 hover:bg-blue-600 hover:rounded-xl"
                  : "bg-gray-700 hover:bg-blue-600 hover:rounded-xl"
              }`}
            >
              <Hash className={`text-white ${isCollapsed ? 'w-6 h-6' : 'w-7 h-7'}`} />
            </button>
            {!isCollapsed && (
              <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
                isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
              } shadow-xl z-50`}>
                {workspace.name}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Online Friends (Quick Access) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full flex flex-col items-center gap-2 py-2 scrollbar-thin scrollbar-thumb-slate-700">
        {allFriendsToShow.map((friend) => (
          <div
            key={friend.id}
            className="relative group"
            onMouseEnter={() => setHoveredFriend(friend.id)}
            onMouseLeave={() => {
              setHoveredFriend(null);
              setShowQuickActions(null);
            }}
          >
            <button
              onClick={() => onNavigate("friends")}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowQuickActions(showQuickActions === friend.id ? null : friend.id);
              }}
              className={`relative rounded-2xl transition-all flex items-center justify-center font-bold ${
                isCollapsed ? 'w-12 h-12 text-base' : 'w-14 h-14 text-lg'
              } ${
                hoveredFriend === friend.id ? "rounded-xl" : ""
              } ${
                isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {friend.avatar ? (
                <img src={friend.avatar} alt={friend.displayName} className="w-full h-full rounded-2xl object-cover" />
              ) : (
                friend.displayName.charAt(0).toUpperCase()
              )}
              
              {/* Status Indicator */}
              <div className={`absolute bottom-0 right-0 rounded-full border-2 ${
                isCollapsed ? 'w-3 h-3' : 'w-4 h-4'
              } ${
                isDarkMode ? 'border-slate-900' : 'border-gray-900'
              } ${statusColors[friend.status]}`} />
            </button>

            {/* Quick Actions Menu */}
            {showQuickActions === friend.id && (
              <div className={`absolute left-full ml-2 w-40 rounded-lg shadow-2xl border z-50 ${
                isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-800 border-gray-700'
              }`}>
                <div className="p-2 space-y-1">
                  <button className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-700 text-white'
                  }`}>
                    <MessageCircle className="w-4 h-4" />
                    Message
                  </button>
                  <button className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-700 text-white'
                  }`}>
                    <Phone className="w-4 h-4" />
                    Call
                  </button>
                  <button className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-700 text-white'
                  }`}>
                    <Video className="w-4 h-4" />
                    Video
                  </button>
                </div>
              </div>
            )}

            {/* Tooltip with Friend Name */}
            {!isCollapsed && (
              <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
                isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
              } shadow-xl z-50`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${statusColors[friend.status]}`} />
                  {friend.displayName}
                </div>
                {friend.customStatus && (
                  <div className="text-xs text-gray-400 mt-1">{friend.customStatus}</div>
                )}
                <div className="text-xs text-gray-500 mt-1">Right-click for actions</div>
              </div>
            )}
          </div>
        ))}

        {/* Show More Indicator */}
        {isCollapsed && onlineFriends.length > 5 && (
          <div className={`text-xs font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>
            +{onlineFriends.length - 5}
          </div>
        )}

        {/* Add Friend Button */}
        <div className="relative group mt-2">
          <button
            onClick={() => onNavigate("friends")}
            className={`rounded-2xl flex items-center justify-center transition-all border-2 border-dashed ${
              isCollapsed ? 'w-12 h-12' : 'w-14 h-14'
            } ${
              isDarkMode
                ? 'border-slate-600 hover:border-green-500 hover:bg-green-500/10'
                : 'border-gray-600 hover:border-green-500 hover:bg-green-500/10'
            }`}
          >
            <Plus className={`${isCollapsed ? 'w-5 h-5' : 'w-6 h-6'} ${isDarkMode ? 'text-slate-400' : 'text-gray-400'} group-hover:text-green-500`} />
          </button>

          {/* Tooltip */}
          {!isCollapsed && (
            <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
              isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
            } shadow-xl z-50`}>
              Add Friend
            </div>
          )}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-2 pt-2 border-t border-slate-700">
        {/* Settings with Dropdown */}
        <div className="relative group">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`rounded-2xl flex items-center justify-center transition-all ${
              isCollapsed ? 'w-12 h-12' : 'w-14 h-14'
            } ${
              isDarkMode
                ? "bg-slate-800 hover:bg-gray-600 hover:rounded-xl"
                : "bg-gray-800 hover:bg-gray-600 hover:rounded-xl"
            }`}
          >
            <SettingsIcon className={`text-gray-400 ${isCollapsed ? 'w-5 h-5' : 'w-6 h-6'}`} />
          </button>

          {/* Settings Dropdown */}
          {showSettings && (
            <div className={`absolute bottom-full mb-2 ${isCollapsed ? 'w-32' : 'w-48'} rounded-lg shadow-2xl border ${
              isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-100 border-gray-300'
            }`}>
              <div className="p-2 space-y-1">
                {!isCollapsed && (
                  <button
                    onClick={toggleTheme}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                      isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-200 text-gray-900'
                    }`}
                  >
                    <span>Dark Mode</span>
                    <div className="flex items-center gap-1">
                      {isDarkMode ? (
                        <Moon className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Sun className="w-4 h-4 text-yellow-500" />
                      )}
                    </div>
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                    isDarkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'
                  }`}
                >
                  <span>Logout</span>
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Tooltip */}
          {!isCollapsed && !showSettings && (
            <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
              isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
            } shadow-xl z-50`}>
              Settings
            </div>
          )}
          {isCollapsed && !showSettings && (
            <div className={`absolute left-full ml-2 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
              isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
            } shadow-xl z-50`}>
              Expand for Settings
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="relative group">
          <button
            className={`rounded-2xl flex items-center justify-center bg-blue-600 font-bold text-white ${
              isCollapsed ? 'w-12 h-12 text-base' : 'w-14 h-14 text-lg'
            }`}
          >
            U
          </button>

          {/* Tooltip */}
          {!isCollapsed && (
            <div className={`absolute left-full ml-4 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
              isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-800 text-white'
            } shadow-xl z-50`}>
              Your Profile
            </div>
          )}
        </div>
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.5);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.7);
        }
      `}</style>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutDialog}
        title="Logout"
        description="Are you sure you want to logout? You will need to log in again to access your account."
        cancelText="Cancel"
        confirmText="Logout"
        isDangerous={true}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </div>
  );
}