/**
 * Community Dashboard Layout
 * Professional sidebar layout with community selector and navigation.
 * Uses ThemeContext for consistent theming across the dashboard.
 */

import React, { useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Shield,
  Users,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Brain,
  AlertTriangle,
  UserX,
  TrendingUp,
  Heart,
  Activity,
  Menu,
  X,
  LogOut,
  Home,
  ChevronDown,
  Building2,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  children?: { title: string; href: string; icon: React.ElementType }[];
  disabled?: boolean;
  comingSoon?: string;
}

const navItems: NavItem[] = [
  {
    title: 'Overview',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Moderation',
    href: '/admin/moderation',
    icon: Shield,
    children: [
      { title: 'Flagged Content', href: '/admin/moderation/flagged', icon: AlertTriangle },
      { title: 'Blocked Users', href: '/admin/moderation/blocked', icon: UserX },
    ],
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    children: [
      { title: 'Community Health', href: '/admin/analytics/health', icon: Heart },
      { title: 'Engagement', href: '/admin/analytics/engagement', icon: TrendingUp },
      { title: 'Mood Trends', href: '/admin/analytics/mood', icon: Activity },
    ],
  },
  {
    title: 'AI Agents',
    href: '/admin/agents',
    icon: Brain,
    disabled: true,
    comingSoon: 'FYP 2',
  },
  {
    title: 'Reports',
    href: '/admin/reports',
    icon: FileText,
    disabled: true,
    comingSoon: 'FYP 2',
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    disabled: true,
    comingSoon: 'FYP 2',
  },
];

// Role check for admin access
function isAdmin(role?: string): boolean {
  return role === 'system_admin' || role === 'admin' || role === 'community_admin' || role === 'owner';
}

export default function AdminLayout() {
  const { user, logout, isLoading, isAuthenticated } = useAuth();
  const { currentTheme, themes } = useTheme();
  const { 
    ownedCommunities: communities, 
    selectedCommunity, 
    selectCommunity: setSelectedCommunityId, 
    isLoadingCommunities
  } = useCommunityDashboard();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['Moderation', 'Analytics']);

  const theme = themes[currentTheme];
  const isDark = theme.isDark;

  // Show loading while authentication is being verified
  if (isLoading || isLoadingCommunities) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-lg font-medium">
            {isLoading ? 'Verifying access...' : 'Loading communities...'}
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Role-based access control - user is loaded but not admin
  if (!user || !isAdmin(user.role)) {
    console.log('Admin access denied. User role:', user?.role);
    return <Navigate to="/" replace />;
  }

  // No communities owned - show message
  if (communities.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
          <Building2 className="w-16 h-16 text-slate-400" />
          <h2 className="text-2xl font-bold text-white">No Communities</h2>
          <p className="text-slate-300">
            You don't own or manage any communities yet. Create a community first to access the dashboard.
          </p>
          <Button asChild className="mt-4">
            <NavLink to="/">
              <Home className="h-4 w-4 mr-2" />
              Go Back
            </NavLink>
          </Button>
        </div>
      </div>
    );
  }

  const toggleExpanded = (title: string) => {
    setExpandedItems(prev =>
      prev.includes(title)
        ? prev.filter(item => item !== title)
        : [...prev, title]
    );
  };

  const isActiveRoute = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(href);
  };

  const NavItemComponent = ({ item, depth = 0 }: { item: NavItem; depth?: number }) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.title);
    const isActive = isActiveRoute(item.href);
    const Icon = item.icon;

    // Handle disabled items
    if (item.disabled) {
      const disabledContent = (
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            'text-muted-foreground/50 cursor-not-allowed',
            depth > 0 && 'text-xs'
          )}
        >
          <Icon className={cn('h-5 w-5 flex-shrink-0 opacity-50', isCollapsed && 'mx-auto', depth > 0 && 'h-4 w-4')} />
          {!isCollapsed && (
            <>
              <span className="opacity-50">{item.title}</span>
              {item.comingSoon && (
                <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-accent/20 text-accent rounded font-medium">
                  {item.comingSoon}
                </span>
              )}
            </>
          )}
        </div>
      );

      if (isCollapsed) {
        return (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>{disabledContent}</TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                {item.title}
                {item.comingSoon && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-accent/20 text-accent rounded font-medium">
                    {item.comingSoon}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return disabledContent;
    }

    if (hasChildren) {
      return (
        <div className="space-y-1">
          <button
            onClick={() => toggleExpanded(item.title)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              'hover:bg-accent/10',
              isActive && 'bg-accent/20 text-accent',
              !isActive && 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed && 'mx-auto')} />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">{item.title}</span>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              </>
            )}
          </button>
          {!isCollapsed && isExpanded && (
            <div className="ml-4 pl-3 border-l border-border/50 space-y-1">
              {item.children!.map(child => (
                <NavItemComponent key={child.href} item={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    const linkContent = (
      <NavLink
        to={item.href}
        end={item.href === '/admin'}
        className={({ isActive: active }) =>
          cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            'hover:bg-accent/10',
            active && 'bg-accent/20 text-accent',
            !active && 'text-muted-foreground hover:text-foreground',
            depth > 0 && 'text-xs'
          )
        }
        onClick={() => setIsMobileOpen(false)}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed && 'mx-auto', depth > 0 && 'h-4 w-4')} />
        {!isCollapsed && <span>{item.title}</span>}
        {item.badge && item.badge > 0 && !isCollapsed && (
          <span className="ml-auto px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
            {item.badge}
          </span>
        )}
      </NavLink>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              {item.title}
              {item.badge && item.badge > 0 && (
                <span className="px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                  {item.badge}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return linkContent;
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo/Header */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-border/50',
        isCollapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="relative">
          <div className={cn(
            'rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center',
            isCollapsed ? 'w-10 h-10' : 'w-10 h-10'
          )}>
            <Shield className="w-5 h-5 text-accent" />
          </div>
        </div>
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-accent to-accent/70">
              AuraFlow
            </span>
            <span className="text-[10px] text-muted-foreground -mt-1">Community Dashboard</span>
          </div>
        )}
      </div>

      {/* Community Selector */}
      <div className={cn('px-3 py-3 border-b border-border/50', isCollapsed && 'px-2')}>
        {!isCollapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between bg-accent/5 border-accent/20 hover:bg-accent/10"
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center flex-shrink-0">
                    {selectedCommunity?.icon ? (
                      <span className="text-sm">{selectedCommunity.icon}</span>
                    ) : (
                      <Building2 className="w-3 h-3 text-accent" />
                    )}
                  </div>
                  <span className="truncate text-sm font-medium">
                    {selectedCommunity?.name || 'Select Community'}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Your Communities</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {communities.map((community) => (
                <DropdownMenuItem
                  key={community.id}
                  onClick={() => setSelectedCommunityId(community.id)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center">
                    {community.icon ? (
                      <span className="text-sm">{community.icon}</span>
                    ) : (
                      <Building2 className="w-3 h-3" />
                    )}
                  </div>
                  <div className="flex-1 truncate">
                    <span className="text-sm">{community.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      ({community.member_count} members)
                    </span>
                  </div>
                  {selectedCommunity?.id === community.id && (
                    <Check className="h-4 w-4 text-accent" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="w-full bg-accent/5 border-accent/20"
                >
                  {selectedCommunity?.icon ? (
                    <span className="text-lg">{selectedCommunity.icon}</span>
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{selectedCommunity?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedCommunity?.member_count} members
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navItems.map(item => (
            <NavItemComponent key={item.href} item={item} />
          ))}
        </nav>
      </ScrollArea>

      <Separator className="opacity-50" />

      {/* User Section */}
      <div className={cn(
        'p-4',
        isCollapsed && 'flex flex-col items-center gap-2'
      )}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-accent/30">
              <AvatarImage src={user.avatar_url || user.avatar} />
              <AvatarFallback className="bg-accent/20 text-accent font-medium">
                {user.display_name?.[0] || user.username?.[0] || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.display_name || user.username}</p>
              <p className="text-xs text-muted-foreground truncate capitalize">
                {user.role?.replace('_', ' ') || 'Admin'}
              </p>
            </div>
          </div>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-10 w-10 border-2 border-accent/30">
                  <AvatarImage src={user.avatar_url || user.avatar} />
                  <AvatarFallback className="bg-accent/20 text-accent font-medium">
                    {user.display_name?.[0] || user.username?.[0] || 'A'}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{user.display_name || user.username}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user.role?.replace('_', ' ') || 'Admin'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className={cn(
          'flex gap-2 mt-3',
          isCollapsed && 'flex-col mt-2'
        )}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={isCollapsed ? 'icon' : 'sm'}
                  className="flex-1 text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <NavLink to="/">
                    <Home className="h-4 w-4" />
                    {!isCollapsed && <span className="ml-2">Back to App</span>}
                  </NavLink>
                </Button>
              </TooltipTrigger>
              {isCollapsed && <TooltipContent side="right">Back to App</TooltipContent>}
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={isCollapsed ? 'icon' : 'sm'}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                  {!isCollapsed && <span className="ml-2">Logout</span>}
                </Button>
              </TooltipTrigger>
              {isCollapsed && <TooltipContent side="right">Logout</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Collapse Button */}
      <div className="p-2 border-t border-border/50 hidden lg:block">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn(
      'min-h-screen flex',
      isDark ? 'bg-background text-foreground' : 'bg-gray-50 text-gray-900'
    )}>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

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
          'fixed lg:sticky top-0 left-0 z-40 h-screen transition-all duration-300',
          'bg-card/95 backdrop-blur-xl border-r border-border/50',
          isCollapsed ? 'w-[72px]' : 'w-64',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className={cn(
        'flex-1 min-h-screen transition-all duration-300',
        'px-4 lg:px-8 py-6 lg:py-8'
      )}>
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
