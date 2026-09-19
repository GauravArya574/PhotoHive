import { Photo, Placement, LayoutSettings, LayoutResult, CandidateScore } from '../types';
import { SeededRNG } from './random';
import { scoreLayout } from './scoring';
import {
  buildBalancedMosaicTree,
  solveStrictUniformLayout,
  layoutNodeToPlacements,
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
 * Checks whether a candidate layout strictly adheres to all user and system constraints.
 */
function isCandidateCompliant(
  placements: Placement[],
  scoreObj: CandidateScore,
  settings: LayoutSettings,
  expectedCount: number
): boolean {
  if (!placements || placements.length !== expectedCount) return false;

  const minSFAllowed =
    settings.sizeVariation === 'low'
      ? 0.70
      : settings.sizeVariation === 'medium'
      ? 0.40
      : 0.20;

  const maxSFAllowed =
    settings.sizeVariation === 'low'
      ? 1.30
      : settings.sizeVariation === 'medium'
      ? 2.20
      : 4.50;

  const minCoverageAllowed = 0.959; // >= 96.0% coverage

  // In low variation mode, enforce 0.70x to 1.30x scale factor limits
  if (scoreObj.minScaleFactor < minSFAllowed - 0.005) return false;
  if (scoreObj.maxScaleFactor > maxSFAllowed + 0.005) return false;
  if (scoreObj.coverage < minCoverageAllowed) return false;

  // Min photo size check (adaptive for very dense sets)
  const theoreticalAvgSide = Math.sqrt((settings.canvasWidth * settings.canvasHeight) / expectedCount);
  const feasibleMinDim = Math.min(settings.minPhotoSize, Math.max(8, Math.round(theoreticalAvgSide * 0.35)));
  if (settings.minPhotoSize > 0 && scoreObj.minDimension < feasibleMinDim) {
    return false;
  }

  // Quick sanity validation
  for (const p of placements) {
    if (isNaN(p.x) || isNaN(p.y) || isNaN(p.width) || isNaN(p.height)) return false;
    if (
      p.x < -1 ||
      p.y < -1 ||
      p.x + p.width > settings.canvasWidth + 2 ||
      p.y + p.height > settings.canvasHeight + 2
    ) {
      return false;
    }
    const currentRatio = p.width / Math.max(1, p.height);
    if (Math.abs(currentRatio - p.aspectRatio) / p.aspectRatio > 0.08) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates a candidate layout for a specific iteration seed and layout mode.
 */
function generateSingleCandidate(
  photos: Photo[],
  settings: LayoutSettings,
  targetAspect: number,
  canvasWidth: number,
  canvasHeight: number,
  rng: SeededRNG
): Placement[] {
  if (settings.sizeVariation === 'low') {
    const uniformPlacements = solveStrictUniformLayout(
      photos,
      canvasWidth,
      canvasHeight,
      settings.spacing,
      rng
    );
    if (uniformPlacements && uniformPlacements.length === photos.length) {
      return uniformPlacements;
    }
  }

  const tree = buildBalancedMosaicTree(photos, targetAspect, rng, settings);
  return layoutNodeToPlacements(
    tree,
    0,
    0,
    canvasWidth,
    canvasHeight,
    settings.spacing,
    [],
    false
  );
}

/**
 * Main Layout Generator:
 * Generates candidate layouts iteratively until finding ones that strictly satisfy
 * all geometric and scaling constraints, with non-blocking async execution and live progress.
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

  const canvasWidth = settings.canvasWidth;
  const canvasHeight = settings.canvasHeight;
  const targetAspect = canvasWidth / canvasHeight;
  const count = photos.length;

  let candidateCount = 10;
  if (settings.sizeVariation === 'low') {
    candidateCount = count <= 30 ? 10 : 8;
  } else {
    candidateCount = count <= 30 ? 12 : 8;
  }

  let bestCompliantPlacements: Placement[] = [];
  let bestCompliantScore = -Infinity;
  let bestCompliantScoreObj: CandidateScore | null = null;

  let bestAnyPlacements: Placement[] = [];
  let bestAnyScore = -Infinity;
  let bestAnyScoreObj = scoreLayout([], canvasWidth, canvasHeight, settings);

  // Phase 1: Iterative stochastic candidate search (non-blocking)
  for (let c = 0; c < candidateCount; c++) {
    // Yield to browser event loop
    await new Promise(resolve => setTimeout(resolve, 0));

    const iterSeed = (settings.seed + c * 7919 + c * 31) >>> 0;
    const rng = new SeededRNG(iterSeed);

    const candidatePlacements = generateSingleCandidate(
      photos,
      settings,
      targetAspect,
      canvasWidth,
      canvasHeight,
      rng
    );

    if (candidatePlacements && candidatePlacements.length === count) {
      const scoreObj = scoreLayout(candidatePlacements, canvasWidth, canvasHeight, settings);
      const compliant = isCandidateCompliant(candidatePlacements, scoreObj, settings, count);

      if (compliant) {
        const compositeScore = scoreObj.totalScore + scoreObj.coverage * 50;
        if (compositeScore > bestCompliantScore) {
          bestCompliantScore = compositeScore;
          bestCompliantPlacements = candidatePlacements;
          bestCompliantScoreObj = scoreObj;
        }
        // Early exit if high quality compliant layout found
        if (c >= 2 && scoreObj.coverage >= 0.98 && scoreObj.aspectRatioFidelity >= 0.96) {
          if (onProgress) onProgress(85, c + 1);
          break;
        }
      } else {
        if (scoreObj.totalScore > bestAnyScore) {
          bestAnyScore = scoreObj.totalScore;
          bestAnyPlacements = candidatePlacements;
          bestAnyScoreObj = scoreObj;
        }
      }
    }

    if (onProgress) {
      const progressPercent = Math.min(85, Math.round(((c + 1) / candidateCount) * 80));
      onProgress(progressPercent, c + 1);
    }
  }

  // Phase 2: If no compliant candidate found yet, search with additional varied seeds
  if (bestCompliantPlacements.length === 0) {
    const extraAttempts = 5;
    for (let extra = 0; extra < extraAttempts; extra++) {
      // Yield to event loop
      await new Promise(resolve => setTimeout(resolve, 0));

      const extraSeed = (settings.seed + 99991 + extra * 12289) >>> 0;
      const extraRNG = new SeededRNG(extraSeed);

      const candidatePlacements = generateSingleCandidate(
        photos,
        settings,
        targetAspect,
        canvasWidth,
        canvasHeight,
        extraRNG
      );

      if (candidatePlacements && candidatePlacements.length === count) {
        const scoreObj = scoreLayout(candidatePlacements, canvasWidth, canvasHeight, settings);
        const compliant = isCandidateCompliant(candidatePlacements, scoreObj, settings, count);

        if (compliant) {
          const compositeScore = scoreObj.totalScore + scoreObj.coverage * 50;
          if (compositeScore > bestCompliantScore) {
            bestCompliantScore = compositeScore;
            bestCompliantPlacements = candidatePlacements;
            bestCompliantScoreObj = scoreObj;
          }
          break; // Stop as soon as compliant candidate found
        } else if (scoreObj.totalScore > bestAnyScore) {
          bestAnyScore = scoreObj.totalScore;
          bestAnyPlacements = candidatePlacements;
          bestAnyScoreObj = scoreObj;
        }
      }

      if (onProgress) {
        onProgress(80 + Math.round(((extra + 1) / extraAttempts) * 18), candidateCount + extra + 1);
      }
    }
  }

  // Select final placements: always prefer compliant layouts, then best mosaic candidate
  let finalPlacements: Placement[];
  let finalScoreObj: CandidateScore;

  if (bestCompliantPlacements.length > 0 && bestCompliantScoreObj) {
    finalPlacements = bestCompliantPlacements;
    finalScoreObj = bestCompliantScoreObj;
  } else if (settings.sizeVariation === 'low') {
    const fallbackRNG = new SeededRNG(settings.seed);
    const uniformPlacements = solveStrictUniformLayout(
      photos,
      canvasWidth,
      canvasHeight,
      settings.spacing,
      fallbackRNG
    );
    finalPlacements = uniformPlacements;
    finalScoreObj = scoreLayout(uniformPlacements, canvasWidth, canvasHeight, settings);
  } else if (bestAnyPlacements.length > 0 && bestAnyScoreObj) {
    finalPlacements = bestAnyPlacements;
    finalScoreObj = bestAnyScoreObj;
  } else {
    // Ultimate fallback if no candidate produced any placement
    const guaranteedRNG = new SeededRNG(settings.seed);
    const guaranteedPlacements = generateSingleCandidate(
      photos,
      settings,
      targetAspect,
      canvasWidth,
      canvasHeight,
      guaranteedRNG
    );
    finalPlacements = guaranteedPlacements;
    finalScoreObj = scoreLayout(guaranteedPlacements, canvasWidth, canvasHeight, settings);
  }

  const sanityCheck = performSanityChecks(
    finalPlacements,
    canvasWidth,
    canvasHeight,
    photos.length
  );

  const executionTimeMs = Math.round(performance.now() - startTime);

  if (onProgress) {
    onProgress(100, candidateCount);
  }

  return {
    placements: finalPlacements,
    canvasWidth,
    canvasHeight,
    coverage: Math.round(finalScoreObj.coverage * 1000) / 10,
    score: finalScoreObj,
    seed: settings.seed,
    executionTimeMs,
    sanityCheck,
  };
}

