// components/media/MediaViewer.tsx
// Premium lightbox modal for viewing images, videos, and files

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  X, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  Minimize2,
  User,
  Calendar,
  FileText,
  Image as ImageIcon,
  Film,
  Music
} from 'lucide-react';
import { useMediaViewer } from '@/contexts/MediaViewerContext';
import { formatFileSize } from '@/services/uploadService';

const MediaViewer: React.FC = () => {
  const {
    currentMedia,
    gallery,
    currentIndex,
    isOpen,
    closeViewer,
    nextMedia,
    prevMedia,
  } = useMediaViewer();

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset state when media changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setImageLoaded(false);
  }, [currentMedia?.url]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeViewer();
          break;
        case 'ArrowLeft':
          prevMedia();
          break;
        case 'ArrowRight':
          nextMedia();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case 'r':
        case 'R':
          handleRotate();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeViewer, nextMedia, prevMedia]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(prev - 0.25, 0.5);
      if (newZoom <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!currentMedia) return;
    const link = document.createElement('a');
    link.href = currentMedia.url;
    link.download = currentMedia.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentMedia]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  // Drag to pan when zoomed
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, zoom, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeViewer();
    }
  }, [closeViewer]);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  if (!isOpen || !currentMedia) return null;

  const isImage = currentMedia.type === 'image';
  const isVideo = currentMedia.type === 'video';
  const isAudio = currentMedia.type === 'audio';
  const hasGallery = gallery.length > 1;

  const getTypeIcon = () => {
    switch (currentMedia.type) {
      case 'image': return <ImageIcon className="w-4 h-4" />;
      case 'video': return <Film className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        {/* File Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
            {getTypeIcon()}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white truncate max-w-[300px]">
              {currentMedia.fileName}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              {currentMedia.fileSize && (
                <span>{formatFileSize(currentMedia.fileSize)}</span>
              )}
              {hasGallery && (
                <span className="px-1.5 py-0.5 rounded bg-white/10">
                  {currentIndex + 1} / {gallery.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {isImage && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                title="Zoom out (-)"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-xs text-white/60 min-w-[48px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                title="Zoom in (+)"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-white/20 mx-1" />
              <button
                onClick={handleRotate}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                title="Rotate (R)"
              >
                <RotateCw className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
            title="Toggle fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button
            onClick={closeViewer}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-16">
        {/* Previous Button */}
        {hasGallery && (
          <button
            onClick={(e) => { e.stopPropagation(); prevMedia(); }}
            className="absolute left-4 z-10 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-all backdrop-blur-sm"
            title="Previous (←)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Media Content */}
        <div 
          className="relative flex items-center justify-center"
          onWheel={handleWheel}
        >
          {isImage && (
            <div
              className={`relative ${isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-default'}`}
              onMouseDown={handleMouseDown}
              style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
              }}
            >
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                </div>
              )}
              <img
                ref={imageRef}
                src={currentMedia.url}
                alt={currentMedia.fileName}
                className={`max-h-[calc(100vh-140px)] max-w-[calc(100vw-160px)] object-contain select-none transition-all duration-200 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
                onLoad={() => setImageLoaded(true)}
                draggable={false}
              />
            </div>
          )}

          {isVideo && (
            <video
              src={currentMedia.url}
              controls
              autoPlay
              className="max-h-[calc(100vh-140px)] max-w-[calc(100vw-160px)] rounded-lg"
            >
              Your browser does not support video playback.
            </video>
          )}

          {isAudio && (
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] flex items-center justify-center">
                <Music className="w-10 h-10 text-white" />
              </div>
              <p className="text-white font-medium">{currentMedia.fileName}</p>
              <audio src={currentMedia.url} controls autoPlay className="w-80" />
            </div>
          )}

          {currentMedia.type === 'document' && (
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 flex flex-col items-center gap-4 max-w-md">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] flex items-center justify-center">
                <FileText className="w-10 h-10 text-white" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">{currentMedia.fileName}</p>
                {currentMedia.fileSize && (
                  <p className="text-white/60 text-sm mt-1">{formatFileSize(currentMedia.fileSize)}</p>
                )}
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
              >
                <Download className="w-4 h-4" />
                Download File
              </button>
            </div>
          )}
        </div>

        {/* Next Button */}
        {hasGallery && (
          <button
            onClick={(e) => { e.stopPropagation(); nextMedia(); }}
            className="absolute right-4 z-10 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-all backdrop-blur-sm"
            title="Next (→)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Footer with metadata */}
      {(currentMedia.uploaderName || currentMedia.uploadedAt) && (
        <div className="px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
          <div className="flex items-center justify-center gap-4 text-xs text-white/60">
            {currentMedia.uploaderName && (
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{currentMedia.uploaderName}</span>
              </div>
            )}
            {currentMedia.uploadedAt && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(currentMedia.uploadedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gallery Thumbnails (if multiple items) */}
      {hasGallery && gallery.length <= 10 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-xl bg-black/40 backdrop-blur-sm">
          {gallery.map((item, index) => (
            <button
              key={item.id}
              onClick={(e) => { e.stopPropagation(); }}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                index === currentIndex 
                  ? 'border-white scale-105' 
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              {item.type === 'image' ? (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-white/10 flex items-center justify-center">
                  {item.type === 'video' && <Film className="w-5 h-5 text-white/80" />}
                  {item.type === 'audio' && <Music className="w-5 h-5 text-white/80" />}
                  {item.type === 'document' && <FileText className="w-5 h-5 text-white/80" />}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaViewer;
