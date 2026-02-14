// components/modals/CreateCommunityModal.tsx
import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
          navigate(`/community/${createdCommunity.id}`);
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-[560px] rounded-2xl shadow-2xl border max-h-[85vh] overflow-hidden flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-subtle))] animate-in zoom-in-95 slide-in-from-bottom-2 duration-300"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--theme-border-subtle))]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] rounded-xl flex items-center justify-center shadow-md">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[hsl(var(--theme-text-primary))]">
                Create Community
              </h2>
              <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mt-0.5">
                Step {step} of 2 — {step === 1 ? 'Basic Details' : 'Branding'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all duration-150 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] active:scale-95"
            aria-label="Close modal"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Stepper - Refined Progress Indicator */}
        <div className="px-5 py-3 border-b border-[hsl(var(--theme-border-subtle))] bg-[hsl(var(--theme-bg-secondary)/0.3)]">
          <div className="flex items-center justify-center gap-2">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
                    step === s
                      ? 'bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-md'
                      : step > s
                        ? 'bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] border border-[hsl(var(--theme-accent-primary)/0.3)]'
                        : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default))]'
                  }`}
                >
                  {step > s ? '✓' : s}
                </div>
                <span className={`text-xs font-medium transition-colors ${
                  step === s ? 'text-[hsl(var(--theme-text-primary))]' : 'text-[hsl(var(--theme-text-muted))]'
                }`}>
                  {s === 1 ? 'Details' : 'Branding'}
                </span>
                {s === 1 && (
                  <div className={`h-0.5 w-12 rounded-full transition-colors duration-300 ${
                    step > 1 ? 'bg-[hsl(var(--theme-accent-primary))]' : 'bg-[hsl(var(--theme-border-default))]'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body - Scrollable content with custom minimal scrollbar */}
        <div className="flex-1 overflow-y-auto modal-scrollbar">
          <form 
            className="p-5 space-y-5"
            onKeyDown={(e) => {
              if (step === 1 && e.key === 'Enter') {
                e.preventDefault();
                if (formData.name.trim()) setStep(2);
              }
            }}
          >
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/8 border border-red-500/20 rounded-xl flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-400 text-[10px] font-bold">!</span>
                </div>
                <p className="text-red-400 text-[13px] leading-relaxed">{error}</p>
              </div>
            )}

            {/* Step 1: Details */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Icon Preview - Compact and refined */}
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-subtle))]">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-lg text-white shadow-md transition-all duration-300"
                    style={{ backgroundColor: formData.color }}
                  >
                    {generateIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[hsl(var(--theme-text-secondary))] leading-snug">
                      Icon auto-generated from name
                    </p>
                    <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mt-0.5">
                      Customize color in next step
                    </p>
                  </div>
                </div>

                {/* Name Field - Refined input styling */}
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
                      Community Name <span className="text-[hsl(var(--theme-accent-primary))] ml-0.5">*</span>
                    </span>
                    <span className="text-[11px] text-[hsl(var(--theme-text-muted))] tabular-nums">
                      {formData.name.length}/50
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onKeyDown={handleStep1Enter}
                    placeholder="e.g., Product Builders"
                    maxLength={50}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-150 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted)/0.7)] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]/15 hover:border-[hsl(var(--theme-border-hover))]"
                    disabled={isBusy}
                    autoFocus
                  />
                </div>

                {/* Description Field - Cleaner textarea */}
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
                      Description
                      <span className="text-[hsl(var(--theme-text-muted))] font-normal text-[11px] ml-1.5">Optional</span>
                    </span>
                    <span className="text-[11px] text-[hsl(var(--theme-text-muted))] tabular-nums">
                      {formData.description.length}/200
                    </span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    onKeyDown={handleStep1Enter}
                    placeholder="What's your community about?"
                    rows={3}
                    maxLength={200}
                    className="w-full px-3.5 py-2.5 rounded-xl border resize-none text-sm leading-relaxed transition-all duration-150 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted)/0.7)] focus:border-[hsl(var(--theme-accent-primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]/15 hover:border-[hsl(var(--theme-border-hover))]"
                    disabled={isBusy}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Branding */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Color Picker - Refined grid */}
                <div className="space-y-2.5">
                  <label className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
                    Community Color
                  </label>
                  <div className="grid grid-cols-8 gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-9 h-9 rounded-lg transition-all duration-150
                          ${formData.color === color 
                            ? 'ring-2 ring-offset-2 ring-offset-[hsl(var(--theme-bg-elevated))] ring-[hsl(var(--theme-accent-primary))] scale-105' 
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                          }`}
                        style={{ backgroundColor: color }}
                        disabled={isBusy}
                        aria-label={`Select ${color} color`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-[hsl(var(--theme-text-muted))]">
                    Used for badge and avatar background
                  </p>
                </div>

                {/* Auto Icon Preview - Compact card */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-subtle))]">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-semibold text-base text-white shadow-md transition-colors duration-200"
                    style={{ backgroundColor: formData.color }}
                  >
                    {generateIcon}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[hsl(var(--theme-text-primary))]">
                      {formData.name || 'Community Name'}
                    </p>
                    <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mt-0.5">
                      Icon preview
                    </p>
                  </div>
                </div>
                {/* Uploads - Refined upload zones */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Logo Upload */}
                  <div className="rounded-xl border border-dashed p-3 space-y-2 transition-all border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.4)] hover:border-[hsl(var(--theme-border-hover))]">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">Logo</p>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                          className="text-[10px] font-medium text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))] transition-colors"
                          disabled={isBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <label
                      htmlFor="community-logo-upload"
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-4 cursor-pointer transition-all duration-150 border-[hsl(var(--theme-border-subtle))] hover:border-[hsl(var(--theme-accent-primary)/0.5)] bg-[hsl(var(--theme-bg-tertiary)/0.5)] hover:bg-[hsl(var(--theme-bg-tertiary))] ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo preview" className="w-12 h-12 rounded-lg object-cover shadow-sm" />
                      ) : (
                        <UploadCloud className="w-5 h-5 text-[hsl(var(--theme-text-muted))]" />
                      )}
                      <span className="text-[11px] text-[hsl(var(--theme-text-muted))] text-center px-2 truncate max-w-full">
                        {logoFile ? logoFile.name : 'Square image'}
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

                  {/* Banner Upload */}
                  <div className="rounded-xl border border-dashed p-3 space-y-2 transition-all border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.4)] hover:border-[hsl(var(--theme-border-hover))]">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">Banner</p>
                      {bannerFile && (
                        <button
                          type="button"
                          onClick={() => { setBannerFile(null); setBannerPreview(null); }}
                          className="text-[10px] font-medium text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))] transition-colors"
                          disabled={isBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <label
                      htmlFor="community-banner-upload"
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-4 cursor-pointer transition-all duration-150 border-[hsl(var(--theme-border-subtle))] hover:border-[hsl(var(--theme-accent-primary)/0.5)] bg-[hsl(var(--theme-bg-tertiary)/0.5)] hover:bg-[hsl(var(--theme-bg-tertiary))] ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {bannerPreview ? (
                        <img src={bannerPreview} alt="Banner preview" className="w-full h-12 rounded-lg object-cover shadow-sm" />
                      ) : (
                        <UploadCloud className="w-5 h-5 text-[hsl(var(--theme-text-muted))]" />
                      )}
                      <span className="text-[11px] text-[hsl(var(--theme-text-muted))] text-center px-2 truncate max-w-full">
                        {bannerFile ? bannerFile.name : 'Wide image'}
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

            {/* Actions - Refined button styling with clear hierarchy */}
            <div className="flex gap-2.5 pt-3 border-t border-[hsl(var(--theme-border-subtle))] mt-1">
              <button
                type="button"
                onClick={step === 1 ? onClose : () => setStep(1)}
                disabled={isBusy}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 bg-[hsl(var(--theme-bg-secondary)/0.8)] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] active:scale-[0.98] disabled:opacity-50"
              >
                {step === 1 ? 'Cancel' : (
                  <span className="flex items-center justify-center gap-1.5">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </span>
                )}
              </button>

              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isBusy || !formData.name.trim()}
                  className="flex-[1.5] py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-sm hover:shadow-md hover:shadow-[hsl(var(--theme-accent-primary))/0.25] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    Continue <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e)}
                  disabled={isBusy || !formData.name.trim()}
                  className="flex-[1.5] py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] shadow-sm hover:shadow-md hover:shadow-[hsl(var(--theme-accent-primary))/0.25] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : 'Create Community'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}