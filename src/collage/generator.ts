import { Photo, Placement, LayoutSettings, LayoutResult } from '../types';
import { SeededRNG } from './random';
import { scoreLayout } from './scoring';
import {
  buildPhotoHiveTree,
  buildBalancedMosaicTree,
  buildJustifiedLayout,
  buildMasonryLayout,
  buildGridLayout,
  layoutNodeToPlacements,
  getNodeAspectRatio,
  enforceUniformScaleBounds,
} from './packing';

/**
 * Validates geometric sanity of placements.
 */
function performSanityChecks(
  placements: Placement[],
  canvasWidth: number,
  canvasHeight: number,
  expectedCount: number
) {
  let hasCollisions = false;
  let hasOutOfBounds = false;
  let hasDistortion = false;
  let details = 'All sanity checks passed.';

  // Bounds and NaN check
  for (const p of placements) {
    if (isNaN(p.x) || isNaN(p.y) || isNaN(p.width) || isNaN(p.height)) {
      hasOutOfBounds = true;
      details = 'Found NaN coordinates in placements.';
      break;
    }
    if (p.x < 0 || p.y < 0 || p.x + p.width > canvasWidth + 1 || p.y + p.height > canvasHeight + 1) {
      hasOutOfBounds = true;
      details = `Placement for photo ${p.photoId} exceeds canvas boundaries [${p.x}, ${p.y}, ${p.width}, ${p.height}].`;
      break;
    }
    // Distortion check
    const currentRatio = p.width / Math.max(1, p.height);
    if (Math.abs(currentRatio - p.aspectRatio) / p.aspectRatio > 0.08) {
      hasDistortion = true;
      details = `Aspect ratio deviation for photo ${p.photoId}: expected ${p.aspectRatio.toFixed(2)}, got ${currentRatio.toFixed(2)}.`;
    }
  }

  // Collision check (sampling if large photo count)
  const checkLimit = Math.min(placements.length, 120);
  for (let i = 0; i < checkLimit; i++) {
    const a = placements[i];
    for (let j = i + 1; j < checkLimit; j++) {
      const b = placements[j];
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (overlapX > 2 && overlapY > 2) {
        hasCollisions = true;
        details = `Collision detected between ${a.photoId} and ${b.photoId}.`;
        break;
      }
    }
    if (hasCollisions) break;
  }

  return {
    hasCollisions,
    hasOutOfBounds,
    hasDistortion,
    placedCount: placements.length,
    totalCount: expectedCount,
    details,
  };
}

/**
 * Main Layout Generator:
 * Generates N candidate layouts using stochastic sampling, scores them according to aesthetic
 * criteria, and returns the highest-scoring candidate with full metadata and sanity verification.
 */
export async function generateCollageLayout(
  photos: Photo[],
  settings: LayoutSettings,
  onProgress?: (progress: number, candidateIndex: number) => void
): Promise<LayoutResult> {
  const startTime = performance.now();

  if (!photos || photos.length === 0) {
    return {
      placements: [],
      canvasWidth: settings.canvasWidth,
      canvasHeight: settings.canvasHeight,
      coverage: 0,
      score: scoreLayout([], settings.canvasWidth, settings.canvasHeight, settings),
      seed: settings.seed,
      executionTimeMs: 0,
      sanityCheck: {
        hasCollisions: false,
        hasOutOfBounds: false,
        hasDistortion: false,
        placedCount: 0,
        totalCount: 0,
        details: 'No photos to place.',
      },
    };
  }

  // Determine candidate count based on photo count and performance budget
  const count = photos.length;
  let candidateCount = 24;
  if (count <= 25) candidateCount = 36;
  else if (count <= 80) candidateCount = 20;
  else if (count <= 200) candidateCount = 14;
  else candidateCount = 8; // 500+ photos

  const canvasWidth = settings.canvasWidth;
  const canvasHeight = settings.canvasHeight;
  const targetAspect = canvasWidth / canvasHeight;

  let bestPlacements: Placement[] = [];
  let bestScore = -Infinity;
  let bestScoreObj = scoreLayout([], canvasWidth, canvasHeight, settings);

  for (let c = 0; c < candidateCount; c++) {
    // Deterministic seed for each candidate iteration derived from settings.seed
    const iterSeed = (settings.seed + c * 7919) >>> 0;
    const rng = new SeededRNG(iterSeed);

    let candidatePlacements: Placement[] = [];

    switch (settings.mode) {
      case 'photohive': {
        const tree = buildPhotoHiveTree(photos, targetAspect, rng, settings);
        candidatePlacements = layoutNodeToPlacements(
          tree,
          0,
          0,
          canvasWidth,
          canvasHeight,
          settings.spacing
        );
        break;
      }
      case 'balanced_mosaic': {
        if (settings.sizeVariation === 'low') {
          // Scale factor 0.70x-1.30x is the absolute first priority in uniform mode.
          // Build tree with target area constraints to guarantee both scale bounds and coverage.
          const tree = buildPhotoHiveTree(photos, targetAspect, rng, settings);
          candidatePlacements = layoutNodeToPlacements(
            tree,
            0,
            0,
            canvasWidth,
            canvasHeight,
            settings.spacing
          );
        } else {
          const tree = buildBalancedMosaicTree(photos, targetAspect, rng, settings);
          const treeAspect = getNodeAspectRatio(tree);

          let placeW: number;
          let placeH: number;
          let startX: number;
          let startY: number;

          if (treeAspect >= targetAspect) {
            // Tree is wider than canvas ratio -> fit width, center vertically
            placeW = canvasWidth;
            placeH = Math.max(1, Math.round(canvasWidth / treeAspect));
            startX = 0;
            startY = Math.max(0, Math.round((canvasHeight - placeH) / 2));
          } else {
            // Tree is taller than canvas ratio -> fit height, center horizontally
            placeH = canvasHeight;
            placeW = Math.max(1, Math.round(canvasHeight * treeAspect));
            startX = Math.max(0, Math.round((canvasWidth - placeW) / 2));
            startY = 0;
          }

          candidatePlacements = layoutNodeToPlacements(
            tree,
            startX,
            startY,
            placeW,
            placeH,
            settings.spacing,
            [],
            true // forceAspectRatio = true (never stretch, never crop)
          );
        }
        break;
      }
      case 'justified': {
        candidatePlacements = buildJustifiedLayout(
          photos,
          canvasWidth,
          canvasHeight,
          rng,
          settings
        );
        break;
      }
      case 'masonry': {
        candidatePlacements = buildMasonryLayout(
          photos,
          canvasWidth,
          canvasHeight,
          rng,
          settings
        );
        break;
      }
      case 'grid': {
        candidatePlacements = buildGridLayout(
          photos,
          canvasWidth,
          canvasHeight,
          rng,
          settings
        );
        break;
      }
    }

    // In uniform mode, strictly enforce 0.70x–1.30x scale factor bounds
    if (settings.sizeVariation === 'low') {
      candidatePlacements = enforceUniformScaleBounds(
        candidatePlacements,
        canvasWidth,
        canvasHeight,
        settings.spacing
      );
    }

    // Aesthetic evaluation
    const scoreObj = scoreLayout(candidatePlacements, canvasWidth, canvasHeight, settings);

    // Prioritize candidates:
    // Priority 1: Scale factor strictly within [0.70x, 1.30x] in uniform mode
    // Priority 2: High coverage (>= 97%)
    // Priority 3: Aesthetic totalScore
    const targetArea = (canvasWidth * canvasHeight) / count;
    let candidateViolatesBounds = false;
    if (settings.sizeVariation === 'low') {
      for (const p of candidatePlacements) {
        const r = (p.width * p.height) / targetArea;
        if (r < 0.6999 || r > 1.3001) {
          candidateViolatesBounds = true;
          break;
        }
      }
    }

    const candidateCoverage = scoreObj.coverage;
    const isHighCoverage = candidateCoverage >= 0.97;
    const bestIsHighCoverage = bestScoreObj.coverage >= 0.97;
    let bestViolatesBounds = false;
    if (settings.sizeVariation === 'low' && bestPlacements.length > 0) {
      for (const p of bestPlacements) {
        const r = (p.width * p.height) / targetArea;
        if (r < 0.6999 || r > 1.3001) {
          bestViolatesBounds = true;
          break;
        }
      }
    }

    let isBetter = false;
    if (c === 0) {
      isBetter = true;
    } else if (bestViolatesBounds && !candidateViolatesBounds) {
      isBetter = true;
    } else if (!bestViolatesBounds && candidateViolatesBounds) {
      isBetter = false;
    } else if (isHighCoverage && !bestIsHighCoverage) {
      isBetter = true;
    } else if (!isHighCoverage && bestIsHighCoverage) {
      isBetter = false;
    } else if (isHighCoverage && bestIsHighCoverage) {
      isBetter = scoreObj.totalScore > bestScore;
    } else {
      isBetter =
        candidateCoverage > bestScoreObj.coverage ||
        (candidateCoverage === bestScoreObj.coverage && scoreObj.totalScore > bestScore);
    }

    if (isBetter) {
      bestScore = scoreObj.totalScore;
      bestPlacements = candidatePlacements;
      bestScoreObj = scoreObj;
    }

    if (onProgress && c % 4 === 0) {
      onProgress(Math.round(((c + 1) / candidateCount) * 100), c + 1);
      // Give UI breathing room if very large set
      if (count > 150) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  if (settings.sizeVariation === 'low') {
    bestPlacements = enforceUniformScaleBounds(
      bestPlacements,
      canvasWidth,
      canvasHeight,
      settings.spacing
    );
  }

  const sanityCheck = performSanityChecks(
    bestPlacements,
    canvasWidth,
    canvasHeight,
    photos.length
  );

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    placements: bestPlacements,
    canvasWidth,
    canvasHeight,
    coverage: Math.round(bestScoreObj.coverage * 1000) / 10,
    score: bestScoreObj,
    seed: settings.seed,
    executionTimeMs,
    sanityCheck,
  };
}
