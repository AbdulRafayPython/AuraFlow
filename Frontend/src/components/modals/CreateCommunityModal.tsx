// components/modals/CreateCommunityModal.tsx
import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { X, Sparkles } from "lucide-react";

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCommunity: (data: CommunityFormData) => Promise<void>;
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
  const [formData, setFormData] = useState<CommunityFormData>({
    name: '',
    description: '',
    icon: 'AF',
    color: '#8B5CF6',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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
      await onCreateCommunity(formData);
      // Reset form
      setFormData({
        name: '',
        description: '',
        icon: 'AF',
        color: '#8B5CF6',
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create community');
    } finally {
      setIsLoading(false);
    }
  };

  const generateIcon = () => {
    if (formData.name.length >= 2) {
      const words = formData.name.trim().split(' ');
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return formData.name.substring(0, 2).toUpperCase();
    }
    return 'AF';
  };

  const handleNameChange = (value: string) => {
    setFormData({ ...formData, name: value, icon: generateIcon() });
  };

  if (!isOpen) return null;

  return (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
    {/* Premium Modal Container */}
    <div
      className={`
        w-full max-w-md rounded-3xl shadow-2xl border
        max-h-[90vh] overflow-y-auto
        scrollbar-thin scrollbar-thumb-rounded-full
        ${isDarkMode 
          ? 'bg-slate-900/95 border-slate-700/50 backdrop-blur-xl scrollbar-thumb-slate-600' 
          : 'bg-white/95 border-gray-200/70 backdrop-blur-xl scrollbar-thumb-gray-400'
        }
        scrollbar-track-transparent hover-scrollbar-thumb
      `}
      style={{
        // Custom scrollbar for Webkit (Chrome, Safari, Edge)
        scrollbarWidth: 'thin',
        scrollbarColor: isDarkMode 
          ? '#64748b transparent'  // thumb / track
          : '#94a3b8 transparent',
      }}
    >
      {/* Webkit-specific scrollbar styling */}
      <style>{`
        div::-webkit-scrollbar {
          width: 10px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 12px;
        }
        div::-webkit-scrollbar-thumb {
          background-color: ${isDarkMode ? '#64748b' : '#94a3b8'};
          border-radius: 12px;
          border: 3px solid ${isDarkMode ? '#1e293b' : 'white'};
          background-clip: padding-box;
        }
        div:hover::-webkit-scrollbar-thumb {
          background-color: ${isDarkMode ? '#94a3b8' : '#64748b'};
        }
      `}</style>

      {/* Header - Elegant */}
      <div
        className={`flex items-center justify-between p-5 border-b ${
          isDarkMode ? 'border-slate-700/70' : 'border-gray-200/70'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Sparkles className="w-5 h-5 text-white drop-shadow-sm" />
          </div>
          <h2 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Create Community
          </h2>
        </div>
        <button
          onClick={onClose}
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            isDarkMode 
              ? 'hover:bg-slate-800/80 text-gray-400' 
              : 'hover:bg-gray-100 text-gray-600'
          } active:scale-95`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-sm">
            <p className="text-red-400 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Icon Preview - Floating style */}
        <div className="flex justify-center -mt-3 mb-2">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center font-bold text-2xl text-white shadow-2xl ring-4 ring-white/20"
            style={{ backgroundColor: formData.color }}
          >
            {formData.icon || 'AF'}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label className={`block text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Community Name <span className="text-purple-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Awesome Friends"
            maxLength={50}
            className={`w-full px-4 py-3 rounded-2xl border text-base font-medium transition-all duration-200
              ${isDarkMode
                ? 'bg-slate-800/70 border-slate-600 text-white placeholder-gray-500 focus:border-purple-500'
                : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
              } focus:outline-none focus:ring-4 focus:ring-purple-500/20`}
            disabled={isLoading}
          />
          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-600'} text-right`}>
            {formData.name.length}/50
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className={`block text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Description <span className="text-gray-500 font-normal">(Optional)</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="What's your community about?"
            rows={2}
            maxLength={200}
            className={`w-full px-4 py-3 rounded-2xl border resize-none transition-all duration-200
              ${isDarkMode
                ? 'bg-slate-800/70 border-slate-600 text-white placeholder-gray-500 focus:border-purple-500'
                : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
              } focus:outline-none focus:ring-4 focus:ring-purple-500/20`}
            disabled={isLoading}
          />
          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-600'} text-right`}>
            {formData.description.length}/200
          </p>
        </div>

        {/* Color Picker */}
        <div className="space-y-3">
          <label className={`block text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
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
                    ? 'ring-4 ring-purple-500/50 scale-110 shadow-xl' 
                    : 'hover:scale-105 hover:shadow-lg'
                  }`}
                style={{ backgroundColor: color }}
                disabled={isLoading}
              />
            ))}
          </div>
        </div>

        {/* Custom Icon */}
        <div className="space-y-2">
          <label className={`block text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Custom Icon <span className="text-gray-500 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            value={formData.icon}
            onChange={(e) => setFormData({ ...formData, icon: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="AF"
            maxLength={2}
            className={`w-full px-4 py-3 rounded-2xl border text-center font-bold text-xl tracking-wider transition-all
              ${isDarkMode
                ? 'bg-slate-800/70 border-slate-600 text-white placeholder-gray-500 focus:border-purple-500'
                : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
              } focus:outline-none focus:ring-4 focus:ring-purple-500/20`}
            disabled={isLoading}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={`flex-1 py-3.5 rounded-2xl font-semibold transition-all duration-200
              ${isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700/80 text-gray-300'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
              } active:scale-98`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !formData.name.trim()}
            className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-60 active:scale-98"
          >
            {isLoading ? 'Creating...' : 'Create Community'}
          </button>
        </div>
      </form>
    </div>
  </div>
);
}