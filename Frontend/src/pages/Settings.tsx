import { useState, useEffect, useRef } from "react";
import { useTheme, THEMES, ThemeId } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAvatarUrl } from "@/lib/utils";
import { 
  Settings as SettingsIcon, Shield, Lock, Bell, Palette, Moon, Sun, Volume2, 
  Download, Ban, Trash2, AlertCircle, User as UserIcon, Camera, X, Save, Mail, 
  Check, Sparkles, ChevronRight, Edit3, Globe, Eye, EyeOff, Key, Smartphone,
  MessageSquare, Users, Zap, Monitor, VolumeX, Volume1, ArrowRight, RefreshCw
} from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

export default function Settings() {
  const { isDarkMode, toggleTheme, currentTheme, setTheme, themes } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const { blockedUsers, getBlockedUsers, unblockUser } = useFriends();
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "general" | "privacy" | "notifications" | "blocked">("profile");
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
      if (!file.type.startsWith('image/')) {
        setProfileError('Please select an image file');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setProfileError('Image size must be less than 5MB');
        return;
      }
      
      setAvatarFile(file);
      
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
      setProfileSuccess('Profile picture removed');
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
      setIsEditingProfile(false);
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
    { id: "profile" as const, label: "Profile", icon: UserIcon, description: "Manage your public profile" },
    { id: "appearance" as const, label: "Appearance", icon: Palette, description: "Customize your theme" },
    { id: "general" as const, label: "General", icon: SettingsIcon, description: "Language & accessibility" },
    { id: "privacy" as const, label: "Privacy", icon: Shield, description: "Control your privacy" },
    { id: "notifications" as const, label: "Notifications", icon: Bell, description: "Manage alerts" },
    { id: "blocked" as const, label: "Blocked", icon: Ban, count: blockedUsers.length, description: "Blocked users" },
  ];

  // Modern Toggle Switch Component
  const ToggleSwitch = ({ enabled, onChange, size = "default" }: { enabled: boolean; onChange: () => void; size?: "default" | "small" }) => {
    const sizes = {
      default: { track: "h-7 w-12", thumb: "h-5 w-5", translate: "translate-x-5" },
      small: { track: "h-5 w-9", thumb: "h-3.5 w-3.5", translate: "translate-x-4" }
    };
    const s = sizes[size];
    
    return (
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex ${s.track} items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] focus:ring-offset-2 focus:ring-offset-[hsl(var(--theme-bg-primary))] ${
          enabled 
            ? isBasicTheme 
              ? 'bg-[hsl(var(--theme-accent-primary))]'
              : 'bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-[var(--theme-glow-secondary)]' 
            : 'bg-[hsl(var(--theme-bg-tertiary))]'
        }`}
      >
        <span
          className={`inline-flex items-center justify-center ${s.thumb} transform rounded-full bg-white shadow-lg transition-all duration-300 ${
            enabled ? s.translate : "translate-x-1"
          }`}
        >
          {enabled && size === "default" && <Check className="w-3 h-3 text-[hsl(var(--theme-accent-primary))]" />}
        </span>
      </button>
    );
  };

  // Setting Row Component
  const SettingRow = ({ 
    icon: Icon, 
    title, 
    description, 
    children,
    onClick,
    danger = false
  }: { 
    icon: any; 
    title: string; 
    description?: string; 
    children?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
  }) => (
    <div 
      className={`group flex items-center justify-between p-4 rounded-2xl transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:bg-[hsl(var(--theme-bg-hover))]' : ''
      } ${danger ? 'hover:bg-red-500/10' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className={`p-2.5 rounded-xl transition-all duration-300 ${
          danger 
            ? 'bg-red-500/10 text-red-500 group-hover:bg-red-500/20' 
            : 'bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-accent-primary))] group-hover:bg-[hsl(var(--theme-accent-primary)/0.15)]'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className={`font-medium ${danger ? 'text-red-500' : 'text-[hsl(var(--theme-text-primary))]'}`}>
            {title}
          </p>
          {description && (
            <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onClick && <ChevronRight className="w-5 h-5 text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-text-primary))] transition-colors" />}
      </div>
    </div>
  );

  // Settings Card Component
  const SettingsCard = ({ 
    title, 
    description,
    children 
  }: { 
    title?: string; 
    description?: string;
    children: React.ReactNode 
  }) => (
    <div className="rounded-2xl border bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default)/0.5)] backdrop-blur-sm overflow-hidden">
      {title && (
        <div className="px-5 py-4 border-b border-[hsl(var(--theme-border-default)/0.5)]">
          <h3 className="font-semibold text-[hsl(var(--theme-text-primary))]">{title}</h3>
          {description && <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">{description}</p>}
        </div>
      )}
      <div className="p-2">
        {children}
      </div>
    </div>
  );

  // Profile Settings
  const ProfileSettings = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Success/Error Messages */}
      {profileSuccess && (
        <div className="p-4 rounded-2xl border flex items-center gap-3 bg-emerald-500/10 border-emerald-500/30 text-emerald-500 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-1 rounded-full bg-emerald-500/20">
            <Check className="w-4 h-4" />
          </div>
          <span className="font-medium">{profileSuccess}</span>
        </div>
      )}
      
      {profileError && (
        <div className="p-4 rounded-2xl border flex items-center gap-3 bg-red-500/10 border-red-500/30 text-red-500 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-1 rounded-full bg-red-500/20">
            <AlertCircle className="w-4 h-4" />
          </div>
          <span className="font-medium">{profileError}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="relative overflow-hidden rounded-3xl border bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default)/0.5)] backdrop-blur-sm">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] via-[hsl(var(--theme-accent-secondary))] to-[hsl(var(--theme-accent-primary)/0.8)] relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz48L3N2Zz4=')] opacity-30" />
        </div>

        {/* Profile Content */}
        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="relative -mt-16 mb-4">
            <div className="relative inline-block group">
              <div className="w-28 h-28 rounded-2xl overflow-hidden border-4 border-[hsl(var(--theme-bg-secondary))] shadow-xl transition-all duration-300 group-hover:scale-105">
                <img 
                  src={getAvatarDisplay()} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 p-2.5 rounded-xl bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-lg hover:shadow-[var(--theme-glow-primary)] transition-all duration-300 hover:scale-110"
              >
                <Camera className="w-4 h-4" />
              </button>
              {(avatarPreview || user?.avatar_url) && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={isUpdatingProfile}
                  className="absolute -top-2 -right-2 p-1.5 rounded-lg bg-red-500 text-white shadow-lg hover:bg-red-600 transition-all duration-300 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* User Info or Edit Form */}
          {!isEditingProfile ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {user?.display_name || user?.username}
                </h2>
                <p className="text-[hsl(var(--theme-text-muted))] flex items-center gap-1 mt-1">
                  @{user?.username}
                </p>
              </div>
              
              {user?.bio && (
                <p className="text-[hsl(var(--theme-text-secondary))] leading-relaxed">
                  {user.bio}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className={`flex items-center gap-2 px-5 py-2.5 ${isBasicTheme ? 'rounded-md bg-[hsl(var(--theme-accent-primary))]' : 'rounded-xl bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-lg hover:shadow-[var(--theme-glow-primary)] hover:scale-[1.02]'} text-white font-medium transition-all duration-300`}
                >
                  <Edit3 className="w-4 h-4" />
                  Edit Profile
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProfileUpdate} className="space-y-5 pt-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border bg-[hsl(var(--theme-bg-tertiary)/0.5)] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-transparent transition-all duration-300"
                    placeholder="Your display name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Tell others about yourself..."
                    className="w-full px-4 py-3 rounded-xl border bg-[hsl(var(--theme-bg-tertiary)/0.5)] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] focus:border-transparent resize-none transition-all duration-300"
                  />
                  <p className="text-xs mt-2 text-[hsl(var(--theme-text-muted))]">
                    {bio.length}/500 characters
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingProfile || !displayName.trim()}
                  className={`flex items-center gap-2 px-5 py-2.5 ${isBasicTheme ? 'rounded-md bg-[hsl(var(--theme-accent-primary))]' : 'rounded-xl bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-lg hover:shadow-[var(--theme-glow-primary)] hover:scale-[1.02]'} text-white font-medium transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100`}
                >
                  {isUpdatingProfile ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingProfile(false);
                    setDisplayName(user?.display_name || "");
                    setBio(user?.bio || "");
                  }}
                  className="px-5 py-2.5 rounded-xl border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] font-medium hover:bg-[hsl(var(--theme-bg-hover))] transition-all duration-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Account Details */}
      <SettingsCard title="Account Details" description="Your account information">
        <SettingRow 
          icon={Mail} 
          title="Email Address"
          description={user?.email || 'Not set'}
        />
        <SettingRow 
          icon={UserIcon} 
          title="Username"
          description={`@${user?.username}`}
        />
      </SettingsCard>
    </div>
  );

  // Theme Preview Card Component  
  const ThemePreviewCard = ({ themeId, theme }: { themeId: ThemeId; theme: typeof themes[ThemeId] }) => {
    const isSelected = currentTheme === themeId;
    const isSpecialTheme = ['neon', 'hologram', 'plasma', 'galaxy', 'frost', 'ember'].includes(themeId);
    
    return (
      <button
        onClick={() => setTheme(themeId)}
        className={`relative group rounded-2xl overflow-hidden transition-all duration-500 ${
          isSelected 
            ? 'ring-2 ring-[hsl(var(--theme-accent-primary))] scale-[1.02] shadow-xl shadow-[hsl(var(--theme-accent-primary)/0.2)]' 
            : 'hover:scale-[1.02] hover:shadow-lg border border-[hsl(var(--theme-border-default)/0.5)]'
        }`}
      >
        {/* Theme Preview */}
        <div 
          className="h-24 relative overflow-hidden"
          style={{ backgroundColor: theme.preview.bg }}
        >
          {/* Minimalist UI mockup */}
          <div className="absolute inset-3 flex gap-2">
            <div 
              className="w-8 h-full rounded-lg opacity-60"
              style={{ backgroundColor: theme.preview.bg, filter: 'brightness(0.7)' }}
            />
            <div className="flex-1 flex flex-col gap-2">
              <div 
                className="h-4 w-full rounded-md opacity-40"
                style={{ backgroundColor: theme.preview.bg, filter: 'brightness(1.3)' }}
              />
              <div className="flex-1 rounded-lg opacity-20" style={{ backgroundColor: theme.preview.accent }} />
              <div 
                className="h-6 w-20 rounded-full ml-auto"
                style={{ background: `linear-gradient(135deg, ${theme.preview.accent} 0%, ${theme.preview.secondary} 100%)` }}
              />
            </div>
          </div>
          
          {/* Glow effect for special themes */}
          {isSpecialTheme && (
            <div 
              className="absolute inset-0 opacity-30"
              style={{ 
                background: `radial-gradient(circle at 70% 70%, ${theme.preview.accent}60 0%, transparent 50%)` 
              }}
            />
          )}
          
          {/* Selected indicator */}
          {isSelected && (
            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg">
              <Check className="w-4 h-4" style={{ color: theme.preview.accent }} />
            </div>
          )}
          
          {/* Special badge */}
          {isSpecialTheme && (
            <div 
              className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
              style={{ 
                background: `linear-gradient(135deg, ${theme.preview.accent} 0%, ${theme.preview.secondary} 100%)`,
                color: '#fff'
              }}
            >
              New
            </div>
          )}
        </div>
        
        {/* Theme Info */}
        <div className="p-3 bg-[hsl(var(--theme-bg-secondary))]">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))]">
              {theme.name}
            </h4>
            {theme.isDark ? (
              <Moon className="w-3.5 h-3.5 text-[hsl(var(--theme-text-muted))]" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            )}
          </div>
          
          {/* Color dots */}
          <div className="flex items-center gap-1 mt-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.bg }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.secondary }} />
          </div>
        </div>
      </button>
    );
  };

  // Appearance Settings
  const AppearanceSettings = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Current Theme Highlight */}
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-[hsl(var(--theme-bg-secondary)/0.8)] to-[hsl(var(--theme-bg-tertiary)/0.5)] border-[hsl(var(--theme-border-default)/0.5)] backdrop-blur-sm p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[hsl(var(--theme-accent-primary)/0.1)] to-transparent rounded-full blur-3xl" />
        
        <div className="relative flex items-center gap-5">
          <div 
            className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl relative overflow-hidden"
            style={{ 
              background: `linear-gradient(135deg, ${themes[currentTheme].preview.accent} 0%, ${themes[currentTheme].preview.secondary} 100%)` 
            }}
          >
            <Sparkles className="w-8 h-8 text-white drop-shadow-lg" />
            <div className="absolute inset-0 bg-white/10 animate-pulse" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-[hsl(var(--theme-text-muted))] mb-1">Active Theme</p>
            <h3 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">
              {themes[currentTheme].name}
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-secondary))] mt-1">
              {themes[currentTheme].description}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-4 rounded-2xl bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-all duration-300 group"
          >
            {isDarkMode ? (
              <Moon className="w-6 h-6 text-[hsl(var(--theme-accent-primary))] group-hover:scale-110 transition-transform" />
            ) : (
              <Sun className="w-6 h-6 text-amber-500 group-hover:scale-110 transition-transform" />
            )}
          </button>
        </div>
      </div>

      {/* Theme Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-[hsl(var(--theme-text-muted))]" />
          <h4 className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">Dark Themes</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(Object.entries(themes) as [ThemeId, typeof themes[ThemeId]][])
            .filter(([_, theme]) => theme.isDark)
            .map(([id, theme]) => (
              <ThemePreviewCard key={id} themeId={id} theme={theme} />
            ))}
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-500" />
          <h4 className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">Light Themes</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(Object.entries(themes) as [ThemeId, typeof themes[ThemeId]][])
            .filter(([_, theme]) => !theme.isDark)
            .map(([id, theme]) => (
              <ThemePreviewCard key={id} themeId={id} theme={theme} />
            ))}
        </div>
      </div>
    </div>
  );

  // General Settings
  const GeneralSettings = () => {
    const [compactMode, setCompactMode] = useState(false);
    const [reduceMotion, setReduceMotion] = useState(false);
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <SettingsCard title="Language & Region" description="Configure your language preferences">
          <SettingRow 
            icon={Globe} 
            title="Language"
            description="English (US)"
            onClick={() => {}}
          />
        </SettingsCard>

        <SettingsCard title="Accessibility" description="Customize your experience">
          <SettingRow 
            icon={Monitor} 
            title="Compact Mode"
            description="Use a more compact layout"
          >
            <ToggleSwitch enabled={compactMode} onChange={() => setCompactMode(!compactMode)} />
          </SettingRow>
          <SettingRow 
            icon={Zap} 
            title="Reduce Motion"
            description="Minimize animations"
          >
            <ToggleSwitch enabled={reduceMotion} onChange={() => setReduceMotion(!reduceMotion)} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Data & Storage" description="Manage your data">
          <SettingRow 
            icon={Download} 
            title="Download Your Data"
            description="Get a copy of your data"
            onClick={() => {}}
          />
        </SettingsCard>
      </div>
    );
  };

  // Privacy Settings
  const PrivacySettings = () => {
    const [showOnline, setShowOnline] = useState(true);
    const [showLastSeen, setShowLastSeen] = useState(true);
    const [allowRequests, setAllowRequests] = useState(true);
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <SettingsCard title="Visibility" description="Control who can see your activity">
          <SettingRow 
            icon={Eye} 
            title="Show Online Status"
            description="Let friends see when you're online"
          >
            <ToggleSwitch enabled={showOnline} onChange={() => setShowOnline(!showOnline)} />
          </SettingRow>
          <SettingRow 
            icon={EyeOff} 
            title="Show Last Seen"
            description="Let friends see when you were last active"
          >
            <ToggleSwitch enabled={showLastSeen} onChange={() => setShowLastSeen(!showLastSeen)} />
          </SettingRow>
          <SettingRow 
            icon={Users} 
            title="Allow Friend Requests"
            description="Allow anyone to send you friend requests"
          >
            <ToggleSwitch enabled={allowRequests} onChange={() => setAllowRequests(!allowRequests)} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Security" description="Protect your account">
          <SettingRow 
            icon={Key} 
            title="Change Password"
            description="Update your password"
            onClick={() => {}}
          />
          <SettingRow 
            icon={Smartphone} 
            title="Two-Factor Authentication"
            description="Add an extra layer of security"
            onClick={() => {}}
          />
        </SettingsCard>

        <SettingsCard>
          <SettingRow 
            icon={Trash2} 
            title="Delete Account"
            description="Permanently delete your account"
            onClick={() => {}}
            danger
          />
        </SettingsCard>
      </div>
    );
  };

  // Notification Settings
  const NotificationSettings = () => {
    const [dmNotifs, setDmNotifs] = useState(true);
    const [channelNotifs, setChannelNotifs] = useState(true);
    const [friendRequests, setFriendRequests] = useState(true);
    const [friendOnline, setFriendOnline] = useState(false);
    const [sounds, setSounds] = useState(true);
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <SettingsCard title="Messages" description="Notification preferences for messages">
          <SettingRow 
            icon={MessageSquare} 
            title="Direct Messages"
            description="Notify me about direct messages"
          >
            <ToggleSwitch enabled={dmNotifs} onChange={() => setDmNotifs(!dmNotifs)} />
          </SettingRow>
          <SettingRow 
            icon={Users} 
            title="Channel Messages"
            description="Notify me about channel messages"
          >
            <ToggleSwitch enabled={channelNotifs} onChange={() => setChannelNotifs(!channelNotifs)} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Friends" description="Friend activity notifications">
          <SettingRow 
            icon={UserIcon} 
            title="Friend Requests"
            description="Notify me about new friend requests"
          >
            <ToggleSwitch enabled={friendRequests} onChange={() => setFriendRequests(!friendRequests)} />
          </SettingRow>
          <SettingRow 
            icon={Zap} 
            title="Friend Online Status"
            description="Notify me when friends come online"
          >
            <ToggleSwitch enabled={friendOnline} onChange={() => setFriendOnline(!friendOnline)} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Sound" description="Audio preferences">
          <SettingRow 
            icon={sounds ? Volume2 : VolumeX} 
            title="Notification Sounds"
            description="Play sounds for notifications"
          >
            <ToggleSwitch enabled={sounds} onChange={() => setSounds(!sounds)} />
          </SettingRow>
        </SettingsCard>
      </div>
    );
  };

  // Blocked Users Settings
  const BlockedUsersSettings = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[hsl(var(--theme-text-primary))]">Blocked Users</h3>
          <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">
            {blockedUsers.length} {blockedUsers.length === 1 ? 'user' : 'users'} blocked
          </p>
        </div>
      </div>

      {isLoadingBlocked ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-[hsl(var(--theme-accent-primary))] animate-spin" />
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className="text-center py-16 rounded-3xl border border-dashed bg-[hsl(var(--theme-bg-secondary)/0.3)] border-[hsl(var(--theme-border-default)/0.5)]">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--theme-bg-tertiary))] flex items-center justify-center mx-auto mb-4">
            <Ban className="w-8 h-8 text-[hsl(var(--theme-text-muted))]" />
          </div>
          <h4 className="font-semibold text-[hsl(var(--theme-text-primary))] mb-2">No blocked users</h4>
          <p className="text-sm text-[hsl(var(--theme-text-muted))] max-w-xs mx-auto">
            When you block someone, they'll appear here and won't be able to contact you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {blockedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 rounded-2xl border bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default)/0.5)] hover:bg-[hsl(var(--theme-bg-hover))] transition-all duration-300 group"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-[hsl(var(--theme-bg-tertiary))] flex items-center justify-center font-semibold text-lg text-[hsl(var(--theme-text-muted))]">
                    {user.blocked_user?.display_name?.charAt(0).toUpperCase() || 
                     user.blocked_user?.username?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-red-500">
                    <Ban className="w-3 h-3 text-white" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-[hsl(var(--theme-text-primary))]">
                    {user.blocked_user?.display_name || user.blocked_user?.username}
                  </h4>
                  <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                    @{user.blocked_user?.username}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedBlockedUserId(user.blocked_user_id);
                  setShowUnblockConfirm(true);
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-accent-primary))] hover:text-white transition-all duration-300"
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
    <div className="flex h-full bg-[hsl(var(--theme-bg-primary))] transition-colors duration-300">
      {/* Sidebar */}
      <div className="hidden md:flex w-72 flex-shrink-0 border-r bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default)/0.3)] backdrop-blur-sm">
        <div className="w-full p-6 flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.3)]">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
              Settings
            </h1>
          </div>

          {/* Navigation */}
          <nav className="space-y-1.5 flex-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} text-sm font-medium transition-all duration-300 group ${
                    isActive
                      ? isBasicTheme
                        ? "bg-[hsl(var(--theme-accent-primary))] text-white"
                        : "bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.25)]"
                      : "text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]"
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? '' : 'group-hover:scale-110'}`} />
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isActive
                        ? "bg-white/20"
                        : "bg-red-500 text-white"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="pt-4 border-t border-[hsl(var(--theme-border-default)/0.3)]">
            <p className="text-xs text-[hsl(var(--theme-text-muted))] text-center">
              AuraFlow v1.0.0
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Tab Selector */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 border-b border-[hsl(var(--theme-border-default)/0.3)] bg-[hsl(var(--theme-bg-secondary)/0.95)] backdrop-blur-lg">
        <div className="flex overflow-x-auto px-4 py-3 gap-2 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                  isActive
                    ? isBasicTheme
                      ? "bg-[hsl(var(--theme-accent-primary))] text-white"
                      : "bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-lg"
                    : "text-[hsl(var(--theme-text-muted))] bg-[hsl(var(--theme-bg-tertiary))]"
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 md:p-8 md:pt-8 pt-20">
          {/* Section Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>
            <p className="text-[hsl(var(--theme-text-muted))] mt-1">
              {tabs.find(t => t.id === activeTab)?.description}
            </p>
          </div>

          {/* Tab Content */}
          {activeTab === "profile" && <ProfileSettings />}
          {activeTab === "appearance" && <AppearanceSettings />}
          {activeTab === "general" && <GeneralSettings />}
          {activeTab === "privacy" && <PrivacySettings />}
          {activeTab === "notifications" && <NotificationSettings />}
          {activeTab === "blocked" && <BlockedUsersSettings />}
        </div>
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
