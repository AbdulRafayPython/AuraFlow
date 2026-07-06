import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme, THEMES, ThemeId } from "@/contexts/ThemeContext";
import { useFriends } from "@/contexts/FriendsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/hooks/useRealtime";
import { getAvatarUrl } from "@/lib/utils";
import { 
  Settings as SettingsIcon, Shield, Lock, Bell, Palette, Moon, Sun, Volume2, 
  Download, Ban, Trash2, AlertCircle, User as UserIcon, Camera, X, Save, Mail, 
  Check, Sparkles, ChevronRight, Edit3, Globe, Eye, EyeOff, Key, Smartphone,
  MessageSquare, Users, Zap, Monitor, VolumeX, Volume1, ArrowRight, RefreshCw, Bot,
  Crown, BarChart3, Building2, ShieldCheck, ExternalLink
} from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import PersonalAgentsPanel from "@/components/ai-agents/PersonalAgentsPanel";
import { API_SERVER } from "@/config/api";

export default function Settings() {
  const { isDarkMode, toggleTheme, currentTheme, setTheme, themes } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const { blockedUsers, getBlockedUsers, unblockUser } = useFriends();
  const { user, updateProfile } = useAuth();
  const { communities } = useRealtime();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "general" | "privacy" | "notifications" | "blocked" | "agents" | "community-admin">("profile");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Check if user owns any communities
  const ownedCommunities = communities.filter(c => c.role === 'owner');
  const isSystemAdmin = user?.role === 'system_admin';

  const tabs: Array<{ id: typeof activeTab; label: string; icon: any; description: string; count?: number }> = [
    { id: "profile" as const, label: "Profile", icon: UserIcon, description: "Manage your public profile" },
    { id: "appearance" as const, label: "Appearance", icon: Palette, description: "Customize your theme" },
    { id: "general" as const, label: "General", icon: SettingsIcon, description: "Language & accessibility" },
    { id: "privacy" as const, label: "Privacy", icon: Shield, description: "Control your privacy" },
    { id: "notifications" as const, label: "Notifications", icon: Bell, description: "Manage alerts" },
    { id: "agents" as const, label: "AI Agents", icon: Bot, description: "Personal AI assistants" },
    { id: "blocked" as const, label: "Blocked", icon: Ban, count: blockedUsers.length, description: "Blocked users" },
    ...(ownedCommunities.length > 0 ? [{ id: "community-admin" as const, label: "Community Admin", icon: Crown, description: "Manage your communities" }] : []),
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
    <div className="space-y-6">
      {/* Status banners */}
      {profileSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{profileSuccess}</span>
        </div>
      )}
      {profileError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{profileError}</span>
        </div>
      )}

      {/* ── Identity card ─────────────────────────────────── */}
      <section className="rounded-xl border border-[hsl(var(--theme-border-default)/0.6)] bg-[hsl(var(--theme-bg-secondary))] overflow-hidden">
        <div className="px-5 py-5 flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden ring-1 ring-[hsl(var(--theme-border-default)/0.6)] bg-[hsl(var(--theme-bg-tertiary))]">
              <img
                src={getAvatarDisplay()}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 flex items-center justify-center rounded-full border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
              title="Change picture"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* Name block */}
          <div className="flex-1 min-w-0">
            {!isEditingProfile ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-[hsl(var(--theme-text-primary))] truncate">
                      {user?.display_name || user?.username}
                    </h3>
                    <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                      @{user?.username}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </div>
                {user?.bio && (
                  <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--theme-text-secondary))]">
                    {user.bio}
                  </p>
                )}
                {(avatarPreview || user?.avatar_url) && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    disabled={isUpdatingProfile}
                    className="mt-3 text-xs text-[hsl(var(--theme-text-muted))] hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    Remove picture
                  </button>
                )}
              </>
            ) : (
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[hsl(var(--theme-text-muted))] mb-1.5 uppercase tracking-wider">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md text-sm border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:outline-none focus:border-[hsl(var(--theme-accent-primary))] transition-colors"
                    placeholder="Your display name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[hsl(var(--theme-text-muted))] mb-1.5 uppercase tracking-wider">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Tell others about yourself…"
                    className="w-full px-3 py-2 rounded-md text-sm border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] focus:outline-none focus:border-[hsl(var(--theme-accent-primary))] resize-none transition-colors"
                  />
                  <p className="text-[11px] mt-1.5 text-[hsl(var(--theme-text-muted))]">
                    {bio.length}/500
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile || !displayName.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isUpdatingProfile ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Saving
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Save
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
                    className="px-4 py-1.5 rounded-full text-xs font-medium border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Account details list ──────────────────────────── */}
      <section className="rounded-xl border border-[hsl(var(--theme-border-default)/0.6)] bg-[hsl(var(--theme-bg-secondary))] overflow-hidden">
        <header className="px-5 pt-4 pb-3 border-b border-[hsl(var(--theme-border-default)/0.4)]">
          <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
            Account details
          </h3>
        </header>
        <dl className="divide-y divide-[hsl(var(--theme-border-default)/0.4)]">
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Mail className="w-4 h-4 text-[hsl(var(--theme-text-muted))] flex-shrink-0" />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">
                  Email address
                </dt>
                <dd className="text-sm text-[hsl(var(--theme-text-primary))] truncate mt-0.5">
                  {user?.email || 'Not set'}
                </dd>
              </div>
            </div>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <UserIcon className="w-4 h-4 text-[hsl(var(--theme-text-muted))] flex-shrink-0" />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">
                  Username
                </dt>
                <dd className="text-sm text-[hsl(var(--theme-text-primary))] truncate mt-0.5">
                  @{user?.username}
                </dd>
              </div>
            </div>
          </div>
        </dl>
      </section>

      {/* Bottom spacing */}
      <div className="h-4" />
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
    // In-app notification state
    const [dmNotifs, setDmNotifs] = useState(true);
    const [channelNotifs, setChannelNotifs] = useState(true);
    const [friendRequests, setFriendRequests] = useState(true);
    const [friendOnline, setFriendOnline] = useState(false);
    const [sounds, setSounds] = useState(true);

    // Email notification state
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [emailDms, setEmailDms] = useState(true);
    const [emailCommunity, setEmailCommunity] = useState(false);
    const [emailAgentNotifs, setEmailAgentNotifs] = useState(true);
    const [emailAgentSummaries, setEmailAgentSummaries] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    // Load ALL notification settings from backend
    useEffect(() => {
      const loadSettings = async () => {
        try {
          const { getNotificationSettings } = await import('@/services/authService');
          const settings = await getNotificationSettings();
          if (settings) {
            // In-app settings
            setDmNotifs(settings.notify_direct_messages ?? true);
            setChannelNotifs(settings.notify_channel_messages ?? true);
            setFriendRequests(settings.notify_friend_requests ?? true);
            setFriendOnline(settings.notify_friend_online ?? false);
            setSounds(settings.notification_sounds ?? true);
            // Email settings
            setEmailEnabled(settings.email_alerts_enabled ?? true);
            setEmailDms(settings.email_dms_and_calls ?? true);
            setEmailCommunity(settings.email_community_messages ?? false);
            setEmailAgentNotifs(settings.email_agent_notifications ?? true);
            setEmailAgentSummaries(settings.email_agent_summaries ?? true);
          }
        } catch (err) {
          console.error('Failed to load notification settings:', err);
        }
      };
      loadSettings();
    }, []);

    // Debounced save to backend (unified for all settings)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const saveSettings = (overrides: Record<string, boolean | number>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setIsSaving(true);
      setSaveStatus('idle');

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const { updateNotificationSettings } = await import('@/services/authService');
          await updateNotificationSettings(overrides);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
          console.error('Failed to save notification settings:', err);
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 3000);
        } finally {
          setIsSaving(false);
        }
      }, 600);
    };

    // In-app toggle helpers
    const toggleDmNotifs = () => { const next = !dmNotifs; setDmNotifs(next); saveSettings({ notify_direct_messages: next }); };
    const toggleChannelNotifs = () => { const next = !channelNotifs; setChannelNotifs(next); saveSettings({ notify_channel_messages: next }); };
    const toggleFriendRequests = () => { const next = !friendRequests; setFriendRequests(next); saveSettings({ notify_friend_requests: next }); };
    const toggleFriendOnline = () => { const next = !friendOnline; setFriendOnline(next); saveSettings({ notify_friend_online: next }); };
    const toggleSounds = () => { const next = !sounds; setSounds(next); saveSettings({ notification_sounds: next }); };

    // Email toggle helpers
    const toggleEmailEnabled = () => { const next = !emailEnabled; setEmailEnabled(next); saveSettings({ email_alerts_enabled: next }); };
    const toggleEmailDms = () => { const next = !emailDms; setEmailDms(next); saveSettings({ email_dms_and_calls: next }); };
    const toggleEmailCommunity = () => { const next = !emailCommunity; setEmailCommunity(next); saveSettings({ email_community_messages: next }); };
    const toggleEmailAgentNotifs = () => { const next = !emailAgentNotifs; setEmailAgentNotifs(next); saveSettings({ email_agent_notifications: next }); };
    const toggleEmailAgentSummaries = () => { const next = !emailAgentSummaries; setEmailAgentSummaries(next); saveSettings({ email_agent_summaries: next }); };
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <SettingsCard title="Messages" description={
          saveStatus === 'saved' ? '✓ Saved'
          : saveStatus === 'error' ? 'Failed to save'
          : 'Notification preferences for messages'
        }>
          <SettingRow 
            icon={MessageSquare} 
            title="Direct Messages"
            description="Notify me about direct messages"
          >
            <ToggleSwitch enabled={dmNotifs} onChange={toggleDmNotifs} />
          </SettingRow>
          <SettingRow 
            icon={Users} 
            title="Channel Messages"
            description="Notify me about channel messages"
          >
            <ToggleSwitch enabled={channelNotifs} onChange={toggleChannelNotifs} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Friends" description="Friend activity notifications">
          <SettingRow 
            icon={UserIcon} 
            title="Friend Requests"
            description="Notify me about new friend requests"
          >
            <ToggleSwitch enabled={friendRequests} onChange={toggleFriendRequests} />
          </SettingRow>
          <SettingRow 
            icon={Zap} 
            title="Friend Online Status"
            description="Notify me when friends come online"
          >
            <ToggleSwitch enabled={friendOnline} onChange={toggleFriendOnline} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Sound" description="Audio preferences">
          <SettingRow 
            icon={sounds ? Volume2 : VolumeX} 
            title="Notification Sounds"
            description="Play sounds for notifications"
          >
            <ToggleSwitch enabled={sounds} onChange={toggleSounds} />
          </SettingRow>
        </SettingsCard>

        {/* Email Notifications — persisted to backend */}
        <SettingsCard 
          title="Email Notifications" 
          description={
            saveStatus === 'saved' ? '✓ Saved' 
            : saveStatus === 'error' ? 'Failed to save' 
            : 'Receive email digests for missed activity'
          }
        >
          <SettingRow 
            icon={Mail} 
            title="Send Email Notifications"
            description="Master switch — turn off to stop all email alerts"
          >
            <ToggleSwitch enabled={emailEnabled} onChange={toggleEmailEnabled} />
          </SettingRow>
          
          {emailEnabled && (
            <>
              <SettingRow 
                icon={MessageSquare} 
                title="Direct Messages & Missed Calls"
                description="Email me about unread DMs and missed calls"
              >
                <ToggleSwitch enabled={emailDms} onChange={toggleEmailDms} />
              </SettingRow>
              <SettingRow 
                icon={Users} 
                title="Community Channel Mentions"
                description="Email me when I'm mentioned in community channels"
              >
                <ToggleSwitch enabled={emailCommunity} onChange={toggleEmailCommunity} />
              </SettingRow>
              <SettingRow 
                icon={Zap} 
                title="Agent Notifications"
                description="Email me about AI agent activity"
              >
                <ToggleSwitch enabled={emailAgentNotifs} onChange={toggleEmailAgentNotifs} />
              </SettingRow>
              <SettingRow 
                icon={Bot} 
                title="Agent Summaries"
                description="Email me when scheduled summaries are ready"
              >
                <ToggleSwitch enabled={emailAgentSummaries} onChange={toggleEmailAgentSummaries} />
              </SettingRow>
            </>
          )}
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

  // Community Admin Settings
  const CommunityAdminSettings = () => {
    const handleOpenCommunityDashboard = (communityId: number) => {
      localStorage.setItem('selectedDashboardCommunity', communityId.toString());
      navigate('/admin');
    };

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header Card */}
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">Community Administration</h3>
                <p className="text-sm text-[hsl(var(--theme-text-muted))]">Manage communities you own</p>
              </div>
            </div>
            <p className="text-sm text-[hsl(var(--theme-text-secondary))] leading-relaxed">
              Access the admin dashboard for your communities to manage members, moderate content, view analytics, and configure settings.
            </p>
          </div>
        </div>

        {/* Communities List */}
        <SettingsCard title="Your Communities" description="Select a community to open its admin dashboard">
          <div className="space-y-1 p-1">
            {ownedCommunities.map((community) => {
              const logoUrl = community.logo_url ? `${API_SERVER}${community.logo_url}` : null;
              return (
                <button
                  key={community.id}
                  onClick={() => handleOpenCommunityDashboard(community.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-[hsl(var(--theme-bg-hover))] transition-all duration-300 group"
                >
                  {/* Community Icon */}
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 shadow-md"
                    style={{ backgroundColor: !logoUrl ? (community.color || '#8B5CF6') : 'hsl(var(--theme-bg-secondary))' }}
                  >
                    {logoUrl ? (
                      <img src={logoUrl} alt={community.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-lg font-bold">
                        {community.icon || community.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[hsl(var(--theme-text-primary))] truncate">{community.name}</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                        <Crown className="w-2.5 h-2.5" />
                        Owner
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[hsl(var(--theme-text-muted))] flex items-center gap-1">
                        <Users className="w-3 h-3" /> {community.member_count ?? 0} members
                      </span>
                      <span className="text-xs text-[hsl(var(--theme-text-muted))]">
                        {community.channel_count ?? 0} channels
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-[hsl(var(--theme-text-muted))] hidden sm:block group-hover:text-[hsl(var(--theme-accent-primary))] transition-colors">Open Dashboard</span>
                    <ExternalLink className="w-4 h-4 text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-accent-primary))] transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </SettingsCard>

        {/* Quick Info */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-[hsl(var(--theme-accent-primary)/0.05)] border border-[hsl(var(--theme-accent-primary)/0.15)]">
          <BarChart3 className="w-5 h-5 flex-shrink-0 mt-0.5 text-[hsl(var(--theme-accent-primary))]" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">Dashboard Features</p>
            <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1">
              Analytics, moderation tools, member management, AI agent configuration, community health metrics, and detailed reports.
            </p>
          </div>
        </div>

        {/* System Admin Link (only for system admins) */}
        {isSystemAdmin && (
          <SettingsCard title="System Administration" description="Platform-wide administrative access">
            <button
              onClick={() => navigate('/system-admin')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-[hsl(var(--theme-bg-hover))] transition-all duration-300 group"
            >
              <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/25">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-[hsl(var(--theme-text-primary))]">System Admin Panel</p>
                <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">Platform-wide user management, moderation, and analytics</p>
              </div>
              <ExternalLink className="w-5 h-5 text-[hsl(var(--theme-text-muted))] group-hover:text-[hsl(var(--theme-accent-primary))] transition-colors" />
            </button>
          </SettingsCard>
        )}
      </div>
    );
  };

  const activeTabMeta = useMemo(
    () => tabs.find((t) => t.id === activeTab),
    [tabs, activeTab],
  );

  // ESC closes the modal — matches Discord's behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [navigate]);

  // Group tabs into logical sections so the sidebar reads like Discord.
  const tabGroups = useMemo(() => {
    const ids = new Set(tabs.map((t) => t.id));
    const pick = (...wanted: typeof activeTab[]) =>
      wanted.filter((id) => ids.has(id)).map((id) => tabs.find((t) => t.id === id)!);
    return [
      { label: 'User Settings', items: pick('profile', 'privacy', 'blocked') },
      { label: 'App Settings',  items: pick('appearance', 'general', 'notifications') },
      { label: 'Assistants',    items: pick('agents') },
      { label: 'Administration', items: pick('community-admin') },
    ].filter((g) => g.items.length > 0);
  }, [tabs]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 md:p-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) navigate(-1);
      }}
    >
      {/* Static blurred backdrop — painted once on its own GPU layer so the
          open animation never re-rasterizes the blur over the live page. */}
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-sm transform-gpu pointer-events-none"
      />
      {/* Dark tint — only the opacity fades, which the compositor handles cheaply. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[hsl(var(--theme-bg-primary)/0.45)] pointer-events-none animate-in fade-in duration-150"
      />
      <div
        className="relative flex h-full w-full max-w-[1180px] max-h-[92vh] overflow-hidden rounded-xl border border-[hsl(var(--theme-border-default)/0.6)] bg-[hsl(var(--theme-bg-primary))] text-[hsl(var(--theme-text-primary))] shadow-2xl shadow-black/40 transform-gpu will-change-transform animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Sidebar ───────────────────────────────────────── */}
        <aside className="hidden md:flex w-[232px] flex-shrink-0 flex-col border-r border-[hsl(var(--theme-border-default)/0.6)] bg-[hsl(var(--theme-bg-secondary))]">
          <div className="flex h-12 items-center px-5">
            <span
              id="settings-title"
              className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))]"
            >
              Settings
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
            {tabGroups.map((group, gi) => (
              <div key={group.label} className={gi === 0 ? '' : 'mt-4'}>
                <div className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))]">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-150 ${
                          isActive
                            ? 'bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] font-medium'
                            : 'text-[hsl(var(--theme-text-muted))] hover:bg-[hsl(var(--theme-bg-hover)/0.6)] hover:text-[hsl(var(--theme-text-primary))]'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0 opacity-80" />
                        <span className="flex-1 text-left truncate">{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-semibold bg-red-500 text-white">
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="px-4 py-3 border-t border-[hsl(var(--theme-border-default)/0.5)]">
            {isSystemAdmin && ownedCommunities.length === 0 && (
              <button
                onClick={() => navigate('/system-admin')}
                className="w-full mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>System Admin</span>
                <ExternalLink className="w-3 h-3 ml-auto" />
              </button>
            )}
            <p className="text-[11px] text-[hsl(var(--theme-text-muted))]">
              AuraFlow · v1.0.0
            </p>
          </div>
        </aside>

        {/* ── Mobile tab bar (sits at top of the floating panel) ── */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-10 border-b border-[hsl(var(--theme-border-default)/0.5)] bg-[hsl(var(--theme-bg-secondary))]">
          <div className="flex items-center px-3 py-2 gap-2">
            <div className="flex overflow-x-auto gap-1 flex-1 no-scrollbar">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors duration-150 ${
                      isActive
                        ? 'bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] font-medium'
                        : 'text-[hsl(var(--theme-text-muted))]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => navigate(-1)}
              className="flex-shrink-0 p-1.5 rounded-md text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Content pane ──────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto overscroll-contain bg-[hsl(var(--theme-bg-primary))] relative">
          {/* Desktop close button — matches Discord's top-right Esc indicator */}
          <button
            onClick={() => navigate(-1)}
            className="hidden md:flex absolute top-6 right-8 flex-col items-center gap-1 text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors group"
            title="Close (Esc)"
          >
            <span className="w-9 h-9 flex items-center justify-center rounded-full border border-[hsl(var(--theme-border-default))] group-hover:border-[hsl(var(--theme-text-primary))] transition-colors">
              <X className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-semibold">ESC</span>
          </button>

          <div className="max-w-2xl px-6 md:px-10 pt-20 md:pt-14 pb-16">
            <header className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight text-[hsl(var(--theme-text-primary))]">
                {activeTabMeta?.label}
              </h2>
              {activeTabMeta?.description && (
                <p className="mt-1 text-sm text-[hsl(var(--theme-text-muted))]">
                  {activeTabMeta.description}
                </p>
              )}
              <div className="mt-4 h-px bg-[hsl(var(--theme-border-default)/0.5)]" />
            </header>

            {activeTab === "profile" && <ProfileSettings />}
            {activeTab === "appearance" && <AppearanceSettings />}
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "privacy" && <PrivacySettings />}
            {activeTab === "notifications" && <NotificationSettings />}
            {activeTab === "agents" && <PersonalAgentsPanel />}
            {activeTab === "blocked" && <BlockedUsersSettings />}
            {activeTab === "community-admin" && <CommunityAdminSettings />}
          </div>
        </main>

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
    </div>
  );
}
