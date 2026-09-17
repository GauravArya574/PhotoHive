import React, { useRef, useEffect, useState } from 'react';
import { Photo } from '../types';

interface PhotoImporterProps {
  onPhotosLoaded: (newPhotos: Photo[]) => void;
  children: (helpers: {
    openPhotoPicker: () => void;
    openFolderPicker: () => void;
  }) => React.ReactNode;
}

/**
 * Loads an image file, calculates dimensions and thumbnail, and returns Photo object.
 */
async function processImageFile(file: File): Promise<Photo> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 600;
      const aspectRatio = width / Math.max(1, height);

      // Create a downscaled thumbnail (max 200px) to conserve memory
      const thumbCanvas = document.createElement('canvas');
      const maxThumb = 200;
      let tw = maxThumb;
      let th = Math.round(maxThumb / aspectRatio);
      if (aspectRatio < 1) {
        th = maxThumb;
        tw = Math.round(maxThumb * aspectRatio);
      }
      thumbCanvas.width = tw;
      thumbCanvas.height = th;
      const tCtx = thumbCanvas.getContext('2d');
      if (tCtx) {
        tCtx.drawImage(img, 0, 0, tw, th);
      }
      const thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

      resolve({
        id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        file,
        sourceUrl: objectUrl,
        thumbnailUrl,
        image: img,
        width,
        height,
        aspectRatio,
        fileSize: file.size,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode image: ${file.name}`));
    };

    img.src = objectUrl;
  });
}

/**
 * Recursively scans directory entries from a drag-and-drop event.
 */
async function scanFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];

  const traverseEntry = async (entry: any): Promise<void> => {
    if (entry.isFile) {
      return new Promise<void>(resolve => {
        entry.file((file: File) => {
          if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name)) {
            files.push(file);
          }
          resolve();
        }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      return new Promise<void>(resolve => {
        const readBatch = () => {
          reader.readEntries(async (entries: any[]) => {
            if (entries.length === 0) {
              resolve();
            } else {
              for (const child of entries) {
                await traverseEntry(child);
              }
              readBatch();
            }
          }, () => resolve());
        };
        readBatch();
      });
    }
  };

  const promises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
    if (entry) {
      promises.push(traverseEntry(entry));
    } else {
      const file = item.getAsFile();
      if (file && (file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name))) {
        files.push(file);
      }
    }
  }

  await Promise.all(promises);
  return files;
}

export const PhotoImporter: React.FC<PhotoImporterProps> = ({ onPhotosLoaded, children }) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name)
    );

    if (files.length === 0) return;

    let successCount = 0;
    let failCount = 0;
    const loaded: Photo[] = [];

    for (const file of files) {
      try {
        const photo = await processImageFile(file);
        loaded.push(photo);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    if (loaded.length > 0) {
      onPhotosLoaded(loaded);
    }

    if (failCount > 0) {
      setLoadingError(`${failCount} image(s) could not be loaded due to format or decode errors.`);
      setTimeout(() => setLoadingError(null), 5000);
    }
  };

  const openPhotoPicker = () => {
    photoInputRef.current?.click();
  };

  const openFolderPicker = () => {
    folderInputRef.current?.click();
  };

  // Drag and drop listeners on window
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null) {
        setIsDragOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer && e.dataTransfer.items) {
        const scannedFiles = await scanFilesFromDataTransfer(e.dataTransfer.items);
        if (scannedFiles.length > 0) {
          handleFiles(scannedFiles);
        }
      } else if (e.dataTransfer && e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <>
      {/* Hidden native file pickers */}
      <input
        ref={photoInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-ignore - directory picker attributes
        webkitdirectory=""
        directory=""
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Global Drag-over visual indicator */}
      {isDragOver && (
        <div className="fixed inset-0 bg-amber-500/20 backdrop-blur-xs border-4 border-dashed border-amber-400 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-[#121319] border border-amber-500/50 p-6 rounded-2xl shadow-2xl text-center">
            <p className="text-lg font-bold text-white mb-1">Drop Photos or Folders Here</p>
            <p className="text-xs text-amber-300">PhotoHive will extract dimensions and pack them immediately</p>
          </div>
        </div>
      )}

      {/* Error notification banner */}
      {loadingError && (
        <div className="fixed top-14 right-4 z-50 bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2.5 rounded-lg text-xs shadow-xl flex items-center gap-2">
          <span>⚠️ {loadingError}</span>
          <button onClick={() => setLoadingError(null)} className="ml-2 font-bold text-white">✕</button>
        </div>
      )}

      {children({ openPhotoPicker, openFolderPicker })}
    </>
  );
};
