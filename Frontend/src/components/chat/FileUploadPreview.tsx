// components/chat/FileUploadPreview.tsx
// Shows a preview bar above the message input when a file is staged for upload

import React, { useMemo } from 'react';
import { X, FileText, Image as ImageIcon, Music, Film, Archive, File, Loader2 } from 'lucide-react';
import { isImageFile, isAudioFile, isVideoFile, formatFileSize, getFileExtension } from '@/services/uploadService';

interface FileUploadPreviewProps {
  file: File;
  /** 0-100 or null if not uploading yet */
  uploadProgress: number | null;
  onCancel: () => void;
}

function getIcon(name: string) {
  if (isImageFile(name)) return <ImageIcon className="w-5 h-5" />;
  if (isAudioFile(name)) return <Music className="w-5 h-5" />;
  if (isVideoFile(name)) return <Film className="w-5 h-5" />;
  const ext = getFileExtension(name);
  if (['zip', 'rar', '7z'].includes(ext)) return <Archive className="w-5 h-5" />;
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext))
    return <FileText className="w-5 h-5" />;
  return <File className="w-5 h-5" />;
}

const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({ file, uploadProgress, onCancel }) => {
  const isUploading = uploadProgress !== null;

  const imagePreviewUrl = useMemo(() => {
    if (isImageFile(file.name)) return URL.createObjectURL(file);
    return null;
  }, [file]);

  // Cleanup blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  return (
    <div className="mx-1 mb-2 p-3 rounded-lg border flex items-center gap-3 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]">
      {/* Thumbnail / Icon */}
      {imagePreviewUrl ? (
        <img
          src={imagePreviewUrl}
          alt="preview"
          className="w-12 h-12 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]">
          {getIcon(file.name)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-[hsl(var(--theme-text-primary))]">
          {file.name}
        </p>
        <p className="text-[11px] text-[hsl(var(--theme-text-muted))]">
          {formatFileSize(file.size)} &middot; {getFileExtension(file.name).toUpperCase()}
        </p>

        {/* Progress bar */}
        {isUploading && (
          <div className="mt-1.5 w-full bg-[hsl(var(--theme-bg-tertiary))] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 bg-[hsl(var(--theme-accent-primary))]"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Cancel / Spinner */}
      {isUploading ? (
        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 text-[hsl(var(--theme-accent-primary))]" />
      ) : (
        <button
          onClick={onCancel}
          className="p-1 rounded-md flex-shrink-0 transition-colors hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]"
          title="Remove file"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default FileUploadPreview;
