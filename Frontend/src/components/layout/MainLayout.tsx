import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import ServerList from "../sidebar/ServerList";
import ChannelSidebar from "../sidebar/ChannelSidebar";
import RightSidebar from "../sidebar/RightSidebar";
import { useTheme } from "@/contexts/ThemeContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isDarkMode } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState("1");

  return (
    <div className={`flex h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-100'}`}>
      {/* Desktop: Server List Sidebar - HIDDEN (Not in AuraFlow design) */}
      <div className="hidden">
        <ServerList selectedServer={selectedServer} onServerSelect={setSelectedServer} />
      </div>

      {/* Desktop: Channel Sidebar (Left) */}
      <div className={`hidden md:flex md:w-60 border-r ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <ChannelSidebar />
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg ${
          isDarkMode 
            ? 'bg-slate-800 text-white hover:bg-slate-700' 
            : 'bg-white text-gray-900 hover:bg-gray-100'
        } shadow-lg`}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex bg-black bg-opacity-50">
          <div className={`w-60 ${isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
            <ChannelSidebar />
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>

      {/* Right Sidebar (Mood Trends) */}
      <div className={`hidden lg:flex lg:w-60 border-l ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <RightSidebar />
      </div>
    </div>
  );
}