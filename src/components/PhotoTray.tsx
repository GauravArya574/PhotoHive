import React, { useState } from 'react';
import { Photo, Placement } from '../types';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  FolderPlus,
  Image as ImageIcon,
  Search,
  Filter,
} from 'lucide-react';

interface PhotoTrayProps {
  photos: Photo[];
  placements: Placement[];
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string | null) => void;
  onRemovePhoto: (id: string) => void;
  onClearAll: () => void;
  onOpenPhotoPicker: () => void;
  onOpenFolderPicker: () => void;
}

export const PhotoTray: React.FC<PhotoTrayProps> = ({
  photos,
  placements,
  selectedPhotoId,
  onSelectPhoto,
  onRemovePhoto,
  onClearAll,
  onOpenPhotoPicker,
  onOpenFolderPicker,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAspect, setFilterAspect] = useState<'all' | 'landscape' | 'portrait' | 'square'>('all');

  const placedSet = new Set(placements.map(p => p.photoId));

  const filteredPhotos = photos.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterAspect === 'landscape') return p.aspectRatio > 1.15;
    if (filterAspect === 'portrait') return p.aspectRatio < 0.85;
    if (filterAspect === 'square') return p.aspectRatio >= 0.85 && p.aspectRatio <= 1.15;
    return true;
  });

  if (photos.length === 0) return null;

  return (
    <div className="bg-[#121319] border-t border-[#22242f] text-zinc-300 text-xs transition-all select-none">
      {/* Drawer Toggle Bar */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-[#1c1e28]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpen(prev => !prev)}
            className="flex items-center gap-1.5 font-semibold text-white hover:text-amber-400 transition-colors"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <span>Photos Tray</span>
            <span className="bg-[#1e202c] text-zinc-400 font-mono text-[10px] px-2 py-0.5 rounded-full border border-[#2d3042]">
              {photos.length}
            </span>
          </button>

          {isOpen && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-400">
              <span>•</span>
              <span>{placements.length} placed in collage</span>
            </div>
          )}
        </div>

        {isOpen && (
          <div className="flex items-center gap-2">
            {/* Search filter */}
            <div className="relative hidden md:block">
              <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-400" />
              <input
                type="text"
                placeholder="Filter photos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-[#181922] border border-[#282a3a] rounded-md pl-7 pr-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500 w-36"
              />
            </div>

            {/* Aspect filter */}
            <select
              value={filterAspect}
              onChange={e => setFilterAspect(e.target.value as any)}
              className="bg-[#181922] border border-[#282a3a] rounded-md px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
            >
              <option value="all">All Ratios</option>
              <option value="landscape">Landscape (&gt;1.15)</option>
              <option value="portrait">Portrait (&lt;0.85)</option>
              <option value="square">Square (~1:1)</option>
            </select>

            <button
              onClick={onOpenPhotoPicker}
              className="flex items-center gap-1 bg-[#1a1b24] hover:bg-[#252838] border border-[#2c2f40] px-2.5 py-1 rounded text-[11px] text-zinc-200 hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Photos</span>
            </button>

            <button
              onClick={onOpenFolderPicker}
              className="flex items-center gap-1 bg-[#1a1b24] hover:bg-[#252838] border border-[#2c2f40] px-2.5 py-1 rounded text-[11px] text-zinc-200 hover:text-white transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Folder</span>
            </button>

            <button
              onClick={onClearAll}
              className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 px-2 py-1 rounded text-[11px] transition-colors border border-rose-500/20"
              title="Remove all photos"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Photo Thumbnails Strip */}
      {isOpen && (
        <div className="p-3 max-h-40 overflow-x-auto overflow-y-hidden flex items-center gap-2.5">
          {filteredPhotos.map(photo => {
            const isSelected = photo.id === selectedPhotoId;
            const isPlaced = placedSet.has(photo.id);

            return (
              <div
                key={photo.id}
                onClick={() => onSelectPhoto(isSelected ? null : photo.id)}
                className={`relative group shrink-0 w-24 h-24 rounded-lg overflow-hidden border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105'
                    : 'border-[#282a38] hover:border-zinc-400'
                }`}
              >
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                />

                {/* Info Overlay on hover / active */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-1.5 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-mono bg-black/60 px-1 py-0.5 rounded text-zinc-300">
                      {photo.aspectRatio.toFixed(2)}:1
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onRemovePhoto(photo.id);
                      }}
                      className="text-rose-400 hover:text-rose-200 p-0.5 bg-black/60 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="truncate text-[10px] text-white font-medium">
                    {photo.name}
                  </div>
                </div>

                {!isPlaced && (
                  <div className="absolute top-1 right-1 bg-amber-500 text-black text-[9px] font-bold px-1 rounded">
                    Unused
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
