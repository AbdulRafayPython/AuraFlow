/**
 * System Admin Dashboard Layout
 * Flat sidebar layout matching admin panel designs.
 */

import React, { useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Shield,
  Users,
  BarChart3,
  FileText,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Building2,
  Brain,
  Activity,
  Network,
  Search,
  Sun,
  Moon,
  Settings,
  ScrollText,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NotificationsBell from './NotificationsBell';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  end?: boolean;
  section?: string;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/system-admin', icon: LayoutDashboard, end: true },
  { title: 'Communities', href: '/system-admin/communities', icon: Building2 },
  { title: 'Members', href: '/system-admin/users', icon: Users },
  { title: 'Moderation', href: '/system-admin/moderation/flagged', icon: Shield },
  { title: 'Analytics', href: '/system-admin/analytics/engagement', icon: BarChart3 },
  { title: 'Reports', href: '/system-admin/reports', icon: FileText },
  { title: 'AI Agents', href: '/system-admin/agents', icon: Brain },
  { title: 'Agent Metrics', href: '/system-admin/analytics/agents', icon: Activity },
  { title: 'Agent Collaboration', href: '/system-admin/analytics/agent-collaboration', icon: Network },
  { title: 'Audit Logs', href: '/system-admin/audit-logs', icon: ScrollText },
  { title: 'Settings', href: '/system-admin/settings', icon: Settings },
];

export default function SystemAdminLayout() {
  const { user, logout, isLoading, isAuthenticated } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-[hsl(var(--theme-bg-primary))]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[hsl(var(--theme-accent-primary))] border-t-transparent rounded-full animate-spin" />
          <p className="text-[hsl(var(--theme-text-primary))] text-lg font-medium">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/system-admin/login" replace />;
  }

  if (user.role !== 'system_admin') {
    return <Navigate to="/system-admin/login" replace />;
  }

  const handleLogout = async () => {
    await logout();
    window.location.href = '/system-admin/login';
  };

  const isActiveRoute = (href: string, end?: boolean) => {
    if (end) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  const getPageTitle = () => {
    for (const item of navItems) {
      if (isActiveRoute(item.href, item.end)) return item.title;
    }
    return 'Dashboard';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--theme-bg-primary))] text-[hsl(var(--theme-text-primary))] font-display">
      {/* Mobile Menu Button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden h-10 w-10 rounded-xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-primary))] flex items-center justify-center text-[hsl(var(--theme-text-secondary))]"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-40 h-screen w-64 flex flex-col',
          'border-r border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)] backdrop-blur-md',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'transition-transform duration-300'
        )}
      >
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl overflow-hidden shadow-lg shadow-[hsl(var(--theme-accent-primary)/0.2)]">
            <img src="/AuraflowLogo.png" alt="AuraFlow" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--theme-text-primary))]">AuraFlow</h1>
            <p className="text-xs text-[hsl(var(--theme-text-muted))]">AI Communication</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1 py-4 overflow-y-auto">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={item.href}>
                {item.section && (
                  <div className="pt-6 pb-2 px-3">
                    <span className="text-[10px] text-[hsl(var(--theme-text-muted))] uppercase tracking-widest font-bold">{item.section}</span>
                  </div>
                )}
                <NavLink
                  to={item.href}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))] border border-[hsl(var(--theme-accent-primary)/0.2)]'
                        : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]'
                    )
                  }
                  onClick={() => setIsMobileOpen(false)}
                >
                  <Icon className="h-[22px] w-[22px] flex-shrink-0" />
                  <span>{item.title}</span>
                </NavLink>
              </React.Fragment>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 mt-auto border-t border-[hsl(var(--theme-border-default))]">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-[hsl(var(--theme-bg-hover))] transition-colors">
            <Avatar className="h-10 w-10 flex-shrink-0 border border-[hsl(var(--theme-border-default))]">
              <AvatarImage src={user.avatar_url || user.avatar} className="object-cover w-full h-full" />
              <AvatarFallback className="bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] text-sm font-medium">
                {user.display_name?.[0] || user.username?.[0] || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))] truncate">{user.display_name || user.username}</p>
              <p className="text-xs text-[hsl(var(--theme-text-muted))] truncate">Super Admin</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-[hsl(var(--theme-text-muted))] hover:text-red-400 transition-colors flex-shrink-0"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-[hsl(var(--theme-border-default))] sticky top-0 z-10 bg-[hsl(var(--theme-bg-primary)/0.8)] backdrop-blur-md">
          <div className="flex items-center text-sm gap-2">
            <span className="text-[hsl(var(--theme-text-secondary))]">Admin</span>
            <ChevronRight className="h-3 w-3 text-[hsl(var(--theme-text-muted))]" />
            <span className="text-[hsl(var(--theme-accent-primary))] font-medium">{getPageTitle()}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--theme-text-muted))]" />
              <input
                className="bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] focus:border-[hsl(var(--theme-accent-primary))] focus:ring-0 rounded-lg pl-10 pr-4 py-2 text-sm w-64 placeholder:text-[hsl(var(--theme-text-muted))] text-[hsl(var(--theme-text-primary))] transition-colors"
                placeholder="Search reports..."
                type="text"
              />
            </div>
            <button
              onClick={toggleTheme}
              className="w-10 h-10 flex items-center justify-center text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))] rounded-lg transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <NotificationsBell />
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-[hsl(var(--theme-bg-primary))]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
