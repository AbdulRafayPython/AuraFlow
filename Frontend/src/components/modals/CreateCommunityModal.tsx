// components/modals/CreateCommunityModal.tsx
import { useMemo, useState, type ChangeEvent } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { channelService } from "@/services/channelService";
import { useRealtime } from "@/hooks/useRealtime";
import type { Community } from "@/types";
import { X, Sparkles, ArrowRight, ArrowLeft, UploadCloud } from "lucide-react";

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCommunity: (data: CommunityFormData) => Promise<Community>;
}

export interface CommunityFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
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

export default function CreateCommunityModal({ isOpen, onClose, onCreateCommunity }: CreateCommunityModalProps) {
  const { isDarkMode } = useTheme();
  const { reloadCommunities, selectCommunity } = useRealtime();
  const [formData, setFormData] = useState<CommunityFormData>({
    name: '',
    description: '',
    icon: 'AF',
    color: '#8B5CF6',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    // If still on step 1, advance to step 2 instead of submitting
    if (step === 1) {
      setStep(2);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please log in again to create a community.');
      return;
    }

    if (!formData.name.trim()) {
      setError('Community name is required');
      return;
    }

    if (formData.name.length < 2 || formData.name.length > 50) {
      setError('Community name must be between 2 and 50 characters');
      return;
    }

    setIsLoading(true);
    try {
      const createdCommunity = await onCreateCommunity(formData);
      const communityId = createdCommunity?.id;

      if (communityId && (logoFile || bannerFile)) {
        setUploadingAssets(true);
        try {
          if (logoFile) {
            await channelService.uploadCommunityLogo(communityId, logoFile);
          }
          if (bannerFile) {
            await channelService.uploadCommunityBanner(communityId, bannerFile);
          }
        } catch (uploadErr: any) {
          const uploadMsg = uploadErr?.response?.data?.error || uploadErr?.message || 'Upload failed';
          setError(uploadMsg);
          return;
        } finally {
          setUploadingAssets(false);
        }
      }

      // Now that creation + optional uploads are done, refresh and select
      if (createdCommunity?.id) {
        try {
          await reloadCommunities();
          await selectCommunity(createdCommunity.id);
        } catch (selErr) {
          // Non-fatal; still proceed to close
          console.warn('[CreateCommunityModal] post-create selection failed:', selErr);
        }
      }

      setFormData({
        name: '',
        description: '',
        icon: 'AF',
        color: '#8B5CF6',
      });
      clearUploads();
      setStep(1);
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to create community';
      setError(message.includes('token') ? 'Please log in again to continue.' : message);
    } finally {
      setIsLoading(false);
      setUploadingAssets(false);
    }
  };

  const generateIcon = useMemo(() => {
    if (formData.name.length >= 2) {
      const words = formData.name.trim().split(' ');
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return formData.name.substring(0, 2).toUpperCase();
    }
    return 'AF';
  }, [formData.name]);

  const handleNameChange = (value: string) => {
    const newIcon = value.length >= 2 ? (
      value.trim().split(' ').length >= 2
        ? (value.trim().split(' ')[0][0] + value.trim().split(' ')[1][0]).toUpperCase()
        : value.substring(0, 2).toUpperCase()
    ) : 'AF';
    setFormData({ ...formData, name: value, icon: newIcon });
  };

  const handleStep1Enter = (e: React.KeyboardEvent) => {
    if (step === 1 && e.key === 'Enter') {
      e.preventDefault();
      if (formData.name.trim()) setStep(2);
    }
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be 5MB or smaller');
      return;
    }

    setError('');
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Banner must be 5MB or smaller');
      return;
    }

    setError('');
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };

  const clearUploads = () => {
    setLogoFile(null);
    setBannerFile(null);
    setLogoPreview(null);
    setBannerPreview(null);
  };

  if (!isOpen) return null;

  const isBusy = isLoading || uploadingAssets;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-2xl rounded-3xl shadow-2xl border max-h-[80vh] overflow-hidden flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--theme-border-default))]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white drop-shadow-sm" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[hsl(var(--theme-text-primary))]">
                Create Community
              </h2>
              <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                2-step setup: details → branding
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-3 border-b border-[hsl(var(--theme-border-default))]">
          <div className="flex items-center gap-3">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                    step === s
                      ? 'bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-lg'
                      : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))]'
                  }`}
                >
                  {s}
                </div>
                <span className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                  {s === 1 ? 'Details' : 'Branding'}
                </span>
                {s === 1 && (
                  <div className="h-px w-10 bg-[hsl(var(--theme-border-default))]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <form 
            className="p-6 space-y-6"
            onKeyDown={(e) => {
              if (step === 1 && e.key === 'Enter') {
                e.preventDefault();
                if (formData.name.trim()) setStep(2);
              }
            }}
          >
            {/* Error */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Step 1: Details */}
            {step === 1 && (
              <div className="space-y-6">
                {/* Icon Preview */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-lg ring-4 ring-white/10"
                    style={{ backgroundColor: formData.color }}
                  >
                    {generateIcon}
                  </div>
                  <div>
                    <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                      Icon auto-generated from the name.
                    </p>
                    <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                      You can adjust the color in the next step.
                    </p>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                    Community Name <span className="text-[hsl(var(--theme-accent-primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onKeyDown={handleStep1Enter}
                    placeholder="e.g., Product Builders"
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-2xl border text-base font-medium transition-all duration-200 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--theme-accent-primary))]/20"
                    disabled={isBusy}
                  />
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] text-right">
                    {formData.name.length}/50
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                    Description <span className="text-[hsl(var(--theme-text-muted))] font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    onKeyDown={handleStep1Enter}
                    placeholder="What's your community about?"
                    rows={3}
                    maxLength={200}
                    className="w-full px-4 py-3 rounded-2xl border resize-none transition-all duration-200 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--theme-accent-primary))]/20"
                    disabled={isBusy}
                  />
                  <p className="text-xs text-[hsl(var(--theme-text-muted))] text-right">
                    {formData.description.length}/200
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Branding */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Color Picker */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                    Community Color
                  </label>
                  <div className="grid grid-cols-8 gap-3">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-11 h-11 rounded-2xl transition-all duration-200 shadow-md
                          ${formData.color === color 
                            ? 'ring-4 ring-[hsl(var(--theme-accent-primary))]/50 scale-110 shadow-xl' 
                            : 'hover:scale-105 hover:shadow-lg'
                          }`}
                        style={{ backgroundColor: color }}
                        disabled={isBusy}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Used for the badge and avatar background.
                  </p>
                </div>

                {/* Auto Icon Preview */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
                    Auto Icon
                  </label>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-lg"
                      style={{ backgroundColor: formData.color }}
                    >
                      {generateIcon}
                    </div>
                    <p className="text-sm text-[hsl(var(--theme-text-secondary))]">
                      Generated from the community name.
                    </p>
                  </div>
                </div>
                {/* Uploads */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border-2 border-dashed p-4 space-y-3 transition-all border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Logo (optional)</p>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))]">Up to 5MB, square works best.</p>
                      </div>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                          className="text-xs font-medium text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]"
                          disabled={isBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <label
                      htmlFor="community-logo-upload"
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-5 cursor-pointer transition-all border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-tertiary))] ${isLoading || uploadingAssets ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo preview" className="w-16 h-16 rounded-lg object-cover" />
                      ) : (
                        <UploadCloud className="w-6 h-6 text-[hsl(var(--theme-text-muted))]" />
                      )}
                      <span className="text-xs font-medium text-[hsl(var(--theme-text-primary))]">
                        {logoFile ? logoFile.name : 'Upload logo image'}
                      </span>
                    </label>
                    <input
                      id="community-logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                      disabled={isBusy}
                    />
                  </div>

                  <div className="rounded-2xl border-2 border-dashed p-4 space-y-3 transition-all border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">Banner (optional)</p>
                        <p className="text-xs text-[hsl(var(--theme-text-muted))]">Up to 5MB. Wide images recommended.</p>
                      </div>
                      {bannerFile && (
                        <button
                          type="button"
                          onClick={() => { setBannerFile(null); setBannerPreview(null); }}
                          className="text-xs font-medium text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]"
                          disabled={isBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <label
                      htmlFor="community-banner-upload"
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-5 cursor-pointer transition-all border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-accent-primary))] bg-[hsl(var(--theme-bg-tertiary))] ${isLoading || uploadingAssets ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {bannerPreview ? (
                        <img src={bannerPreview} alt="Banner preview" className="w-full h-16 rounded-lg object-cover" />
                      ) : (
                        <UploadCloud className="w-6 h-6 text-[hsl(var(--theme-text-muted))]" />
                      )}
                      <span className="text-xs font-medium text-[hsl(var(--theme-text-primary))]">
                        {bannerFile ? bannerFile.name : 'Upload banner image'}
                      </span>
                    </label>
                    <input
                      id="community-banner-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleBannerChange}
                      disabled={isBusy}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={step === 1 ? onClose : () => setStep(1)}
                disabled={isBusy}
                className="flex-1 py-3 rounded-2xl font-semibold transition-all duration-200 bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] active:scale-98"
              >
                {step === 1 ? 'Cancel' : (
                  <span className="flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </span>
                )}
              </button>

              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isBusy || !formData.name.trim()}
                  className="flex-1 py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 active:scale-98"
                >
                  <span className="flex items-center justify-center gap-2">
                    Next <ArrowRight className="w-4 h-4" />
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e)}
                  disabled={isBusy || !formData.name.trim()}
                  className="flex-1 py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] hover:shadow-[var(--theme-glow-primary)] shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 active:scale-98"
                >
                  {isLoading ? 'Creating...' : 'Create Community'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}