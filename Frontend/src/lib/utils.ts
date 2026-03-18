import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { API_SERVER } from "@/config/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the full avatar URL for a user
 * @param avatarUrl - The avatar URL from the backend (can be null/undefined)
 * @param username - The username for Dicebear fallback
 * @returns The full avatar URL or Dicebear fallback
 */
export function getAvatarUrl(avatarUrl: string | null | undefined, username: string): string {
  if (!avatarUrl) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
  }
  
  // If it's already a full URL (starts with http), return as is
  if (avatarUrl.startsWith('http')) {
    return avatarUrl;
  }
  
  // Otherwise, prepend the API base URL (remove /api suffix for static file serving)
  
  // If the path starts with /, use it as is, otherwise add /
  const path = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
  
  return `${API_SERVER}${path}`;
}

/** Format a call-log JSON content string into a human-readable preview. */
export function formatCallPreview(content: string): string {
  try {
    const { call_type, status, duration } = JSON.parse(content);
    const icon = call_type === 'video' ? '📹' : '📞';
    const label =
      status === 'attended' ? `Call · ${formatCallDuration(duration || 0)}`
      : status === 'missed' ? 'Missed call'
      : status === 'rejected' ? 'Declined'
      : 'Cancelled';
    return `${icon} ${label}`;
  } catch {
    return '📞 Call';
  }
}

function formatCallDuration(seconds: number): string {
  if (seconds < 60) return `0:${seconds.toString().padStart(2, '0')}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

