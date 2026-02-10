import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { Sparkles, MessageSquare, Users, Bot, ArrowRight } from "lucide-react";

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
      description: "Real-time collaboration",
    },
    {
      icon: Bot,
      title: "AI Agents",
      description: "Intelligent assistants",
    },
    {
      icon: Users,
      title: "Workspaces",
      description: "Organized projects",
    },
  ];

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className={`w-full max-w-lg rounded-2xl shadow-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        {/* Header */}
        <div className="p-6 pb-4 text-center border-b border-slate-200 dark:border-slate-700">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl mb-4 shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Welcome{user?.name ? `, ${user.name}` : ''} 👋
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Let's set up your workspace
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Description */}
          <div className={`mb-5 p-4 rounded-lg ${isDarkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>AuraFlow</span> helps your team chat, collaborate, and connect with AI agents for seamless communication.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className={`p-3 rounded-lg border text-center ${
                    isDarkMode 
                      ? 'bg-slate-700/50 border-slate-600' 
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="w-10 h-10 mx-auto bg-indigo-600 rounded-lg flex items-center justify-center mb-2">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className={`text-xs font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {feature.title}
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Continue Button */}
          <button
            onClick={onContinue}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
          >
            Continue Setup
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Progress */}
        <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-1 bg-indigo-600 rounded-full"></div>
            <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
            <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
          </div>
          <p className={`text-center text-[10px] mt-2 font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            STEP 1 OF 3
          </p>
        </div>
      </div>
    </div>
  );
}