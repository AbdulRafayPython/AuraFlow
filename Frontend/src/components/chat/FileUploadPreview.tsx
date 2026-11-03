// components/chat/FileUploadPreview.tsx
// Shows a preview bar above the message input when a file is staged for upload

import React, { useMemo } from 'react';
import { Trash2, FileText, Image as ImageIcon, Music, Film, Archive, File, Loader2 } from 'lucide-react';
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

  // A tile above the composer (Discord): big thumbnail or icon, name, size,
  // a floating remove button, and the upload progress along the bottom.
  return (
    <div className="mx-1 mb-2 flex" data-testid="upload-tile">
      <div className="group/tile relative w-48 rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-2">
        <div className="flex h-32 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--theme-bg-tertiary))]">
          {imagePreviewUrl ? (
            <img src={imagePreviewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-muted-foreground [&>svg]:h-10 [&>svg]:w-10">{getIcon(file.name)}</span>
          )}
        </div>
        <p className="mt-2 truncate text-sm font-medium text-foreground" title={file.name}>{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)} · {getFileExtension(file.name).toUpperCase()}
        </p>

        {isUploading && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--theme-bg-tertiary))]" role="progressbar" aria-valuenow={uploadProgress ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        <div className="absolute -right-2 -top-2 flex rounded-md border border-border bg-popover shadow-popover">
          {isUploading ? (
            <span className="flex h-8 w-8 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></span>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              aria-label={`Remove ${file.name}`}
              title="Remove"
              className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors duration-100 hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploadPreview;
