import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAvatarUrl } from "@/lib/utils";
import { Settings as SettingsIcon, Shield, Lock, Bell, Palette, Moon, Sun, Volume2, Download, Ban, Trash2, AlertCircle, User as UserIcon, Camera, X, Save, Mail } from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

export default function Settings() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { blockedUsers, getBlockedUsers, unblockUser } = useFriends();
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "general" | "privacy" | "notifications" | "blocked">("profile");
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);
  const [selectedBlockedUserId, setSelectedBlockedUserId] = useState<number | null>(null);
  
  // Profile state
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update profile state when user changes
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
    }
  }, [user]);

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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setProfileError('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setProfileError('Image size must be less than 5MB');
        return;
      }
      
      setAvatarFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setProfileError('');
    }
  };

  const removeAvatar = async () => {
    try {
      setIsUpdatingProfile(true);
      await updateProfile({ remove_avatar: true });
      setAvatarFile(null);
      setAvatarPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setProfileSuccess('Profile picture removed successfully');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (error: any) {
      setProfileError(error.message || 'Failed to remove profile picture');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    
    if (!displayName.trim()) {
      setProfileError('Display name is required');
      return;
    }

    setIsUpdatingProfile(true);

    try {
      await updateProfile({
        display_name: displayName,
        bio: bio || undefined,
        avatar: avatarFile || undefined,
      });
      
      setAvatarFile(null);
      setAvatarPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (error: any) {
      setProfileError(error.message || 'Failed to update profile');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const getAvatarDisplay = () => {
    if (avatarPreview) return avatarPreview;
    return getAvatarUrl(user?.avatar_url, user?.username || 'default');
  };

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: UserIcon },
    { id: "general" as const, label: "General", icon: SettingsIcon },
    { id: "privacy" as const, label: "Privacy & Safety", icon: Shield },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "blocked" as const, label: "Blocked Users", icon: Ban, count: blockedUsers.length },
  ];

  const ProfileSettings = () => (
    <div className="max-w-3xl space-y-6">
      {/* Success/Error Messages */}
      {profileSuccess && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${
          isDarkMode ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-green-50 border-green-300 text-green-600'
        }`}>
          <Save className="w-5 h-5" />
          <span>{profileSuccess}</span>
        </div>
      )}
      
      {profileError && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${
          isDarkMode ? 'bg-red-900/20 border-red-700 text-red-400' : 'bg-red-50 border-red-300 text-red-600'
        }`}>
          <AlertCircle className="w-5 h-5" />
          <span>{profileError}</span>
        </div>
      )}

      {/* Profile Picture Section */}
      <div className={`p-6 rounded-xl border ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <h3 className={`text-lg font-semibold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Profile Picture
        </h3>
        
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            <div className={`w-32 h-32 rounded-full overflow-hidden border-4 transition-all ${
              isDarkMode ? 'border-slate-600' : 'border-gray-200'
            } group-hover:border-blue-500`}>
              <img 
                src={getAvatarDisplay()} 
                alt="Profile" 
                className="w-full h-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`absolute bottom-0 right-0 p-3 rounded-full shadow-lg transition-all ${
                isDarkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <Camera className="w-5 h-5" />
            </button>
            {(avatarPreview || user?.avatar_url) && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={isUpdatingProfile}
                className={`absolute top-0 right-0 p-2 rounded-full shadow-lg transition-all ${
                  isDarkMode 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
                } disabled:opacity-50`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex-1">
            <h4 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Upload New Picture
            </h4>
            <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Upload a profile picture or remove the current one to use the default avatar.
              Maximum size: 5MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                Choose File
              </button>
              {(avatarPreview || user?.avatar_url) && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={isUpdatingProfile}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50'
                      : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                  } disabled:opacity-50`}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Information Form */}
      <form onSubmit={handleProfileUpdate} className={`p-6 rounded-xl border ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <h3 className={`text-lg font-semibold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Profile Information
        </h3>
        
        <div className="space-y-5">
          {/* Username (Read-only) */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Username
            </label>
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${
              isDarkMode ? 'bg-slate-700/50 border-slate-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-500'
            }`}>
              <span>@{user?.username}</span>
              <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(cannot be changed)</span>
            </div>
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Email
            </label>
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${
              isDarkMode ? 'bg-slate-700/50 border-slate-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-500'
            }`}>
              <Mail className="w-4 h-4" />
              <span>{user?.email || 'Not set'}</span>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Display Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          {/* Bio */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Tell others about yourself..."
              className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              {bio.length}/500 characters
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isUpdatingProfile || !displayName.trim()}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all transform hover:scale-[1.02] shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isUpdatingProfile ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

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
        {activeTab === "profile" && <ProfileSettings />}
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
