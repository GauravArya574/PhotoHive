import { Placement, CandidateScore, LayoutSettings } from '../types';

/**
 * Calculates exact percentile with linear interpolation.
 */
function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Evaluates candidate layout aesthetics and geometric validity.
 *
 * PRIMARY PRINCIPLE:
 * Canvas coverage is secondary. Photo visibility, controlled area variation,
 * and absence of microscopic/dominant photos are primary objectives.
 *
 * Formula:
 * score = coverage * 15
 *       + balance * 15
 *       + aspectRatio * 15
 *       + sizeDistribution * 30
 *       + visualComposition * 15
 *       + anchorDistribution * 10
 *       - microscopicPhotoPenalty
 *       - extremeSizeRatioPenalty
 */
export function scoreLayout(
  placements: Placement[],
  canvasWidth: number,
  canvasHeight: number,
  settings: LayoutSettings
): CandidateScore {
  if (!placements || placements.length === 0) {
    return {
      totalScore: 0,
      coverage: 0,
      aspectRatioFidelity: 0,
      sizeDistributionScore: 0,
      sizeDiversity: 0,
      visualBalance: 0,
      visualComposition: 0,
      anchorDistribution: 0,
      microscopicPhotoPenalty: 100,
      extremeSizeRatioPenalty: 100,
      repetitionPenalty: 1,
      minPhotoArea: 0,
      maxPhotoArea: 0,
      medianPhotoArea: 0,
      meanPhotoArea: 0,
      minScaleFactor: 1,
      maxScaleFactor: 1,
      sizeRatio: 1,
      minDimension: 0,
      p10Area: 0,
      p25Area: 0,
      p75Area: 0,
      p90Area: 0,
    };
  }

  const canvasArea = canvasWidth * canvasHeight;
  const count = placements.length;
  const targetAvgArea = canvasArea / count;

  let totalPhotoArea = 0;
  let distortionSum = 0;
  let stripCount = 0;
  let minDimension = Infinity;
  const photoAreas: number[] = [];

  // 3x3 grid for anchor and mass balance evaluation
  const gridRows = 3;
  const gridCols = 3;
  const cellWidth = canvasWidth / gridCols;
  const cellHeight = canvasHeight / gridRows;
  const regionWeights = Array(gridRows)
    .fill(0)
    .map(() => Array(gridCols).fill(0));
  const regionAnchorCounts = Array(gridRows)
    .fill(0)
    .map(() => Array(gridCols).fill(0));

  // Determine top 10% largest photos as anchors
  const sortedByAreaDesc = [...placements].sort(
    (a, b) => b.width * b.height - a.width * a.height
  );
  const anchorCount = Math.max(1, Math.min(Math.ceil(count * 0.1), 12));
  const anchorSet = new Set(sortedByAreaDesc.slice(0, anchorCount).map(p => p.photoId));

  // Adaptive minimum acceptable dimension floor
  let minAcceptableDim = Math.max(35, Math.round(Math.sqrt(targetAvgArea) * 0.30));
  if (settings.minPhotoSize > 0) {
    minAcceptableDim = Math.max(minAcceptableDim, settings.minPhotoSize);
  }

  let microscopicPhotoPenalty = 0;

  for (const p of placements) {
    const cellW = settings.spacing > 0 ? p.width + settings.spacing : p.width;
    const cellH = settings.spacing > 0 ? p.height + settings.spacing : p.height;
    const area = cellW * cellH;
    totalPhotoArea += area;
    photoAreas.push(area);

    const shortDim = Math.min(p.width, p.height);
    if (shortDim < minDimension) {
      minDimension = shortDim;
    }

    // Heavy penalty for microscopic photos
    if (shortDim < minAcceptableDim) {
      const deficit = (minAcceptableDim - shortDim) / minAcceptableDim;
      microscopicPhotoPenalty += Math.pow(deficit, 1.6) * 12;
      // Critical penalty if severely unviewable (e.g. 17x32 px)
      if (shortDim < 25 && count <= 200) {
        microscopicPhotoPenalty += 15;
      }
    }

    // Aspect ratio fidelity check
    const currentRatio = p.width / Math.max(1, p.height);
    const expectedRatio = p.aspectRatio;
    const ratioDelta = Math.abs(currentRatio - expectedRatio) / Math.max(0.1, expectedRatio);
    distortionSum += ratioDelta;

    // Extreme sliver strip check
    if (currentRatio > 4.5 || currentRatio < 0.22) {
      stripCount++;
    }

    // Regional mass and anchor placement
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;
    const colIdx = Math.min(gridCols - 1, Math.max(0, Math.floor(centerX / cellWidth)));
    const rowIdx = Math.min(gridRows - 1, Math.max(0, Math.floor(centerY / cellHeight)));

    regionWeights[rowIdx][colIdx] += area;
    if (anchorSet.has(p.photoId)) {
      regionAnchorCounts[rowIdx][colIdx]++;
    }
  }

  // Calculate area distribution percentiles
  const sortedAreas = [...photoAreas].sort((a, b) => a - b);
  const minPhotoArea = sortedAreas[0];
  const maxPhotoArea = sortedAreas[sortedAreas.length - 1];
  const meanPhotoArea = totalPhotoArea / count;
  const medianPhotoArea = getPercentile(sortedAreas, 0.50);
  const p10Area = getPercentile(sortedAreas, 0.10);
  const p25Area = getPercentile(sortedAreas, 0.25);
  const p75Area = getPercentile(sortedAreas, 0.75);
  const p90Area = getPercentile(sortedAreas, 0.90);
  const minScaleFactor = minPhotoArea / Math.max(1, targetAvgArea);
  const maxScaleFactor = maxPhotoArea / Math.max(1, targetAvgArea);
  const sizeRatio = maxPhotoArea / Math.max(1, minPhotoArea);
  const areaDeviations = photoAreas.map(a => Math.abs(a - targetAvgArea) / targetAvgArea);
  const meanRelDev = areaDeviations.reduce((sum, d) => sum + d, 0) / count;

  // 1. Extreme Size Ratio Penalty & Uniform Mode Scale Factor Check
  let maxAllowedRatio = 3.8; // medium default
  if (settings.sizeVariation === 'low') maxAllowedRatio = 3.0;
  if (settings.sizeVariation === 'high') maxAllowedRatio = 10.0;

  let extremeSizeRatioPenalty = 0;
  if (settings.sizeVariation === 'low') {
    if (minScaleFactor < 0.55) {
      extremeSizeRatioPenalty += (0.55 - minScaleFactor) * 80;
    }
    if (maxScaleFactor > 1.70) {
      extremeSizeRatioPenalty += (maxScaleFactor - 1.70) * 80;
    }
  } else if (sizeRatio > maxAllowedRatio) {
    const excess = (sizeRatio - maxAllowedRatio) / maxAllowedRatio;
    extremeSizeRatioPenalty = Math.min(45, Math.pow(excess, 1.2) * 18);
    if (sizeRatio > 25) {
      extremeSizeRatioPenalty += 25;
    }
  }

  // 2. Photo Size Distribution Score (0 to 1)
  let sizeDistributionScore = 0;
  if (settings.sizeVariation === 'low') {
    const outOfBoundsPenalty =
      (minScaleFactor < 0.55 ? 0.55 - minScaleFactor : 0) +
      (maxScaleFactor > 1.70 ? maxScaleFactor - 1.70 : 0);
    sizeDistributionScore = Math.max(0, 1 - Math.abs(meanRelDev - 0.15) / 0.25 - outOfBoundsPenalty * 30);
  } else if (settings.sizeVariation === 'medium') {
    const targetDev = 0.18;
    sizeDistributionScore = Math.max(0, 1 - Math.abs(meanRelDev - targetDev) / 0.25);
  } else {
    const targetDev = 0.45;
    sizeDistributionScore = Math.max(0, 1 - Math.abs(meanRelDev - targetDev) / 0.40);
  }

  // Prevent any single photo from consuming excessive canvas area
  let singlePhotoDominancePenalty = 0;
  if (count >= 15 && settings.sizeVariation !== 'low') {
    const maxFraction = maxPhotoArea / canvasArea;
    if (maxFraction > 0.20) {
      singlePhotoDominancePenalty = Math.min(0.5, (maxFraction - 0.20) * 3);
    }
  }

  sizeDistributionScore = Math.max(0, Math.min(1, sizeDistributionScore - singlePhotoDominancePenalty));

  // 3. Canvas Coverage Score (0 to 1) - Target: 96% and above (>= 0.96)
  const coveredArea = placements.reduce((sum, p) => {
    const cellW = settings.spacing > 0 ? p.width + settings.spacing : p.width;
    const cellH = settings.spacing > 0 ? p.height + settings.spacing : p.height;
    return sum + cellW * cellH;
  }, 0);
  const coverage = Math.min(1, Math.max(0, coveredArea / canvasArea));

  // Severe penalty if coverage is below 96.0% (0.96)
  let lowCoveragePenalty = 0;
  if (coverage < 0.96) {
    lowCoveragePenalty = Math.pow((0.96 - coverage) * 100, 1.5) * 8.0 + 30;
  }

  // 4. Aspect Ratio Fidelity (0 to 1) - weight 0.15
  const avgDistortion = distortionSum / count;
  const aspectRatioFidelity = Math.max(0, 1 - avgDistortion * 2.5);

  // 5. Visual Balance Score (0 to 1) - weight 0.15
  let topMass = 0;
  let bottomMass = 0;
  let leftMass = 0;
  let rightMass = 0;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const w = regionWeights[r][c];
      if (r === 0) topMass += w;
      if (r === 2) bottomMass += w;
      if (c === 0) leftMass += w;
      if (c === 2) rightMass += w;
    }
  }
  const verticalBalance =
    topMass + bottomMass > 0
      ? 1 - Math.abs(topMass - bottomMass) / (topMass + bottomMass)
      : 1;
  const horizontalBalance =
    leftMass + rightMass > 0
      ? 1 - Math.abs(leftMass - rightMass) / (leftMass + rightMass)
      : 1;
  const visualBalance = (verticalBalance + horizontalBalance) / 2;

  // 6. Visual Composition & Rhythm (0 to 1) - weight 0.15
  const stripFraction = stripCount / count;
  let repetitionCount = 0;
  for (let i = 0; i < count - 1; i++) {
    const a = placements[i];
    const b = placements[i + 1];
    if (Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1) {
      repetitionCount++;
    }
  }
  const repetitionPenalty = Math.min(1, repetitionCount / Math.max(1, count * 0.3));
  const visualComposition = Math.max(0, 1 - stripFraction * 2 - repetitionPenalty * 0.3);

  // 7. Anchor Distribution Score (0 to 1) - weight 0.10
  let occupiedAnchorSectors = 0;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      if (regionAnchorCounts[r][c] > 0) occupiedAnchorSectors++;
    }
  }
  const maxPossibleOccupied = Math.min(anchorCount, 9);
  const anchorDistribution =
    maxPossibleOccupied > 0 ? occupiedAnchorSectors / maxPossibleOccupied : 1;

  // Composite Total Score (0 - 100)
  // Coverage is top priority: heavily reward >= 97% and penalize < 97%
  const coverageScore = coverage >= 0.97 ? 25 : coverage * 25;

  const rawScore =
    coverageScore +
    visualBalance * 15 +
    aspectRatioFidelity * 15 +
    sizeDistributionScore * 20 +
    visualComposition * 15 +
    anchorDistribution * 10 -
    lowCoveragePenalty -
    microscopicPhotoPenalty -
    extremeSizeRatioPenalty;

  const totalScore = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  return {
    totalScore,
    coverage,
    aspectRatioFidelity,
    sizeDistributionScore,
    sizeDiversity: sizeDistributionScore, // legacy alias
    visualBalance,
    visualComposition,
    anchorDistribution,
    microscopicPhotoPenalty: Math.round(microscopicPhotoPenalty * 10) / 10,
    extremeSizeRatioPenalty: Math.round(extremeSizeRatioPenalty * 10) / 10,
    repetitionPenalty,
    tinyPhotoPenalty: Math.min(1, microscopicPhotoPenalty / 20),
    stripPenalty: stripFraction,

    minPhotoArea: Math.round(minPhotoArea),
    maxPhotoArea: Math.round(maxPhotoArea),
    medianPhotoArea: Math.round(medianPhotoArea),
    meanPhotoArea: Math.round(meanPhotoArea),
    minScaleFactor: Math.round(minScaleFactor * 100) / 100,
    maxScaleFactor: Math.round(maxScaleFactor * 100) / 100,
    sizeRatio: Math.round(sizeRatio * 10) / 10,
    minDimension: Math.round(minDimension),
    p10Area: Math.round(p10Area),
    p25Area: Math.round(p25Area),
    p75Area: Math.round(p75Area),
    p90Area: Math.round(p90Area),
  };
}
