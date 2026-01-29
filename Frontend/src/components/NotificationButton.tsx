// components/NotificationButton.tsx - Professional notification button for navbar
import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, MessageSquare, UserPlus, Users, CheckCheck, Trash2 } from 'lucide-react';
import { useNotificationsContext, type Notification } from '@/contexts/NotificationsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAvatarUrl } from '@/lib/utils';

interface NotificationButtonProps {
  onNavigate?: (view: string) => void;
}

export function NotificationButton({ onNavigate }: NotificationButtonProps) {
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
      // Navigate to DMs
      onNavigate('dm');
    }
    
    setIsOpen(false);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'friend_accepted':
        return <Users className="w-4 h-4 text-purple-500" />;
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

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-all duration-200 ${
          isDarkMode
            ? 'hover:bg-slate-700 text-gray-300 hover:text-white'
            : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
        } ${isOpen ? (isDarkMode ? 'bg-slate-700' : 'bg-gray-100') : ''}`}
        title="Notifications"
      >
        <Bell className={`w-4 h-4 transition-transform ${isOpen ? 'scale-110' : ''}`} />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-800 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-[9998] md:hidden bg-black/20"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Panel */}
          <div
            ref={dropdownRef}
            className={`absolute right-0 mt-2 w-80 sm:w-96 max-h-[480px] overflow-hidden rounded-xl shadow-2xl z-[9999] border transform origin-top-right transition-all duration-200 ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700'
                : 'bg-white border-gray-200'
            }`}
            style={{
              animation: 'slideDown 0.2s ease-out',
            }}
          >
            {/* Header */}
            <div className={`px-4 py-3 border-b sticky top-0 z-10 ${
              isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-100 bg-white'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold text-base ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                    }`}>
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
                      className={`p-1.5 rounded-lg transition-colors ${
                        isDarkMode
                          ? 'hover:bg-slate-700 text-gray-400 hover:text-blue-400'
                          : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'
                      }`}
                      title="Mark all as read"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearAll();
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isDarkMode
                          ? 'hover:bg-slate-700 text-gray-400 hover:text-red-400'
                          : 'hover:bg-gray-100 text-gray-500 hover:text-red-600'
                      }`}
                      title="Clear all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-[380px]" style={{
              scrollbarWidth: 'thin',
              scrollbarColor: isDarkMode ? '#475569 transparent' : '#cbd5e1 transparent'
            }}>
              {sortedNotifications.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                    isDarkMode ? 'bg-slate-700' : 'bg-gray-100'
                  }`}>
                    <Bell className={`w-8 h-8 ${
                      isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`} />
                  </div>
                  <p className={`text-sm font-medium ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All caught up!
                  </p>
                  <p className={`text-xs mt-1 ${
                    isDarkMode ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    No notifications to show
                  </p>
                </div>
              ) : (
                <div className={`divide-y ${isDarkMode ? 'divide-slate-700/50' : 'divide-gray-100'}`}>
                  {sortedNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`group px-4 py-3 transition-colors cursor-pointer relative ${
                        !notification.read
                          ? isDarkMode
                            ? 'bg-blue-500/5 hover:bg-blue-500/10'
                            : 'bg-blue-50/50 hover:bg-blue-50'
                          : isDarkMode
                            ? 'hover:bg-slate-700/50'
                            : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        {/* Avatar or Icon */}
                        <div className="flex-shrink-0 relative">
                          {notification.type === 'system' && notification.data?.community_logo ? (
                            // Show community logo for removal notifications
                            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-red-500">
                              <img
                                src={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}${notification.data.community_logo}`}
                                alt={notification.data.community_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback to community icon if image fails
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
                          ) : notification.type === 'system' && notification.data?.community_icon ? (
                            // Show community icon for removal without logo
                            <div 
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-red-500"
                              style={{ backgroundColor: notification.data.community_color || '#8B5CF6' }}
                            >
                              {notification.data.community_icon}
                            </div>
                          ) : notification.from?.avatar_url ? (
                            <img
                              src={getAvatarUrl(notification.from.avatar_url, notification.from.username)}
                              alt={notification.from.display_name || notification.from.username}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-700"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-700 ${
                              isDarkMode ? 'bg-slate-600' : 'bg-gray-100'
                            }`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                          )}
                          
                          {/* Type indicator */}
                          <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ${
                            isDarkMode ? 'ring-slate-800 bg-slate-700' : 'ring-white bg-white shadow-sm'
                          }`}>
                            {getNotificationIcon(notification.type)}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-tight ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {notification.title}
                          </p>
                          <p className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {notification.message}
                          </p>
                          <p className={`text-[10px] mt-1.5 font-medium uppercase tracking-wide ${
                            isDarkMode ? 'text-gray-500' : 'text-gray-400'
                          }`}>
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
                            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-all ${
                              isDarkMode
                                ? 'hover:bg-slate-600 text-gray-500 hover:text-gray-300'
                                : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'
                            }`}
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
              <div className={`px-4 py-2.5 border-t text-center ${
                isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-100 bg-gray-50/50'
              }`}>
                <button
                  onClick={() => {
                    // Could navigate to a full notifications page
                    setIsOpen(false);
                  }}
                  className={`text-xs font-medium transition-colors ${
                    isDarkMode
                      ? 'text-blue-400 hover:text-blue-300'
                      : 'text-blue-600 hover:text-blue-700'
                  }`}
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
      `}</style>
    </div>
  );
}

export default NotificationButton;
