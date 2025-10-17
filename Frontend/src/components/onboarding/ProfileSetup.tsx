import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { User, ArrowLeft, Loader } from "lucide-react";

interface ProfileSetupProps {
  onComplete: () => void;
  onBack: () => void;
}

export default function ProfileSetup({ onComplete, onBack }: ProfileSetupProps) {
  const { isDarkMode } = useTheme();
  const { user, updateUser } = useAuth(); 
  const [isLoading, setIsLoading] = useState(false);
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [bio, setBio] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (updateUser) {
        await updateUser({ name: displayName });
      }
      onComplete();
    } catch (error) {
      alert("Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-2xl p-8 md:p-12 rounded-2xl shadow-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-6">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className={`text-3xl md:text-4xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Set Up Your Profile
          </h1>
          <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Personalize your AuraFlow profile
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
              placeholder="Enter your display name"
              required
              className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Bio (Optional)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself"
              rows={3}
              className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <button
              type="button"
              onClick={onBack}
              className={`flex-1 py-4 bg-transparent border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2`}
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
            <button
              type="submit"
              disabled={isLoading || !displayName.trim()}
              className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2"
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