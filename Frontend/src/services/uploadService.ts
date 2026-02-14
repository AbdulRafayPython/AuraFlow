// services/uploadService.ts - File upload service for chat messages
// Handles multipart/form-data uploads for both channel and DM messages
import { API_SERVER } from '@/config/api';

const API_URL = API_SERVER;

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface AttachmentData {
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
}

export interface UploadResponse {
  id: number;
  content: string;
  message_type: string;
  created_at: string;
  attachment: AttachmentData;
  [key: string]: any;
}

class UploadService {
  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Upload a file to a community channel.
   * Creates the message server-side and broadcasts via socket.
   */
  async uploadChannelFile(
    file: File,
    channelId: number,
    caption?: string,
    onProgress?: (progress: UploadProgress) => void,
    duration?: number
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('channel_id', channelId.toString());
    if (caption) formData.append('content', caption);
    if (duration != null) formData.append('duration', duration.toString());

    return this.upload('/api/upload/channel', formData, onProgress);
  }

  /**
   * Upload a file in a direct message.
   * Creates the DM server-side.
   */
  async uploadDMFile(
    file: File,
    receiverId: number,
    caption?: string,
    onProgress?: (progress: UploadProgress) => void,
    duration?: number
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('receiver_id', receiverId.toString());
    if (caption) formData.append('content', caption);
    if (duration != null) formData.append('duration', duration.toString());

    return this.upload('/api/upload/dm', formData, onProgress);
  }

  private async upload(
    path: string,
    formData: FormData,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResponse> {
    const token = this.getToken();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}${path}`);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percent: Math.round((e.loaded / e.total) * 100),
            });
          }
        });
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || 'Upload failed'));
          }
        } catch {
          reject(new Error('Invalid server response'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));

      xhr.timeout = 60000; // 60s timeout for large files
      xhr.send(formData);
    });
  }
}

export const uploadService = new UploadService();

// ============================================================================
// UTILITY HELPERS
// ============================================================================

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'webm', 'm4a'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(getFileExtension(filename));
}

export function isAudioFile(filename: string): boolean {
  return AUDIO_EXTENSIONS.includes(getFileExtension(filename));
}

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.includes(getFileExtension(filename));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
  }
  const ext = getFileExtension(file.name);
  const ALLOWED = [
    ...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS,
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md',
    'zip', 'rar', '7z',
  ];
  if (!ALLOWED.includes(ext)) {
    return `File type .${ext} is not supported`;
  }
  return null; // valid
}

/**
 * Build full URL for a file_url path returned from the server.
 * Server returns paths like /uploads/chat/abc.png
 */
export function getFileUrl(filePath: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('http')) return filePath;
  return `${API_URL}${filePath}`;
}
