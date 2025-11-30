import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import { Settings as SettingsIcon, Shield, Lock, Bell, Palette, Moon, Sun, Volume2, Download, Ban, Trash2, AlertCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

export default function Settings() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { blockedUsers, getBlockedUsers, unblockUser } = useFriends();
  const [activeTab, setActiveTab] = useState<"general" | "privacy" | "notifications" | "blocked">("general");
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);
  const [selectedBlockedUserId, setSelectedBlockedUserId] = useState<number | null>(null);

  // Load blocked users when tab changes to blocked
  useEffect(() => {
    if (activeTab === "blocked" && blockedUsers.length === 0) {
      loadBlockedUsers();
    }
  }, [activeTab]);

  const loadBlockedUsers = async () => {
    setIsLoadingBlocked(true);
    try {
      await getBlockedUsers();
    } catch (error) {
      console.error("Failed to load blocked users:", error);
    } finally {
      setIsLoadingBlocked(false);
    }
  };

  const handleUnblock = async (userId: number) => {
    try {
      await unblockUser(userId);
      setShowUnblockConfirm(false);
      setSelectedBlockedUserId(null);
    } catch (error) {
      console.error("Failed to unblock user:", error);
    }
  };

  const tabs = [
    { id: "general" as const, label: "General", icon: SettingsIcon },
    { id: "privacy" as const, label: "Privacy & Safety", icon: Shield },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "blocked" as const, label: "Blocked Users", icon: Ban, count: blockedUsers.length },
  ];

  const GeneralSettings = () => (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Appearance
        </h3>
        <div className={`p-4 rounded-lg border ${
          isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Dark Mode
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Toggle between light and dark theme
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                isDarkMode ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  isDarkMode ? "translate-x-7" : "translate-x-1"
                }`}
              />
              <div className={`absolute flex items-center justify-center w-full h-full pointer-events-none ${
                isDarkMode ? "text-blue-600" : "text-gray-400"
              }`}>
                {isDarkMode ? <Moon className="w-3 h-3 ml-1" /> : <Sun className="w-3 h-3 mr-1" />}
              </div>
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Language & Region
        </h3>
        <div className={`p-4 rounded-lg border ${
          isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
        }`}>
          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            Language
          </label>
          <select className={`w-full px-3 py-2 rounded border ${
            isDarkMode
              ? "bg-slate-900 border-slate-700 text-white"
              : "bg-white border-gray-300 text-gray-900"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}>
            <option>English (US)</option>
            <option>English (UK)</option>
            <option>Spanish</option>
            <option>French</option>
            <option>German</option>
            <option>Chinese</option>
            <option>Japanese</option>
          </select>
        </div>
      </div>

      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Accessibility
        </h3>
        <div className={`space-y-3`}>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Compact Mode
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Use a more compact layout
              </p>
            </div>
            <input type="checkbox" className="w-5 h-5" />
          </div>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Reduce Motion
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Minimize animations and transitions
              </p>
            </div>
            <input type="checkbox" className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );

  const PrivacySettings = () => (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Privacy Controls
        </h3>
        <div className={`space-y-3`}>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Show Online Status
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Let friends see when you're online
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Show Last Seen
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Let friends see when you were last active
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Allow Friend Requests
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Allow anyone to send you friend requests
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Security
        </h3>
        <div className={`space-y-3`}>
          <div className={`p-4 rounded-lg border ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <p className={`font-medium mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Change Password
            </p>
            <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              Update Password
            </button>
          </div>
          <div className={`p-4 rounded-lg border ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <p className={`font-medium mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Two-Factor Authentication
            </p>
            <p className={`text-sm mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Add an extra layer of security to your account
            </p>
            <button className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-600/10 text-sm font-medium transition-colors">
              Enable 2FA
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const NotificationSettings = () => (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Message Notifications
        </h3>
        <div className={`space-y-3`}>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Direct Messages
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Notify me about direct messages
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Channel Messages
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Notify me about channel messages
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Friend Activity
        </h3>
        <div className={`space-y-3`}>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Friend Requests
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Notify me about new friend requests
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Friend Online Status
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Notify me when friends come online
              </p>
            </div>
            <input type="checkbox" className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Sound & Vibration
        </h3>
        <div className={`space-y-3`}>
          <div className={`p-4 rounded-lg border flex items-center justify-between ${
            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
          }`}>
            <div>
              <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Notification Sounds
              </p>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Play sounds for notifications
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );

  const BlockedUsersSettings = () => (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Blocked Users
        </h3>
        <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          Manage users you've blocked. They won't be able to send you messages or friend requests.
        </p>
      </div>

      {isLoadingBlocked ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className={`text-center py-12 rounded-lg border ${
          isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"
        }`}>
          <Ban className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
          <h4 className={`font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            No blocked users
          </h4>
          <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            You haven't blocked anyone yet. When you block someone, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {blockedUsers.map((user) => (
            <div
              key={user.id}
              className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 hover:bg-slate-750"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg relative flex-shrink-0 ${
                  isDarkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-700"
                }`}>
                  {user.blocked_user?.display_name?.charAt(0).toUpperCase() || 
                   user.blocked_user?.username?.charAt(0).toUpperCase() || "?"}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <Ban className="w-5 h-5 text-red-500" />
                  </div>
                </div>
                <div>
                  <h4 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    {user.blocked_user?.display_name || user.blocked_user?.username}
                  </h4>
                  <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    @{user.blocked_user?.username}
                  </p>
                  <p className={`text-xs flex items-center gap-1 mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                    <AlertCircle className="w-3 h-3" />
                    This user is blocked
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedBlockedUserId(user.blocked_user_id);
                  setShowUnblockConfirm(true);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isDarkMode
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-blue-100 hover:bg-blue-200 text-blue-700"
                }`}
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex h-full ${isDarkMode ? "bg-slate-700" : "bg-gray-50"}`}>
      {/* Sidebar */}
      <div className={`hidden sm:flex w-64 flex-shrink-0 border-r ${
        isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
      }`}>
        <div className="w-full p-6">
          <div className="flex items-center gap-3 mb-8">
            <SettingsIcon className={`w-6 h-6 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`} />
            <h1 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Settings
            </h1>
          </div>

          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? isDarkMode
                        ? "bg-blue-600 text-white"
                        : "bg-blue-100 text-blue-600"
                      : isDarkMode
                      ? "text-gray-400 hover:bg-slate-700 hover:text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      activeTab === tab.id
                        ? "bg-white text-blue-600"
                        : isDarkMode
                        ? "bg-slate-700 text-gray-300"
                        : "bg-gray-200 text-gray-700"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile Tab Selector */}
      <div className={`sm:hidden w-full border-b ${isDarkMode ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"}`}>
        <div className="flex overflow-x-auto px-4 py-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? isDarkMode
                      ? "bg-blue-600 text-white"
                      : "bg-blue-100 text-blue-600"
                    : isDarkMode
                    ? "text-gray-400 hover:bg-slate-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-6 sm:p-8 ${isDarkMode ? "bg-slate-700" : "bg-gray-50"}`}>
        {activeTab === "general" && <GeneralSettings />}
        {activeTab === "privacy" && <PrivacySettings />}
        {activeTab === "notifications" && <NotificationSettings />}
        {activeTab === "blocked" && <BlockedUsersSettings />}
      </div>

      {/* Unblock Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showUnblockConfirm}
        title="Unblock User?"
        description="Are you sure you want to unblock this user? They'll be able to send you messages and friend requests again."
        cancelText="Cancel"
        confirmText="Unblock"
        onConfirm={() => {
          if (selectedBlockedUserId) {
            handleUnblock(selectedBlockedUserId);
          }
        }}
        onCancel={() => {
          setShowUnblockConfirm(false);
          setSelectedBlockedUserId(null);
        }}
      />
    </div>
  );
}
