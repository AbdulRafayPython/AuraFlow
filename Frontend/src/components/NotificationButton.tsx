// components/NotificationButton.tsx - Professional notification button for navbar or sidebar
import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, MessageSquare, UserPlus, Users, CheckCheck, Trash2, Hash, FileText } from 'lucide-react';
import { useNotificationsContext, type Notification } from '@/contexts/NotificationsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAvatarUrl } from '@/lib/utils';
import { API_SERVER } from '@/config/api';

interface NotificationButtonProps {
  onNavigate?: (view: string) => void;
  /** 'header' = small icon in top bar (default), 'sidebar' = 48×48 icon-rail button */
  placement?: 'header' | 'sidebar';
}

export function NotificationButton({ onNavigate, placement = 'header' }: NotificationButtonProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification, clearAll } = useNotificationsContext();
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    // Navigate based on notification type
    if (notification.type === 'friend_request' && onNavigate) {
      onNavigate('friends');
    } else if (notification.type === 'friend_accepted' && onNavigate) {
      onNavigate('friends');
    } else if (notification.type === 'message' && onNavigate) {
      onNavigate('dm');
    } else if (notification.type === 'channel_message' && onNavigate) {
      onNavigate('community');
    } else if (notification.type === 'summary_ready' && onNavigate) {
      onNavigate('community');
    }
    
    setIsOpen(false);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'channel_message':
        return <Hash className="w-4 h-4 text-indigo-500" />;
      case 'friend_accepted':
        return <Users className="w-4 h-4 text-purple-500" />;
      case 'summary_ready':
        return <FileText className="w-4 h-4 text-cyan-500" />;
      case 'system':
      case 'community_removal':
        return <Bell className="w-4 h-4 text-red-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const isSidebar = placement === 'sidebar';

  return (
    <div className={isSidebar ? 'relative group w-full flex justify-center' : 'relative'}>
      {/* Notification Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={isSidebar
          ? `relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isOpen
                ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/40 scale-105'
                : 'bg-[hsl(var(--theme-bg-secondary))] hover:bg-gradient-to-br hover:from-amber-500 hover:to-orange-600 text-[hsl(var(--theme-text-muted))] hover:text-white hover:scale-105 hover:shadow-lg'
            }`
          : `relative p-2 rounded-lg transition-all duration-200 hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] ${isOpen ? 'bg-[hsl(var(--theme-bg-hover))]' : ''}`
        }
        title="Notifications"
      >
        <Bell className={isSidebar
          ? `w-5 h-5 transition-all duration-300 ${isOpen ? 'scale-110' : ''}`
          : `w-4 h-4 transition-transform ${isOpen ? 'scale-110' : ''}`
        } />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className={`absolute flex items-center justify-center rounded-full bg-red-500 text-white font-bold animate-pulse ${
            isSidebar
              ? '-top-1 -right-1 min-w-[20px] h-5 px-1 text-[10px] border-2 border-[hsl(var(--theme-sidebar-bg))]'
              : '-top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] ring-2 ring-white dark:ring-slate-800'
          }`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Tooltip – sidebar only, when panel is closed */}
      {isSidebar && !isOpen && (
        <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-[9999] bg-[hsl(var(--theme-bg-elevated))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] shadow-xl backdrop-blur-xl">
          Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </div>
      )}

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/20"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Panel */}
          <div
            ref={dropdownRef}
            className={`absolute ${
              isSidebar
                ? 'left-[calc(100%+12px)] top-0 w-80 sm:w-96 origin-top-left'
                : 'right-0 mt-2 w-80 sm:w-96 origin-top-right'
            } max-h-[480px] overflow-hidden rounded-xl shadow-2xl z-[9999] border transform transition-all duration-200 bg-[hsl(var(--theme-bg-elevated))] border-[hsl(var(--theme-border-default))]`}
            style={{
              animation: isSidebar ? 'slideRight 0.2s ease-out' : 'slideDown 0.2s ease-out',
            }}
          >
            {/* Header */}
            <div className={`px-4 py-3 border-b sticky top-0 z-10 border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))]`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base text-[hsl(var(--theme-text-primary))]">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[hsl(var(--theme-accent-primary)/0.2)] text-[hsl(var(--theme-accent-primary))]">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                
                {notifications.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAllAsRead();
                      }}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-accent-primary))]"
                      title="Mark all as read"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearAll();
                      }}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-red-400"
                      title="Clear all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-[380px]">
              {sortedNotifications.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-[hsl(var(--theme-bg-secondary))]">
                    <Bell className="w-8 h-8 text-[hsl(var(--theme-text-muted))]" />
                  </div>
                  <p className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
                    All caught up!
                  </p>
                  <p className="text-xs mt-1 text-[hsl(var(--theme-text-muted))]">
                    No notifications to show
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[hsl(var(--theme-border-default)/0.5)]">
                  {sortedNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`group px-4 py-3 transition-colors cursor-pointer relative ${
                        !notification.read
                          ? 'bg-[hsl(var(--theme-accent-primary)/0.05)] hover:bg-[hsl(var(--theme-accent-primary)/0.1)]'
                          : 'hover:bg-[hsl(var(--theme-bg-hover))]'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        {/* Avatar or Icon */}
                        <div className="flex-shrink-0 relative">
                          {/* Channel message — show community logo */}
                          {notification.type === 'channel_message' && notification.data?.community_logo ? (
                            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-indigo-500/50">
                              <img
                                src={`${API_SERVER}${notification.data.community_logo}`}
                                alt={notification.data.community_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.style.backgroundColor = notification.data.community_color || '#6366F1';
                                    parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white font-bold text-sm">${notification.data.community_icon || '#'}</div>`;
                                  }
                                }}
                              />
                            </div>
                          ) : notification.type === 'channel_message' && notification.data?.community_icon ? (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-indigo-500/50"
                              style={{ backgroundColor: notification.data.community_color || '#6366F1' }}
                            >
                              {notification.data.community_icon}
                            </div>
                          ) : (notification.type === 'system' || notification.type === 'community_removal') && notification.data?.community_logo ? (
                            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-red-500">
                              <img
                                src={`${API_SERVER}${notification.data.community_logo}`}
                                alt={notification.data.community_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.style.backgroundColor = notification.data.community_color || '#8B5CF6';
                                    parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white font-bold text-sm">${notification.data.community_icon || 'AF'}</div>`;
                                  }
                                }}
                              />
                            </div>
                          ) : (notification.type === 'system' || notification.type === 'community_removal') && notification.data?.community_icon ? (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-red-500"
                              style={{ backgroundColor: notification.data.community_color || '#8B5CF6' }}
                            >
                              {notification.data.community_icon}
                            </div>
                          ) : notification.type === 'summary_ready' ? (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-500 ring-2 ring-cyan-400/40">
                              <FileText className="w-5 h-5 text-white" />
                            </div>
                          ) : notification.from?.avatar_url ? (
                            <img
                              src={getAvatarUrl(notification.from.avatar_url, notification.from.username)}
                              alt={notification.from.display_name || notification.from.username}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-[hsl(var(--theme-bg-elevated))]"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-[hsl(var(--theme-bg-elevated))] bg-[hsl(var(--theme-bg-secondary))]`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                          )}
                          
                          {/* Type indicator */}
                          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-[hsl(var(--theme-bg-elevated))] bg-[hsl(var(--theme-bg-secondary))]">
                            {getNotificationIcon(notification.type)}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight text-[hsl(var(--theme-text-primary))]">
                            {notification.title}
                          </p>
                          <p className="text-xs mt-0.5 line-clamp-2 leading-relaxed text-[hsl(var(--theme-text-muted))]">
                            {notification.message}
                          </p>
                          <p className="text-[10px] mt-1.5 font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
                            {formatTimestamp(notification.timestamp)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0 flex items-start gap-1">
                          {/* Unread indicator */}
                          {!notification.read && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 animate-pulse" />
                          )}

                          {/* Clear button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              clearNotification(notification.id);
                            }}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {sortedNotifications.length > 0 && (
              <div className="px-4 py-2.5 border-t text-center border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated)/0.5)]">
                <button
                  onClick={() => {
                    // Could navigate to a full notifications page
                    setIsOpen(false);
                  }}
                  className="text-xs font-medium transition-colors text-[hsl(var(--theme-accent-primary))] hover:text-[hsl(var(--theme-accent-primary)/0.8)]"
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideRight {
          from {
            opacity: 0;
            transform: translateX(-8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default NotificationButton;
