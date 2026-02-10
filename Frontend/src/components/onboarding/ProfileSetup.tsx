import { useState, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { getAvatarUrl } from "@/lib/utils";
import { User, ArrowLeft, Loader, Camera, X, Check } from "lucide-react";

interface ProfileSetupProps {
  onComplete: () => void;
  onBack: () => void;
}

export default function ProfileSetup({ onComplete, onBack }: ProfileSetupProps) {
  const { isDarkMode } = useTheme();
  const { user, updateProfile, completeOnboarding } = useAuth(); 
  const [isLoading, setIsLoading] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  const removeAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }

    setIsLoading(true);

    try {
      await updateProfile({
        display_name: displayName,
        bio: bio || undefined,
        avatar: avatarFile || undefined,
      });

      await completeOnboarding();
      onComplete();
    } catch (err: any) {
      console.error("Failed to update profile:", err);
      setError(err.message || "Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getAvatarDisplay = () => {
    if (avatarPreview) {
      return avatarPreview;
    }
    return getAvatarUrl(user?.avatar_url, user?.username || 'default');
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className={`w-full max-w-lg rounded-2xl shadow-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        {/* Header */}
        <div className={`p-6 pb-4 text-center border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl mb-4 shadow-lg shadow-indigo-500/25">
            <User className="w-7 h-7 text-white" />
          </div>
          <h1 className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Set Up Profile
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Personalize your account
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Message */}
          {error && (
            <div className={`mb-4 p-3 rounded-lg border text-sm ${isDarkMode ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}`}>
              {error}
            </div>
          )}

          {/* Avatar Upload */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className={`w-20 h-20 rounded-full overflow-hidden border-3 ${
                isDarkMode ? 'border-slate-600' : 'border-slate-200'
              }`}>
                <img 
                  src={getAvatarDisplay()} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all"
              >
                <Camera className="w-4 h-4" />
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="absolute -top-1 -right-1 p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all"
                >
                  <X className="w-3 h-3" />
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

          {/* Username Badge */}
          <div className={`mb-5 px-3 py-2 rounded-lg text-center ${isDarkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Username: </span>
            <span className={`text-sm font-medium ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
              @{user?.username}
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                required
                className={`w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDarkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Bio <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                rows={2}
                maxLength={200}
                className={`w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
                  isDarkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
              <p className={`text-[10px] mt-1 text-right ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {bio.length}/200
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onBack}
                className={`flex-1 py-3 border rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  isDarkMode
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="submit"
                disabled={isLoading || !displayName.trim()}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Complete
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer Progress */}
        <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center justify-center gap-2">
            <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
            <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
            <div className="w-8 h-1 bg-indigo-600 rounded-full"></div>
          </div>
          <p className={`text-center text-[10px] mt-2 font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            STEP 3 OF 3
          </p>
        </div>
      </div>
    </div>
  );
}
