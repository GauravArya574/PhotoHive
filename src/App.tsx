import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Photo, Placement, LayoutSettings, LayoutResult, ProjectData } from './types';
import { generateCollageLayout } from './collage/generator';
import { generateSamplePhotos } from './collage/samplePhotos';
import { exportHighResCollage } from './rendering/exportRenderer';
import { Header } from './components/Header';
import { CollagePreview } from './components/CollagePreview';
import { SettingsPanel } from './components/SettingsPanel';
import { PhotoTray } from './components/PhotoTray';
import { PhotoImporter } from './components/PhotoImporter';
import { DebugModal } from './components/DebugModal';

const INITIAL_SETTINGS: LayoutSettings = {
  mode: 'photohive',
  canvasWidth: 1920,
  canvasHeight: 1080,
  presetName: 'fhd',
  sizeVariation: 'medium',
  randomness: 'high',
  spacing: 0,
  minPhotoSize: 50,
  maxPhotoSize: 1200,
  keepAllPhotos: true,
  backgroundColor: '#0a0a0c',
  colorBalance: false,
  seed: 482913,
};

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [settings, setSettings] = useState<LayoutSettings>(INITIAL_SETTINGS);
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);

  // References for keeping state updated in async workflows
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  const settingsRef = useRef<LayoutSettings>(settings);
  settingsRef.current = settings;

  // Run layout generation
  const runLayout = useCallback(
    async (
      currentPhotos: Photo[] = photosRef.current,
      currentSettings: LayoutSettings = settingsRef.current
    ) => {
      if (currentPhotos.length === 0) {
        setLayoutResult(null);
        return;
      }

      setIsGenerating(true);
      setGenerationProgress(5);

      try {
        const result = await generateCollageLayout(
          currentPhotos,
          currentSettings,
          (progress) => {
            setGenerationProgress(progress);
          }
        );
        setLayoutResult(result);
      } catch (err) {
        console.error('Layout generation error:', err);
      } finally {
        setIsGenerating(false);
        setGenerationProgress(100);
      }
    },
    []
  );

  // Initialize with high-quality sample pack on initial mount
  useEffect(() => {
    const starterPack = generateSamplePhotos(24);
    setPhotos(starterPack);
    runLayout(starterPack, INITIAL_SETTINGS);
  }, [runLayout]);

  // Handle settings change
  const handleChangeSettings = (newSettings: LayoutSettings) => {
    setSettings(newSettings);
    runLayout(photos, newSettings);
  };

  // Handle Regenerate button click (picks new seed and runs layout)
  const handleRegenerate = () => {
    const newSeed = Math.floor(Math.random() * 900000) + 100000;
    const newSettings: LayoutSettings = { ...settings, seed: newSeed };
    setSettings(newSettings);
    runLayout(photos, newSettings);
  };

  // Load sample photos pack
  const handleLoadSamplePack = (count: number) => {
    const pack = generateSamplePhotos(count);
    setPhotos(pack);
    runLayout(pack, settings);
  };

  // Add newly uploaded photos
  const handlePhotosLoaded = (newPhotos: Photo[]) => {
    const combined = [...photos, ...newPhotos];
    setPhotos(combined);
    runLayout(combined, settings);
  };

  // Remove individual photo
  const handleRemovePhoto = (id: string) => {
    const updated = photos.filter(p => p.id !== id);
    setPhotos(updated);
    if (selectedPhotoId === id) setSelectedPhotoId(null);
    runLayout(updated, settings);
  };

  // Clear all photos
  const handleClearAll = () => {
    setPhotos([]);
    setLayoutResult(null);
    setSelectedPhotoId(null);
  };

  // Swap two photo placements
  const handleSwapPhotos = (idA: string, idB: string) => {
    if (!layoutResult) return;

    const placements = [...layoutResult.placements];
    const indexA = placements.findIndex(p => p.photoId === idA);
    const indexB = placements.findIndex(p => p.photoId === idB);

    if (indexA !== -1 && indexB !== -1) {
      // Swap their photoId assignments
      const tempId = placements[indexA].photoId;
      placements[indexA].photoId = placements[indexB].photoId;
      placements[indexB].photoId = tempId;

      setLayoutResult({
        ...layoutResult,
        placements,
      });
      setSelectedPhotoId(null);
    }
  };

  // Save project as JSON
  const handleSaveProject = () => {
    if (!layoutResult) return;

    const projectData: ProjectData = {
      version: '1.0',
      timestamp: Date.now(),
      settings,
      photos: photos.map(p => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        aspectRatio: p.aspectRatio,
      })),
      placements: layoutResult.placements,
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photohive-project-${settings.canvasWidth}x${settings.canvasHeight}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load project JSON
  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target?.result as string) as ProjectData;
        if (data && data.settings) {
          setSettings(data.settings);
          if (data.placements && layoutResult) {
            setLayoutResult({
              ...layoutResult,
              placements: data.placements,
              canvasWidth: data.settings.canvasWidth,
              canvasHeight: data.settings.canvasHeight,
            });
          } else {
            runLayout(photos, data.settings);
          }
        }
      } catch (err) {
        alert('Invalid PhotoHive project JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // High-Resolution Export handler
  const handleExport = async (format: 'png' | 'jpeg' | 'webp', quality: number) => {
    if (!layoutResult || layoutResult.placements.length === 0) {
      throw new Error('No collage placements to export.');
    }

    const photosMap = new Map<string, Photo>();
    for (const p of photos) {
      photosMap.set(p.id, p);
    }

    await exportHighResCollage({
      placements: layoutResult.placements,
      photosMap,
      canvasWidth: settings.canvasWidth,
      canvasHeight: settings.canvasHeight,
      backgroundColor: settings.backgroundColor,
      format,
      quality,
      filename: `photohive-${settings.canvasWidth}x${settings.canvasHeight}-seed${settings.seed}.${format === 'jpeg' ? 'jpg' : format}`,
    });
  };

  return (
    <PhotoImporter onPhotosLoaded={handlePhotosLoaded}>
      {({ openPhotoPicker, openFolderPicker }) => (
        <div className="h-screen w-screen flex flex-col bg-[#0b0c10] text-zinc-100 font-sans overflow-hidden">
          {/* Top Header */}
          <Header
            photoCount={photos.length}
            layoutResult={layoutResult}
            settings={settings}
            onLoadSamplePack={handleLoadSamplePack}
            onSaveProject={handleSaveProject}
            onLoadProject={handleLoadProject}
            onToggleDebug={() => setIsDebugModalOpen(true)}
            debugMode={debugOverlay}
          />

          {/* Main Working Area: Canvas Stage + Settings Sidebar */}
          <div className="flex-1 flex flex-row overflow-hidden relative">
            {/* Center Canvas Preview */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <CollagePreview
                placements={layoutResult ? layoutResult.placements : []}
                photos={photos}
                settings={settings}
                selectedPhotoId={selectedPhotoId}
                onSelectPhoto={setSelectedPhotoId}
                onSwapPhotos={handleSwapPhotos}
                onRemovePhoto={handleRemovePhoto}
                onOpenPhotoPicker={openPhotoPicker}
                onOpenFolderPicker={openFolderPicker}
                onLoadSamplePack={handleLoadSamplePack}
                debugMode={debugOverlay}
                isGenerating={isGenerating}
                generationProgress={generationProgress}
              />

              {/* Bottom Photos Tray */}
              <PhotoTray
                photos={photos}
                placements={layoutResult ? layoutResult.placements : []}
                selectedPhotoId={selectedPhotoId}
                onSelectPhoto={setSelectedPhotoId}
                onRemovePhoto={handleRemovePhoto}
                onClearAll={handleClearAll}
                onOpenPhotoPicker={openPhotoPicker}
                onOpenFolderPicker={openFolderPicker}
              />
            </div>

            {/* Right Settings Sidebar */}
            <SettingsPanel
              settings={settings}
              onChangeSettings={handleChangeSettings}
              onRegenerate={handleRegenerate}
              onExport={handleExport}
              isGenerating={isGenerating}
              photoCount={photos.length}
            />
          </div>

          {/* Layout Inspector & Sanity Debug Modal */}
          <DebugModal
            layoutResult={layoutResult}
            settings={settings}
            photoCount={photos.length}
            isOpen={isDebugModalOpen}
            onClose={() => setIsDebugModalOpen(false)}
            debugOverlay={debugOverlay}
            onToggleDebugOverlay={() => setDebugOverlay(prev => !prev)}
          />
        </div>
      )}
    </PhotoImporter>
  );
}
