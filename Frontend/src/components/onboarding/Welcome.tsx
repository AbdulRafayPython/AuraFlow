import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { Sparkles, MessageSquare, Users, Bot } from "lucide-react";

interface WelcomeProps {
  onContinue: () => void;
}

export default function Welcome({ onContinue }: WelcomeProps) {
  const { isDarkMode } = useTheme();
  const { user } = useAuth();

  const features = [
    {
      icon: MessageSquare,
      title: "Team Chat",
      description: "Collaborate in real-time with your team",
    },
    {
      icon: Bot,
      title: "AI Agents",
      description: "Connect with intelligent AI assistants",
    },
    {
      icon: Users,
      title: "Workspaces",
      description: "Organize teams and projects efficiently",
    },
  ];

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-2xl p-8 md:p-12 rounded-2xl shadow-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Logo & Welcome */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className={`text-3xl md:text-4xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Welcome, {user?.name || 'there'} 👋
          </h1>
          <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Let's set up your workspace and get you started
          </p>
        </div>

        {/* Description */}
        <div className={`mb-10 p-6 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-blue-50'}`}>
          <p className={`text-base leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            <strong className={isDarkMode ? 'text-white' : 'text-gray-900'}>AuraFlow</strong> helps your team chat, collaborate, 
            and connect with AI agents. Experience seamless communication with intelligent automation.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className={`p-5 rounded-xl border ${
                  isDarkMode 
                    ? 'bg-slate-700 border-slate-600' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {feature.title}
                </h3>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Continue Button */}
        <button
          onClick={onContinue}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold text-lg transition-all transform hover:scale-[1.02] shadow-lg"
        >
          Continue Setup →
        </button>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <div className="w-8 h-1.5 bg-blue-600 rounded-full"></div>
          <div className={`w-8 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
          <div className={`w-8 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
        </div>
        <p className={`text-center text-xs mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Step 1 of 3
        </p>
      </div>
    </div>
  );
}