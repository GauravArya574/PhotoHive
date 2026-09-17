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
      case 'photohive':
      case 'balanced_mosaic': {
        const tree = settings.mode === 'photohive'
          ? buildPhotoHiveTree(photos, targetAspect, rng, settings)
          : buildBalancedMosaicTree(photos, targetAspect, rng, settings);

        const treeAspect = getNodeAspectRatio(tree);

        let placeW: number;
        let placeH: number;
        let startX: number;
        let startY: number;

        if (treeAspect >= targetAspect) {
          placeW = canvasWidth;
          placeH = Math.max(1, Math.round(canvasWidth / treeAspect));
          startX = 0;
          startY = Math.max(0, Math.round((canvasHeight - placeH) / 2));
        } else {
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
          true
        );
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

    // Aesthetic evaluation
    const scoreObj = scoreLayout(candidatePlacements, canvasWidth, canvasHeight, settings);

    // Prioritize candidates:
    // In uniform mode: verify scale factor bounds [0.70x, 1.30x] relative to average photo area, coverage, then score
    let candidateBoundPenalty = 0;
    let candidateViolatesBounds = false;
    if (settings.sizeVariation === 'low' && candidatePlacements.length > 0) {
      const totalCandArea = candidatePlacements.reduce((s, p) => s + p.width * p.height, 0);
      const candAvgArea = totalCandArea / count;
      for (const p of candidatePlacements) {
        const r = (p.width * p.height) / candAvgArea;
        if (r < 0.6999) {
          candidateViolatesBounds = true;
          candidateBoundPenalty += (0.70 - r) * 100;
        } else if (r > 1.3001) {
          candidateViolatesBounds = true;
          candidateBoundPenalty += (r - 1.30) * 100;
        }
      }
    }

    const candidateCoverage = scoreObj.coverage;
    const isHighCoverage = candidateCoverage >= 0.97;
    const bestIsHighCoverage = bestScoreObj.coverage >= 0.97;

    let bestBoundPenalty = 0;
    let bestViolatesBounds = false;
    if (settings.sizeVariation === 'low' && bestPlacements.length > 0) {
      const totalBestArea = bestPlacements.reduce((s, p) => s + p.width * p.height, 0);
      const bestAvgArea = totalBestArea / count;
      for (const p of bestPlacements) {
        const r = (p.width * p.height) / bestAvgArea;
        if (r < 0.6999) {
          bestViolatesBounds = true;
          bestBoundPenalty += (0.70 - r) * 100;
        } else if (r > 1.3001) {
          bestViolatesBounds = true;
          bestBoundPenalty += (r - 1.30) * 100;
        }
      }
    }

    let isBetter = false;
    if (c === 0) {
      isBetter = true;
    } else if (settings.sizeVariation === 'low') {
      // In uniform mode: strict penalty for breaking [0.70x, 1.30x], then coverage, then score
      if (candidateBoundPenalty < bestBoundPenalty - 0.01) {
        isBetter = true;
      } else if (candidateBoundPenalty > bestBoundPenalty + 0.01) {
        isBetter = false;
      } else if (candidateCoverage > bestScoreObj.coverage + 0.02) {
        isBetter = true;
      } else if (candidateCoverage < bestScoreObj.coverage - 0.02) {
        isBetter = false;
      } else {
        isBetter = scoreObj.totalScore > bestScore;
      }
    } else if (settings.mode === 'balanced_mosaic') {
      // For balanced mosaic in medium/high: optimize for canvas coverage first, then totalScore
      const covDiff = candidateCoverage - bestScoreObj.coverage;
      if (covDiff > 0.015) {
        isBetter = true;
      } else if (covDiff < -0.015) {
        isBetter = false;
      } else {
        isBetter = scoreObj.totalScore > bestScore;
      }
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
