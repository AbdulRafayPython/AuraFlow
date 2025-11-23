import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

interface RightSidebarProps {
  isCollapsed: boolean;
}

const sentiments = ["Happy", "Hopeful", "Neutral"];

export default function RightSidebar({ isCollapsed }: RightSidebarProps) {
  const { isDarkMode } = useTheme();

  return (
    <div className={`relative flex flex-col h-full transition-all duration-200 ${
      isCollapsed ? 'w-0 overflow-hidden' : 'w-64'
    }`}>
      {!isCollapsed && (
        <div className={`flex flex-col h-full ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {/* Header */}
          <div className={`px-4 h-12 flex items-center border-b ${
            isDarkMode ? 'border-slate-700/50 bg-slate-800' : 'border-gray-200 bg-white'
          }`}>
            <div className="flex items-center justify-between w-full">
              <h3 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Mood Trends
              </h3>
              <div className="flex items-center gap-2">
                <button className={`p-1.5 rounded transition-colors ${
                  isDarkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mood Chart */}
          <div className="px-4 py-3">
            <div className={`h-36 rounded-lg relative overflow-hidden border ${
              isDarkMode 
                ? 'bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-slate-600' 
                : 'bg-gradient-to-r from-purple-50 to-blue-50 border-gray-200'
            }`}>
              <svg className="w-full h-full p-3" viewBox="0 0 300 150">
                <text x="5" y="20" className={`text-[10px] ${isDarkMode ? 'fill-gray-400' : 'fill-gray-600'}`}>20</text>
                <text x="5" y="65" className={`text-[10px] ${isDarkMode ? 'fill-gray-400' : 'fill-gray-600'}`}>20</text>
                <text x="8" y="115" className={`text-[10px] ${isDarkMode ? 'fill-gray-400' : 'fill-gray-600'}`}>10</text>
                <text x="12" y="140" className={`text-[10px] ${isDarkMode ? 'fill-gray-400' : 'fill-gray-600'}`}>0</text>
                <path
                  d="M 30 90 Q 60 70 90 75 T 150 65 T 210 50 T 270 40"
                  fill="none"
                  stroke="rgb(99, 102, 241)"
                  strokeWidth="2"
                />
                <path
                  d="M 30 90 Q 60 70 90 75 T 150 65 T 210 50 T 270 40 L 270 150 L 30 150 Z"
                  fill="rgba(99, 102, 241, 0.1)"
                />
              </svg>
              <div className={`absolute bottom-1.5 left-0 right-0 flex justify-around text-[10px] px-4 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
              </div>
            </div>
          </div>

          {/* Recent Sentiments */}
          <div className="px-4 pb-3">
            <h4 className={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Recent Sentiments
            </h4>
            <div className="space-y-1.5">
              {sentiments.map((sentiment, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 rounded text-sm cursor-pointer transition-colors border ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600' 
                      : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  {sentiment}
                </div>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />
        </div>
      )}

      {/* Collapse/Expand Button */}
      {/* <button
        className={`absolute -left-3 top-3 z-50 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-lg ${
          isDarkMode ? 'bg-slate-700 hover:bg-slate-600 border border-slate-600' : 'bg-gray-700 hover:bg-gray-600 border border-gray-600'
        }`}
        title={isCollapsed ? "Expand AI Agents Sidebar" : "Collapse AI Agents Sidebar"}
      >
        {isCollapsed ? <ChevronLeft className="w-3.5 h-3.5 text-white" /> : <ChevronRight className="w-3.5 h-3.5 text-white" />}
      </button> */}
    </div>
  );
}
