// components/modals/CommunitySettingsModal.tsx
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Camera, Trash2, Upload, Image as ImageIcon, Loader2, Check, AlertCircle } from "lucide-react";
import { channelService } from "@/services/channelService";
import { useNotifications } from "@/hooks/useNotifications";
import { Community } from "@/types";

interface CommunitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  community: Community | null;
  onCommunityUpdated?: (community: Community) => void;
}

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export default function CommunitySettingsModal({
  isOpen,
  onClose,
  community,
  onCommunityUpdated,
}: CommunitySettingsModalProps) {
  const { isDarkMode } = useTheme();
  const { showSuccess, showError } = useNotifications();
  
  const [name, setName] = useState(community?.name || "");
  const [description, setDescription] = useState(community?.description || "");
  const [icon, setIcon] = useState(community?.icon || "");
  const [color, setColor] = useState(community?.color || "#8B5CF6");
  
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const isOwnerOrAdmin = community?.role === 'owner' || community?.role === 'admin';

  // Reset form when community changes
  useEffect(() => {
    if (community) {
      setName(community.name || "");
      setDescription(community.description || "");
      setIcon(community.icon || "");
      setColor(community.color || "#8B5CF6");
      setLogoPreview(community.logo_url ? `${API_BASE}${community.logo_url}` : null);
      setBannerPreview(community.banner_url ? `${API_BASE}${community.banner_url}` : null);
      setLogoFile(null);
      setBannerFile(null);
    }
  }, [community]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showError({ title: "File too large. Maximum 5MB allowed." });
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showError({ title: "File too large. Maximum 5MB allowed." });
        return;
      }
      setBannerFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBannerPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile || !community) return;
    
    setUploadingLogo(true);
    try {
      const result = await channelService.uploadCommunityLogo(community.id, logoFile);
      showSuccess({ title: "Logo uploaded successfully!" });
      setLogoFile(null);
      setLogoPreview(`${API_BASE}${result.logo_url}`);
      onCommunityUpdated?.({ ...community, logo_url: result.logo_url });
    } catch (error: any) {
      showError({ title: error.message || "Failed to upload logo" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!community) return;
    
    setUploadingLogo(true);
    try {
      await channelService.removeCommunityLogo(community.id);
      showSuccess({ title: "Logo removed successfully!" });
      setLogoPreview(null);
      setLogoFile(null);
      onCommunityUpdated?.({ ...community, logo_url: undefined });
    } catch (error: any) {
      showError({ title: error.message || "Failed to remove logo" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUploadBanner = async () => {
    if (!bannerFile || !community) return;
    
    setUploadingBanner(true);
    try {
      const result = await channelService.uploadCommunityBanner(community.id, bannerFile);
      showSuccess({ title: "Banner uploaded successfully!" });
      setBannerFile(null);
      setBannerPreview(`${API_BASE}${result.banner_url}`);
      onCommunityUpdated?.({ ...community, banner_url: result.banner_url });
    } catch (error: any) {
      showError({ title: error.message || "Failed to upload banner" });
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveBanner = async () => {
    if (!community) return;
    
    setUploadingBanner(true);
    try {
      await channelService.removeCommunityBanner(community.id);
      showSuccess({ title: "Banner removed successfully!" });
      setBannerPreview(null);
      setBannerFile(null);
      onCommunityUpdated?.({ ...community, banner_url: undefined });
    } catch (error: any) {
      showError({ title: error.message || "Failed to remove banner" });
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!community) return;
    
    setIsLoading(true);
    try {
      const updatedCommunity = await channelService.updateCommunity(community.id, {
        name,
        description,
        icon,
        color,
      });
      
      showSuccess({ title: "Settings saved successfully!" });
      onCommunityUpdated?.(updatedCommunity);
    } catch (error: any) {
      showError({ title: error.message || "Failed to save settings" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !community) return null;

  const colorOptions = [
    "#8B5CF6", "#6366F1", "#3B82F6", "#06B6D4", "#10B981",
    "#22C55E", "#EAB308", "#F97316", "#EF4444", "#EC4899",
    "#8B5CF6", "#A855F7", "#D946EF", "#F43F5E", "#64748B"
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl">
        {/* Banner Section */}
        <div className="relative h-40 overflow-hidden">
          {bannerPreview ? (
            <img 
              src={bannerPreview} 
              alt="Community Banner" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              className="w-full h-full"
              style={{ backgroundColor: color }}
            />
          )}
          
          {/* Banner Overlay Actions */}
          {isOwnerOrAdmin && (
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerChange}
                className="hidden"
              />
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {uploadingBanner ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {bannerFile ? "Change" : "Upload Banner"}
              </button>
              
              {bannerFile && (
                <button
                  onClick={handleUploadBanner}
                  disabled={uploadingBanner}
                  className="px-4 py-2 bg-green-500/80 hover:bg-green-500 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  {uploadingBanner ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Save
                </button>
              )}
              
              {bannerPreview && !bannerFile && (
                <button
                  onClick={handleRemoveBanner}
                  disabled={uploadingBanner}
                  className="px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              )}
            </div>
          )}
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Logo Section - Overlapping */}
        <div className="relative px-6">
          <div className="absolute -top-12 left-6">
            <div className="relative group">
              <div 
                className="w-24 h-24 rounded-2xl border-4 overflow-hidden flex items-center justify-center border-[hsl(var(--theme-bg-elevated))] bg-[hsl(var(--theme-bg-secondary))]"
                style={{ backgroundColor: !logoPreview ? color : undefined }}
              >
                {logoPreview ? (
                  <img 
                    src={logoPreview} 
                    alt="Community Logo" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white text-2xl font-bold">
                    {icon || name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </span>
                )}
              </div>
              
              {/* Logo Actions Overlay */}
              {isOwnerOrAdmin && (
                <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {/* Logo Upload Actions */}
            {isOwnerOrAdmin && (logoFile || (logoPreview && community.logo_url)) && (
              <div className="flex gap-1 mt-2">
                {logoFile && (
                  <button
                    onClick={handleUploadLogo}
                    disabled={uploadingLogo}
                    className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded text-white text-xs font-medium flex items-center gap-1"
                  >
                    {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                )}
                {logoPreview && !logoFile && community.logo_url && (
                  <button
                    onClick={handleRemoveLogo}
                    disabled={uploadingLogo}
                    className="px-2 py-1 bg-red-500 hover:bg-red-600 rounded text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="pt-16 px-6 pb-6 max-h-[60vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-6 text-[hsl(var(--theme-text-primary))]">
            Community Settings
          </h2>

          {!isOwnerOrAdmin && (
            <div className="flex items-start gap-3 p-4 rounded-xl mb-6 bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">
                Only owners and admins can modify community settings.
              </p>
            </div>
          )}

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                Community Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwnerOrAdmin}
                className="w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] disabled:opacity-50"
                placeholder="Enter community name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isOwnerOrAdmin}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] resize-none bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] disabled:opacity-50"
                placeholder="What's this community about?"
              />
            </div>

            {/* Icon */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                Icon (2 characters max)
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value.slice(0, 2))}
                disabled={!isOwnerOrAdmin}
                maxLength={2}
                className="w-24 px-4 py-3 rounded-xl border text-center font-bold transition-all focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] disabled:opacity-50"
                placeholder="AF"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                Theme Color
              </label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c}
                    onClick={() => isOwnerOrAdmin && setColor(c)}
                    disabled={!isOwnerOrAdmin}
                    className={`w-8 h-8 rounded-full transition-all ${
                      color === c ? "ring-2 ring-offset-2 ring-[hsl(var(--theme-accent-primary))] scale-110" : "hover:scale-105"
                    } ${!isOwnerOrAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          {isOwnerOrAdmin && (
            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-[hsl(var(--theme-border-default))]">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl font-medium transition-colors bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isLoading || !name.trim()}
                className="px-6 py-2.5 rounded-xl font-medium bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
