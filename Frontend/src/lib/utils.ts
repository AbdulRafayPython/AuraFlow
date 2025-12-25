import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
  
  // Otherwise, prepend the API base URL
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  
  // If the path starts with /, use it as is, otherwise add /
  const path = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
  
  return `${API_BASE_URL}${path}`;
}

