import { Placement, Photo } from '../types';

export interface RenderOptions {
  canvas: HTMLCanvasElement;
  placements: Placement[];
  photosMap: Map<string, Photo>;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  selectedPhotoId?: string | null;
  hoverPhotoId?: string | null;
  debugMode?: boolean;
}

/**
 * High-performance preview canvas renderer.
 */
export function renderPreview({
  canvas,
  placements,
  photosMap,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  selectedPhotoId,
  hoverPhotoId,
  debugMode,
}: RenderOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Scale factor from logical canvas coordinates to preview canvas pixel buffer
  const scaleX = width / canvasWidth;
  const scaleY = height / canvasHeight;

  // Clear or fill background
  if (backgroundColor === 'transparent') {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = backgroundColor || '#0a0a0c';
    ctx.fillRect(0, 0, width, height);
  }

  // Draw each placed photograph
  for (const p of placements) {
    const photo = photosMap.get(p.photoId);
    if (!photo) continue;

    const rx = Math.round(p.x * scaleX);
    const ry = Math.round(p.y * scaleY);
    const rw = Math.round(p.width * scaleX);
    const rh = Math.round(p.height * scaleY);

    if (rw <= 0 || rh <= 0) continue;

    const img = photo.image;
    if (img && (img as HTMLImageElement).complete !== false) {
      try {
        const photoAspect =
          photo.aspectRatio ||
          ((img as HTMLImageElement).naturalWidth && (img as HTMLImageElement).naturalHeight
            ? (img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight
            : rw / rh);
        const cellAspect = rw / rh;

        // If aspect ratios match closely (within 1.5%), draw to fill cell
        if (Math.abs(photoAspect - cellAspect) / photoAspect < 0.015) {
          ctx.drawImage(img, rx, ry, rw, rh);
        } else {
          // Never stretch and never crop: aspect-fit ("contain") centered within cell
          let dw = rw;
          let dh = rh;
          let dx = rx;
          let dy = ry;

          if (photoAspect > cellAspect) {
            dh = Math.max(1, Math.round(rw / photoAspect));
            dy = Math.round(ry + (rh - dh) / 2);
          } else {
            dw = Math.max(1, Math.round(rh * photoAspect));
            dx = Math.round(rx + (rw - dw) / 2);
          }
          ctx.drawImage(img, dx, dy, dw, dh);
        }
      } catch (e) {
        // Fallback color fill if image drawing failed
        ctx.fillStyle = photo.averageColor || '#333';
        ctx.fillRect(rx, ry, rw, rh);
      }
    } else {
      ctx.fillStyle = photo.averageColor || '#222';
      ctx.fillRect(rx, ry, rw, rh);
    }

    // Hover state overlay
    if (p.photoId === hoverPhotoId && p.photoId !== selectedPhotoId) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
    }

    // Selected state overlay
    if (p.photoId === selectedPhotoId) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);

      // Selected badge
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(rx, ry, Math.min(rw, 70), 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('SELECTED', rx + 6, ry + 14);
    }

    // Debug mode annotations
    if (debugMode) {
      ctx.strokeStyle = p.isAnchor ? 'rgba(234, 179, 8, 0.85)' : 'rgba(16, 185, 129, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

      if (rw > 45 && rh > 25) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(rx + 2, ry + 2, Math.min(rw - 4, 110), 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        const arStr = (p.width / p.height).toFixed(2);
        ctx.fillText(`${Math.round(p.width)}x${Math.round(p.height)} (${arStr})`, rx + 4, ry + 14);
      }
    }
  }
}
