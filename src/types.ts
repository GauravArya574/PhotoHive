export interface Photo {
  id: string;
  name: string;
  file?: File;
  sourceUrl: string; // Object URL or data URL
  thumbnailUrl: string;
  image?: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
  aspectRatio: number; // width / height
  fileSize?: number;
  averageColor?: string;
  isSample?: boolean;
}

export interface Placement {
  photoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number; // original photo aspect ratio
  isAnchor?: boolean;
}

export type LayoutMode = 'balanced_mosaic';

export type VariationLevel = 'low' | 'medium' | 'high';

export interface LayoutSettings {
  mode: LayoutMode;
  canvasWidth: number;
  canvasHeight: number;
  presetName: string;
  sizeVariation: VariationLevel; // 'low' (uniform) | 'medium' (balanced) | 'high' (dynamic)
  randomness: VariationLevel;
  spacing: number; // 0, 1, 2, 4, 8, 12, 20
  minPhotoSize: number; // in pixels (e.g. 50)
  maxPhotoSize: number; // in pixels (e.g. 1200)
  keepAllPhotos: boolean;
  backgroundColor: string; // e.g. '#000000', '#ffffff', 'transparent'
  colorBalance: boolean;
  seed: number;
}

export interface CandidateScore {
  totalScore: number;
  coverage: number; // 0 to 1
  aspectRatioFidelity: number; // 1.0 = perfect original ratio
  sizeDistributionScore: number; // 0 to 1, rewards controlled area distribution
  sizeDiversity?: number; // legacy alias for sizeDistributionScore
  visualBalance: number; // 0 to 1
  visualComposition: number; // 0 to 1
  anchorDistribution: number; // 0 to 1
  microscopicPhotoPenalty: number;
  extremeSizeRatioPenalty: number;
  repetitionPenalty: number;
  tinyPhotoPenalty?: number;
  stripPenalty?: number;

  // Global area & dimension statistics
  minPhotoArea: number;
  maxPhotoArea: number;
  medianPhotoArea: number;
  meanPhotoArea: number;
  minScaleFactor: number; // minPhotoArea / targetAvgArea
  maxScaleFactor: number; // maxPhotoArea / targetAvgArea
  sizeRatio: number; // maxPhotoArea / minPhotoArea
  minDimension: number; // smallest width or height across all photos
  p10Area: number; // 10th percentile photo area
  p25Area: number; // 25th percentile photo area
  p75Area: number; // 75th percentile photo area
  p90Area: number; // 90th percentile photo area
}

export interface LayoutResult {
  placements: Placement[];
  canvasWidth: number;
  canvasHeight: number;
  coverage: number; // Percentage, e.g. 99.9%
  score: CandidateScore;
  seed: number;
  executionTimeMs: number;
  sanityCheck: {
    hasCollisions: boolean;
    hasOutOfBounds: boolean;
    hasDistortion: boolean;
    placedCount: number;
    totalCount: number;
    details: string;
  };
}

export interface CanvasPreset {
  name: string;
  label: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { name: 'fhd', label: '1920 × 1080 — Full HD', width: 1920, height: 1080 },
  { name: 'qhd', label: '2560 × 1440 — QHD', width: 2560, height: 1440 },
  { name: '4k', label: '3840 × 2160 — 4K UHD', width: 3840, height: 2160 },
  { name: '8k', label: '7680 × 4320 — 8K UHD', width: 7680, height: 4320 },
  { name: 'vertical_fhd', label: '1080 × 1920 — Vertical Full HD', width: 1080, height: 1920 },
  { name: 'square', label: '2048 × 2048 — Square HD', width: 2048, height: 2048 },
  { name: 'custom', label: 'Custom', width: 1920, height: 1080 },
];

export interface ProjectData {
  version: string;
  timestamp: number;
  settings: LayoutSettings;
  photos: {
    id: string;
    name: string;
    width: number;
    height: number;
    aspectRatio: number;
  }[];
  placements: Placement[];
}
