// components/NotificationBell.tsx - Professional notification bell UI
import React, { useState } from 'react';
import { Bell, X, Check, MessageSquare, UserPlus, Users } from 'lucide-react';
import { useNotificationsContext, type Notification } from '@/contexts/NotificationsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from '@/lib/utils';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useNotificationsContext();
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    // Navigate based on notification type
    if (notification.type === 'message' && notification.from) {
      navigate(`/dashboard`);
      // TODO: Open DM with that user
    } else if (notification.type === 'friend_request') {
      navigate('/friends');
    } else if (notification.type === 'friend_accepted') {
      navigate('/friends');
    }
    
    setIsOpen(false);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-5 h-5 text-blue-500" />;
      case 'message':
        return <MessageSquare className="w-5 h-5 text-green-500" />;
      case 'friend_accepted':
        return <Users className="w-5 h-5 text-purple-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
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
    return `${days}d ago`;
  };

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition ${
          isDarkMode
            ? 'hover:bg-slate-700 text-gray-300 hover:text-white'
            : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Panel */}
          <div
            className={`absolute left-full ml-2 top-0 w-96 max-h-[500px] overflow-hidden rounded-lg shadow-xl z-50 border ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700'
                : 'bg-white border-gray-200'
            }`}
          >
            {/* Header */}
            <div className={`px-4 py-3 border-b ${
              isDarkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`font-semibold text-base ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Notifications
                </h3>
                {notifications.length > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className={`text-xs font-medium transition ${
                      isDarkMode
                        ? 'text-blue-400 hover:text-blue-300'
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-[420px] scrollbar">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className={`w-12 h-12 mx-auto mb-2 ${
                    isDarkMode ? 'text-gray-600' : 'text-gray-400'
                  }`} />
                  <p className={`text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    No notifications yet
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 transition cursor-pointer relative ${
                        !notification.read
                          ? isDarkMode
                            ? 'bg-slate-700/50 hover:bg-slate-700'
                            : 'bg-blue-50 hover:bg-blue-100'
                          : isDarkMode
                          ? 'hover:bg-slate-700/30'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        {/* Avatar or Icon */}
                        <div className="flex-shrink-0">
                          {notification.from?.avatar_url ? (
                            <img
                              src={getAvatarUrl(notification.from.avatar_url, notification.from.username)}
                              alt={notification.from.display_name || notification.from.username}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isDarkMode ? 'bg-slate-600' : 'bg-gray-200'
                            }`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {notification.title}
                          </p>
                          <p className={`text-xs mt-0.5 line-clamp-2 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {notification.message}
                          </p>
                          <p className={`text-xs mt-1 ${
                            isDarkMode ? 'text-gray-500' : 'text-gray-400'
                          }`}>
                            {formatTimestamp(notification.timestamp)}
                          </p>
                        </div>

                        {/* Unread indicator */}
                        {!notification.read && (
                          <div className="flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                          </div>
                        )}

                        {/* Clear button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearNotification(notification.id);
                          }}
                          className={`flex-shrink-0 p-1 rounded transition opacity-0 group-hover:opacity-100 ${
                            isDarkMode
                              ? 'hover:bg-slate-600 text-gray-400 hover:text-white'
                              : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
