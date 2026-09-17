import { Placement, Photo } from '../types';

export interface ExportOptions {
  placements: Placement[];
  photosMap: Map<string, Photo>;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  format: 'png' | 'jpeg' | 'webp';
  quality: number; // 0.70 to 1.0 (for jpeg and webp)
  filename?: string;
  onProgress?: (progress: number) => void;
}

/**
 * Ensures full-resolution image element is ready for export drawing.
 */
async function ensureImageReady(photo: Photo): Promise<HTMLImageElement> {
  if (photo.image && (photo.image as HTMLImageElement).complete) {
    return photo.image as HTMLImageElement;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${photo.name}`));
    img.src = photo.sourceUrl;
  });
}

/**
 * Performs high-resolution collage rendering and initiates direct file download.
 */
export async function exportHighResCollage({
  placements,
  photosMap,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  format,
  quality,
  filename,
  onProgress,
}: ExportOptions): Promise<void> {
  // Test canvas size support
  const maxDimension = 8192;
  if (canvasWidth > maxDimension || canvasHeight > maxDimension) {
    // Check if browser allows canvas of this dimension
    try {
      const testCanvas = document.createElement('canvas');
      testCanvas.width = canvasWidth;
      testCanvas.height = canvasHeight;
      const testCtx = testCanvas.getContext('2d');
      if (!testCtx) {
        throw new Error('Browser exceeded maximum canvas allocation limit.');
      }
    } catch (e) {
      throw new Error(
        `Your browser cannot allocate a ${canvasWidth}×${canvasHeight} canvas due to hardware memory limits. Please try 4K (3840×2160) or Full HD.`
      );
    }
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvasWidth;
  exportCanvas.height = canvasHeight;
  const ctx = exportCanvas.getContext('2d', { alpha: format === 'png' || format === 'webp' });

  if (!ctx) {
    throw new Error('Could not create 2D export canvas context.');
  }

  // Draw background
  if (backgroundColor === 'transparent' && (format === 'png' || format === 'webp')) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = backgroundColor && backgroundColor !== 'transparent' ? backgroundColor : '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  const total = placements.length;
  let processed = 0;

  for (const p of placements) {
    const photo = photosMap.get(p.photoId);
    if (!photo) continue;

    try {
      const img = await ensureImageReady(photo);
      // Draw the full original image directly with zero crop and zero distortion
      ctx.drawImage(img, p.x, p.y, p.width, p.height);
    } catch (err) {
      // Fallback: draw placeholder color block
      ctx.fillStyle = photo.averageColor || '#444';
      ctx.fillRect(p.x, p.y, p.width, p.height);
    }

    processed++;
    if (onProgress && processed % 5 === 0) {
      onProgress(Math.round((processed / total) * 90));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (onProgress) onProgress(95);

  // Convert canvas to blob
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const exportQuality = format === 'png' ? undefined : Math.min(1, Math.max(0.1, quality));

  const blob: Blob = await new Promise((resolve, reject) => {
    exportCanvas.toBlob(
      b => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob failed to produce image data.'));
      },
      mimeType,
      exportQuality
    );
  });

  if (onProgress) onProgress(100);

  // Trigger browser download
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = filename || `photohive-${canvasWidth}x${canvasHeight}-${Date.now()}.${format === 'jpeg' ? 'jpg' : format}`;
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Clean up object URL after short delay
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
