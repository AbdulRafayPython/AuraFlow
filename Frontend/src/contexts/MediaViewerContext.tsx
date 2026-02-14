// contexts/MediaViewerContext.tsx
// Global context for managing media viewer state across the app

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface MediaItem {
  id: string;
  url: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  type: 'image' | 'video' | 'audio' | 'document';
  /** Who uploaded this file */
  uploaderName?: string;
  /** When the file was uploaded */
  uploadedAt?: string;
}

interface MediaViewerContextType {
  /** Currently viewing media item */
  currentMedia: MediaItem | null;
  /** All media items in the current gallery (for navigation) */
  gallery: MediaItem[];
  /** Current index in gallery */
  currentIndex: number;
  /** Is the viewer open */
  isOpen: boolean;
  /** Open the viewer with a single media item */
  openMedia: (media: MediaItem) => void;
  /** Open the viewer with a gallery of items */
  openGallery: (items: MediaItem[], startIndex?: number) => void;
  /** Close the viewer */
  closeViewer: () => void;
  /** Navigate to next item in gallery */
  nextMedia: () => void;
  /** Navigate to previous item in gallery */
  prevMedia: () => void;
  /** Go to specific index */
  goToIndex: (index: number) => void;
}

const MediaViewerContext = createContext<MediaViewerContextType | undefined>(undefined);

export function MediaViewerProvider({ children }: { children: React.ReactNode }) {
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const [gallery, setGallery] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const openMedia = useCallback((media: MediaItem) => {
    setCurrentMedia(media);
    setGallery([media]);
    setCurrentIndex(0);
    setIsOpen(true);
  }, []);

  const openGallery = useCallback((items: MediaItem[], startIndex = 0) => {
    if (items.length === 0) return;
    setGallery(items);
    setCurrentIndex(startIndex);
    setCurrentMedia(items[startIndex]);
    setIsOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setIsOpen(false);
    // Delay clearing the media to allow exit animation
    setTimeout(() => {
      setCurrentMedia(null);
      setGallery([]);
      setCurrentIndex(0);
    }, 200);
  }, []);

  const nextMedia = useCallback(() => {
    if (gallery.length <= 1) return;
    const newIndex = (currentIndex + 1) % gallery.length;
    setCurrentIndex(newIndex);
    setCurrentMedia(gallery[newIndex]);
  }, [gallery, currentIndex]);

  const prevMedia = useCallback(() => {
    if (gallery.length <= 1) return;
    const newIndex = currentIndex === 0 ? gallery.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    setCurrentMedia(gallery[newIndex]);
  }, [gallery, currentIndex]);

  const goToIndex = useCallback((index: number) => {
    if (index < 0 || index >= gallery.length) return;
    setCurrentIndex(index);
    setCurrentMedia(gallery[index]);
  }, [gallery]);

  return (
    <MediaViewerContext.Provider
      value={{
        currentMedia,
        gallery,
        currentIndex,
        isOpen,
        openMedia,
        openGallery,
        closeViewer,
        nextMedia,
        prevMedia,
        goToIndex,
      }}
    >
      {children}
    </MediaViewerContext.Provider>
  );
}

export function useMediaViewer() {
  const context = useContext(MediaViewerContext);
  if (context === undefined) {
    throw new Error('useMediaViewer must be used within a MediaViewerProvider');
  }
  return context;
}
