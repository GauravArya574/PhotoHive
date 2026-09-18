import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Placement, Photo, LayoutSettings } from '../types';
import { renderPreview } from '../rendering/previewRenderer';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowLeftRight,
  Trash2,
  Image as ImageIcon,
  FolderPlus,
  Sparkles,
  Info,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface CollagePreviewProps {
  placements: Placement[];
  photos: Photo[];
  settings: LayoutSettings;
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string | null) => void;
  onSwapPhotos: (idA: string, idB: string) => void;
  onRemovePhoto: (id: string) => void;
  onOpenPhotoPicker: () => void;
  onOpenFolderPicker: () => void;
  onLoadSamplePack: (count: number) => void;
  debugMode: boolean;
  isGenerating: boolean;
  generationProgress: number;
}

export const CollagePreview: React.FC<CollagePreviewProps> = ({
  placements,
  photos,
  settings,
  selectedPhotoId,
  onSelectPhoto,
  onSwapPhotos,
  onRemovePhoto,
  onOpenPhotoPicker,
  onOpenFolderPicker,
  onLoadSamplePack,
  debugMode,
  isGenerating,
  generationProgress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hoverPhotoId, setHoverPhotoId] = useState<string | null>(null);
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

  // Zoom and Pan states
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = fit
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Fast photo lookup map
  const photosMap = React.useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) {
      map.set(p.id, p);
    }
    return map;
  }, [photos]);

  // Adjust canvas internal resolution to match container while keeping exact aspect ratio
  const updateCanvasDimensions = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const contWidth = container.clientWidth - 32;
    const contHeight = container.clientHeight - 32;
    if (contWidth <= 0 || contHeight <= 0) return;

    const targetAspect = settings.canvasWidth / settings.canvasHeight;
    const contAspect = contWidth / contHeight;

    let renderW = contWidth;
    let renderH = contHeight;

    if (contAspect > targetAspect) {
      renderH = contHeight;
      renderW = renderH * targetAspect;
    } else {
      renderW = contWidth;
      renderH = renderW / targetAspect;
    }

    // Set preview resolution (sharpen for Retina/HiDPI, capped at 2560 for smooth preview performance)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.round(renderW * dpr);
    const pixelH = Math.round(renderH * dpr);

    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    canvas.style.width = `${Math.round(renderW)}px`;
    canvas.style.height = `${Math.round(renderH)}px`;

    // Redraw
    renderPreview({
      canvas,
      placements,
      photosMap,
      canvasWidth: settings.canvasWidth,
      canvasHeight: settings.canvasHeight,
      backgroundColor: settings.backgroundColor,
      selectedPhotoId,
      hoverPhotoId,
      debugMode,
    });
  }, [
    placements,
    photosMap,
    settings.canvasWidth,
    settings.canvasHeight,
    settings.backgroundColor,
    selectedPhotoId,
    hoverPhotoId,
    debugMode,
  ]);

  useEffect(() => {
    updateCanvasDimensions();
    const observer = new ResizeObserver(() => updateCanvasDimensions());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateCanvasDimensions]);

  // Handle canvas mouse move (for hover hit-testing)
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Convert normalized [0, 1] to logical canvas coordinates
    const logicalX = clickX * settings.canvasWidth;
    const logicalY = clickY * settings.canvasHeight;

    return { logicalX, logicalY };
  };

  const findPlacementAt = (logicalX: number, logicalY: number): Placement | null => {
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i];
      if (
        logicalX >= p.x &&
        logicalX <= p.x + p.width &&
        logicalY >= p.y &&
        logicalY <= p.y + p.height
      ) {
        return p;
      }
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
      return;
    }

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const hit = findPlacementAt(coords.logicalX, coords.logicalY);
    setHoverPhotoId(hit ? hit.photoId : null);
  };

  const handleMouseLeave = () => {
    setHoverPhotoId(null);
    setIsPanning(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const hit = findPlacementAt(coords.logicalX, coords.logicalY);

    if (isSwapMode && swapSourceId) {
      if (hit && hit.photoId !== swapSourceId) {
        onSwapPhotos(swapSourceId, hit.photoId);
      }
      setIsSwapMode(false);
      setSwapSourceId(null);
      return;
    }

    if (hit) {
      onSelectPhoto(hit.photoId === selectedPhotoId ? null : hit.photoId);
    } else {
      onSelectPhoto(null);
    }
  };

  // Zoom controls
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Swap action initiator
  const startPhotoSwap = () => {
    if (!selectedPhotoId) return;
    setIsSwapMode(true);
    setSwapSourceId(selectedPhotoId);
  };

  const cancelSwap = () => {
    setIsSwapMode(false);
    setSwapSourceId(null);
  };

  const selectedPhoto = selectedPhotoId ? photosMap.get(selectedPhotoId) : null;
  const selectedPlacement = selectedPhotoId
    ? placements.find(p => p.photoId === selectedPhotoId)
    : null;

  return (
    <div className="relative flex-1 h-full w-full bg-[#0a0a0d] overflow-hidden flex flex-col items-center justify-center select-none">
      {/* Swap Mode Banner */}
      {isSwapMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-amber-500 text-black px-4 py-2 rounded-full shadow-lg font-medium text-xs flex items-center gap-2 animate-bounce">
          <ArrowLeftRight className="w-4 h-4" />
          <span>Click another photo to swap positions</span>
          <button
            onClick={cancelSwap}
            className="ml-2 bg-black/20 hover:bg-black/30 px-2 py-0.5 rounded text-[11px] font-bold"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Generation Progress Overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center z-40">
          <div className="bg-[#181922] border border-[#2d2f3d] p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 text-center">
            <div className="h-12 w-12 mx-auto rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3 animate-spin">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-base mb-1">Optimizing PhotoHive</h3>
            <p className="text-zinc-400 text-xs mb-4">
              Evaluating candidate layouts for zero gaps & aspect-ratio fidelity...
            </p>
            <div className="w-full bg-[#121318] rounded-full h-2 overflow-hidden border border-[#282a36]">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-150"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <span className="text-[11px] text-amber-400 font-mono mt-2 block font-semibold">
              {generationProgress}%
            </span>
          </div>
        </div>
      )}

      {/* Canvas Display or Empty Dropzone State */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center p-4 overflow-hidden relative cursor-crosshair"
      >
        {photos.length === 0 ? (
          // Empty State Dropzone
          <div className="max-w-md w-full bg-[#13141b] border-2 border-dashed border-[#282b3a] hover:border-amber-500/50 rounded-2xl p-8 text-center transition-colors">
            <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <ImageIcon className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Create a PhotoHive</h2>
            <p className="text-zinc-400 text-xs mb-6 max-w-xs mx-auto">
              Drop your photos here to generate an irregular, tightly packed photo mosaic with zero gaps
              and no cropping.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-6">
              <button
                onClick={onOpenPhotoPicker}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg text-xs transition-colors shadow-md shadow-amber-500/20"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Choose Photos</span>
              </button>
              <button
                onClick={onOpenFolderPicker}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#1c1e28] hover:bg-[#252836] text-zinc-200 border border-[#2e3142] font-semibold px-4 py-2 rounded-lg text-xs transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Choose Folder</span>
              </button>
            </div>

            <div className="pt-4 border-t border-[#1f212c]">
              <span className="text-[11px] text-zinc-400 font-medium block mb-2">
                Or test with instant artistic sample packs:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => onLoadSamplePack(24)}
                  className="bg-[#1c1e28] hover:bg-amber-500/20 hover:text-amber-300 text-zinc-300 border border-[#2c2e3d] text-xs px-2.5 py-1 rounded-md transition-colors"
                >
                  24 Photos
                </button>
                <button
                  onClick={() => onLoadSamplePack(60)}
                  className="bg-[#1c1e28] hover:bg-amber-500/20 hover:text-amber-300 text-zinc-300 border border-[#2c2e3d] text-xs px-2.5 py-1 rounded-md transition-colors"
                >
                  60 Photos
                </button>
                <button
                  onClick={() => onLoadSamplePack(120)}
                  className="bg-[#1c1e28] hover:bg-amber-500/20 hover:text-amber-300 text-zinc-300 border border-[#2c2e3d] text-xs px-2.5 py-1 rounded-md transition-colors"
                >
                  120 Photos
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Your photos stay on your device. Processed 100% locally.</span>
            </div>
          </div>
        ) : (
          <div
            className="transition-transform duration-100 ease-out shadow-2xl rounded-sm relative"
            style={{
              transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              className="rounded-sm block shadow-2xl border border-[#22242e]"
            />
          </div>
        )}

        {/* Live Generation & Optimization Loading Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-[#0a0a0e]/75 backdrop-blur-xs z-40 flex flex-col items-center justify-center p-4 select-none">
            <div className="bg-[#14151e]/95 border border-[#2e3144] p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm w-full">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
                  <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <span className="flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-white text-sm">Finding Optimal Layout</h4>
                <p className="text-xs text-zinc-400">
                  Searching permutations to satisfy size and coverage constraints...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-zinc-400">Constraint Optimization</span>
                  <span className="text-amber-300 font-semibold">{Math.max(5, Math.min(100, Math.round(generationProgress)))}%</span>
                </div>
                <div className="h-2 w-full bg-[#202230] rounded-full overflow-hidden p-0.5 border border-[#2a2c3e]">
                  <div
                    className="h-full bg-linear-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-150 ease-out"
                    style={{ width: `${Math.max(5, Math.min(100, generationProgress))}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 pt-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>
                  {settings.sizeVariation === 'low'
                    ? 'Uniform Mode • Scale locked (0.7×–1.3×)'
                    : settings.sizeVariation === 'medium'
                    ? 'Balanced Mode • Harmonized ratios'
                    : 'Dynamic Mode • Varied scales'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Selected Photo Quick Toolbar */}
      {selectedPhoto && selectedPlacement && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-[#161720]/95 backdrop-blur-md border border-[#2c2e3d] px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-4 text-xs text-zinc-200">
          <div className="flex items-center gap-2 border-r border-[#2c2e3d] pr-3">
            <img
              src={selectedPhoto.thumbnailUrl}
              alt=""
              className="w-7 h-7 rounded object-cover border border-[#3b3e52]"
            />
            <div>
              <p className="font-semibold text-white truncate max-w-[130px] leading-tight">
                {selectedPhoto.name}
              </p>
              <p className="text-[10px] text-zinc-400 leading-tight">
                {Math.round(selectedPlacement.width)}×{Math.round(selectedPlacement.height)} • {(
                  (selectedPlacement.width * selectedPlacement.height) /
                  Math.max(1, (settings.canvasWidth * settings.canvasHeight) / Math.max(1, photos.length))
                ).toFixed(2)}× target area
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={startPhotoSwap}
              className="flex items-center gap-1.5 bg-[#232532] hover:bg-[#2e3142] text-amber-300 px-2.5 py-1.5 rounded-md font-medium transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Swap</span>
            </button>

            <button
              onClick={() => onRemovePhoto(selectedPhoto.id)}
              className="flex items-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 px-2.5 py-1.5 rounded-md font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>

            <button
              onClick={() => onSelectPhoto(null)}
              className="text-zinc-400 hover:text-white px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Zoom and Fit Overlay Controls */}
      {photos.length > 0 && (
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-[#161720]/90 backdrop-blur-md border border-[#282a38] p-1 rounded-lg shadow-lg text-zinc-300">
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 hover:bg-[#252736] hover:text-white rounded transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono px-1.5 text-zinc-400 font-semibold min-w-[40px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 hover:bg-[#252736] hover:text-white rounded transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-[#2d3040] mx-0.5" />
          <button
            onClick={handleResetZoom}
            title="Fit to Screen"
            className="p-1.5 hover:bg-[#252736] hover:text-white rounded transition-colors text-xs flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-[10px]">Fit</span>
          </button>
        </div>
      )}
    </div>
  );
};
