import { useState, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { getAvatarUrl } from "@/lib/utils";
import { User, ArrowLeft, Loader, Camera, X } from "lucide-react";

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
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      
      setAvatarFile(file);
      
      // Create preview
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
      // Update profile with display_name, bio, and avatar
      await updateProfile({
        display_name: displayName,
        bio: bio || undefined,
        avatar: avatarFile || undefined,
      });

      // Complete onboarding
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
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50'}`}>
      <div className={`w-full max-w-2xl p-8 md:p-12 rounded-3xl shadow-2xl backdrop-blur-sm ${isDarkMode ? 'bg-slate-800/90 border border-slate-700/50' : 'bg-white/90 border border-gray-200/50'}`}>
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-6 shadow-lg">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className={`text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent`}>
            Set Up Your Profile
          </h1>
          <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Personalize your AuraFlow experience
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${isDarkMode ? 'bg-red-900/20 border-red-700 text-red-400' : 'bg-red-50 border-red-300 text-red-600'}`}>
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Avatar Upload Section */}
        <div className="mb-8">
          <div className="flex flex-col items-center gap-4">
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
              {avatarPreview && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className={`absolute top-0 right-0 p-2 rounded-full shadow-lg transition-all ${
                    isDarkMode 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  <X className="w-4 h-4" />
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
            <p className={`text-sm text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Click the camera icon to upload a profile picture
              <br />
              <span className="text-xs">Maximum size: 5MB</span>
            </p>
          </div>
        </div>

        {/* Current Username Display */}
        <div className={`mb-6 p-4 rounded-xl border-2 border-dashed ${isDarkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-300 bg-gray-50'}`}>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Your registration username:</p>
          <p className={`text-lg font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            @{user?.username}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Display Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we call you?"
              required
              className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              This is how other users will see your name in the community
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Bio (Optional)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself. What are your interests, skills, or what brings you here?"
              rows={4}
              maxLength={500}
              className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              {bio.length}/500 characters
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 pt-4">
            <button
              type="button"
              onClick={onBack}
              className={`flex-1 py-4 border-2 rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 ${
                isDarkMode
                  ? 'border-blue-600 text-blue-400 hover:bg-blue-600/10'
                  : 'border-blue-600 text-blue-600 hover:bg-blue-50'
              }`}
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
            <button
              type="submit"
              disabled={isLoading || !displayName.trim()}
              className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Complete Setup →"
              )}
            </button>
          </div>
        </form>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <div className={`w-8 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
          <div className={`w-8 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
          <div className="w-8 h-1.5 bg-blue-600 rounded-full"></div>
        </div>
        <p className={`text-center text-xs mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Step 3 of 3
        </p>
      </div>
    </div>
  );
}