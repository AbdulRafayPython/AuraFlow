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

/**
 * Human-friendly one-line preview of a message for conversation lists.
 * Non-text messages must NOT show the raw file path/content — show a label.
 */
export function formatMessagePreview(
  message: { message_type?: string; content?: string } | null | undefined
): string {
  if (!message) return '';
  switch (message.message_type) {
    case 'call':  return formatCallPreview(message.content || '');
    case 'image': return '📷 Photo';
    case 'video': return '🎬 Video';
    case 'voice': return '🎙️ Voice message';
    case 'file':  return '📎 File';
    default:      return message.content || '';
  }
}


/**
 * Black or white text, whichever reads better (WCAG contrast) on a hex
 * background such as a user-chosen community colour. Falls back to white.
 */
export function readableTextOn(color: string | null | undefined): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color || "").trim());
  if (!m) return "#fff";
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contrast with white = 1.05/(lum+.05); with black = (lum+.05)/.05
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#fff" : "#111";
}
