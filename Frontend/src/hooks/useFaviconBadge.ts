// hooks/useFaviconBadge.ts - Dynamic favicon with unread count overlay
import { useEffect, useRef, useCallback } from 'react';

const BADGE_BG = '#ef4444'; // red-500
const BADGE_TEXT = '#ffffff';
const BADGE_FONT = 'bold 28px Arial';
const FAVICON_SIZE = 64;

/**
 * Draws the current favicon onto an off-screen canvas and overlays a rounded-rect
 * badge with the unread count (top-right). When count drops to 0 the original favicon
 * is restored.  Also updates `document.title` with a prefix like `(3) AuroFlow`.
 *
 * Call once at the top of the component tree – it only manipulates DOM globals.
 */
export function useFaviconBadge(totalUnread: number) {
  const originalHref = useRef<string | null>(null);
  const originalTitle = useRef<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Capture original favicon & title on mount
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    originalHref.current = link?.href ?? '/favicon.ico';
    originalTitle.current = document.title.replace(/^\(\d+\)\s*/, ''); // strip previous badge
    return () => {
      // Restore originals on unmount
      restoreFavicon(originalHref.current);
      document.title = originalTitle.current;
    };
  }, []);

  const drawBadge = useCallback((count: number) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = FAVICON_SIZE;
      canvasRef.current.height = FAVICON_SIZE;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
      ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);

      if (count > 0) {
        const text = count > 99 ? '99+' : String(count);
        ctx.font = BADGE_FONT;
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const badgeW = Math.max(textWidth + 10, 28);
        const badgeH = 28;
        const x = FAVICON_SIZE - badgeW - 1;
        const y = 1;

        // Background pill
        ctx.fillStyle = BADGE_BG;
        ctx.beginPath();
        const r = badgeH / 2;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + badgeW - r, y);
        ctx.arc(x + badgeW - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + badgeH);
        ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        // Text
        ctx.fillStyle = BADGE_TEXT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 1);
      }

      // Apply to DOM
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = canvas.toDataURL('image/png');
    };
    img.src = originalHref.current ?? '/favicon.ico';
  }, []);

  useEffect(() => {
    // Update title prefix
    const base = originalTitle.current || document.title.replace(/^\(\d+\)\s*/, '');
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${base}` : base;

    if (totalUnread > 0) {
      drawBadge(totalUnread);
    } else {
      restoreFavicon(originalHref.current);
    }
  }, [totalUnread, drawBadge]);
}

function restoreFavicon(href: string | null) {
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (link && href) {
    link.href = href;
  }
}
