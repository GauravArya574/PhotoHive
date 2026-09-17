import { Photo, Placement, LayoutSettings, LayoutMode } from '../types';
import { SeededRNG } from './random';

/**
 * Node structure for compound aspect-ratio preserving layout tree.
 * Every node carries an explicit targetArea so child dimensions are directly
 * derived from photo area targets, preventing microscopic or dominant photos.
 */
export type LayoutNode =
  | { type: 'leaf'; photo: Photo; isAnchor?: boolean; targetArea?: number }
  | { type: 'horizontal'; children: LayoutNode[]; weights?: number[]; targetArea?: number }
  | { type: 'vertical'; children: LayoutNode[]; weights?: number[]; targetArea?: number };

/**
 * Computes the exact combined aspect ratio (Width / Height) of any LayoutNode tree
 * without ANY cropping or distortion.
 */
export function getNodeAspectRatio(node: LayoutNode): number {
  if (node.type === 'leaf') {
    return node.photo.aspectRatio;
  }
  if (node.type === 'horizontal') {
    let sum = 0;
    for (const child of node.children) {
      sum += getNodeAspectRatio(child);
    }
    return Math.max(0.01, sum);
  }
  if (node.type === 'vertical') {
    let invSum = 0;
    for (const child of node.children) {
      const ar = getNodeAspectRatio(child);
      invSum += 1 / Math.max(0.01, ar);
    }
    return Math.max(0.01, 1 / invSum);
  }
  return 1;
}

/**
 * Converts a LayoutNode tree into exact pixel Placements within target rectangle [x, y, width, height].
 * Applies integer pixel snapping so adjacent rectangles touch exactly with ZERO seams.
 *
 * Uses child targetArea (or weights) to allocate exact proportional dimensions.
 */
export function layoutNodeToPlacements(
  node: LayoutNode,
  x: number,
  y: number,
  width: number,
  height: number,
  spacing: number,
  placements: Placement[] = [],
  forceAspectRatio: boolean = false
): Placement[] {
  if (node.type === 'leaf') {
    let finalW = width;
    let finalH = height;
    let finalX = x;
    let finalY = y;

    if (spacing > 0) {
      const availW = Math.max(1, width - spacing);
      const availH = Math.max(1, height - spacing);
      if (forceAspectRatio) {
        const ar = node.photo.aspectRatio;
        if (availW / availH > ar) {
          finalH = availH;
          finalW = Math.max(1, Math.round(availH * ar));
        } else {
          finalW = availW;
          finalH = Math.max(1, Math.round(availW / ar));
        }
        finalX = Math.round(x + (width - finalW) / 2);
        finalY = Math.round(y + (height - finalH) / 2);
      } else {
        const pad = spacing / 2;
        finalX = Math.round(x + pad);
        finalY = Math.round(y + pad);
        finalW = availW;
        finalH = availH;
      }
    } else {
      finalW = Math.max(1, Math.round(width));
      finalH = Math.max(1, Math.round(height));
      finalX = Math.round(x);
      finalY = Math.round(y);
    }

    placements.push({
      photoId: node.photo.id,
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH,
      aspectRatio: node.photo.aspectRatio,
      isAnchor: node.isAnchor,
    });
    return placements;
  }

  if (node.type === 'horizontal') {
    // Children placed side by side along X (sharing height)
    const count = node.children.length;
    const childWeights = forceAspectRatio
      ? node.children.map(c => getNodeAspectRatio(c))
      : (node.children.some(c => c.targetArea && c.targetArea > 0)
          ? node.children.map(c => c.targetArea || 1)
          : (node.weights || node.children.map(c => getNodeAspectRatio(c))));
    const totalWeight = childWeights.reduce((a, b) => a + b, 0);

    let currentX = x;
    for (let i = 0; i < count; i++) {
      const child = node.children[i];
      let childW: number;

      if (i === count - 1) {
        // Last child snaps to remaining width to prevent rounding drift
        childW = Math.max(1, Math.round(x + width - currentX));
      } else {
        const fraction = totalWeight > 0 ? childWeights[i] / totalWeight : 1 / count;
        childW = Math.max(1, Math.round(width * fraction));
      }

      layoutNodeToPlacements(child, currentX, y, childW, height, spacing, placements, forceAspectRatio);
      currentX += childW;
    }
    return placements;
  }

  if (node.type === 'vertical') {
    // Children stacked vertically along Y (sharing width)
    const count = node.children.length;
    const childWeights = forceAspectRatio
      ? node.children.map(c => 1 / Math.max(0.01, getNodeAspectRatio(c)))
      : (node.children.some(c => c.targetArea && c.targetArea > 0)
          ? node.children.map(c => c.targetArea || 1)
          : (node.weights || node.children.map(c => 1 / Math.max(0.01, getNodeAspectRatio(c)))));
    const totalWeight = childWeights.reduce((a, b) => a + b, 0);

    let currentY = y;
    for (let i = 0; i < count; i++) {
      const child = node.children[i];
      let childH: number;

      if (i === count - 1) {
        // Last child snaps to remaining height to prevent rounding drift
        childH = Math.max(1, Math.round(y + height - currentY));
      } else {
        const fraction = totalWeight > 0 ? childWeights[i] / totalWeight : 1 / count;
        childH = Math.max(1, Math.round(height * fraction));
      }

      layoutNodeToPlacements(child, x, currentY, width, childH, spacing, placements, forceAspectRatio);
      currentY += childH;
    }
    return placements;
  }

  return placements;
}

/**
 * Helper to compute multipliers for uniform mode with range strictly from 0.73x to 1.27x target area.
 * The average multiplier is balanced to 1.0 (so sum of target areas = canvasArea).
 * Using 0.73x to 1.27x as base assignment ensures integer pixel rounding stays safely within [0.70x, 1.30x].
 */
export function getUniformMultipliers(
  count: number,
  rng: SeededRNG,
  randomness: 'low' | 'medium' | 'high'
): number[] {
  if (count <= 1) return [1.0];
  const minM = 0.73;
  const maxM = 1.27;
  let mults: number[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const linearVal = minM + t * (maxM - minM);
    const jitter =
      randomness === 'low'
        ? 0
        : (rng.next() - 0.5) * (randomness === 'high' ? 0.08 : 0.04);
    mults.push(linearVal + jitter);
  }

  mults = rng.shuffle(mults);

  for (let iter = 0; iter < 15; iter++) {
    const currentSum = mults.reduce((a, b) => a + b, 0);
    const scale = count / currentSum;
    mults = mults.map(m => m * scale);

    let clamped = false;
    for (let i = 0; i < count; i++) {
      if (mults[i] < minM) {
        mults[i] = minM;
        clamped = true;
      }
      if (mults[i] > maxM) {
        mults[i] = maxM;
        clamped = true;
      }
    }
    if (!clamped) break;
  }
  return mults;
}

/**
 * Strict enforcement of scale factor bounds [0.70x, 1.30x] for uniform mode.
 * First priority: No placement may have area < 0.70x or > 1.30x target area.
 * Second priority: Optimizes canvas coverage and keeps elements within bounds.
 */
export function enforceUniformScaleBounds(
  placements: Placement[],
  canvasWidth: number,
  canvasHeight: number,
  spacing: number = 0
): Placement[] {
  const count = placements.length;
  if (count === 0) return placements;

  const targetArea = (canvasWidth * canvasHeight) / count;
  const minAllowedArea = 0.70 * targetArea;
  const maxAllowedArea = 1.30 * targetArea;

  for (const p of placements) {
    let area = p.width * p.height;

    // Hard ceiling: scale factor must not exceed 1.30x
    if (area > maxAllowedArea) {
      const k = Math.sqrt(maxAllowedArea / area);
      let newW = Math.max(1, Math.floor(p.width * k));
      let newH = Math.max(1, Math.floor(p.height * k));
      while (newW * newH > maxAllowedArea && (newW > 1 || newH > 1)) {
        if (newW >= newH && newW > 1) newW--;
        else if (newH > 1) newH--;
        else break;
      }
      const dx = Math.round((p.width - newW) / 2);
      const dy = Math.round((p.height - newH) / 2);
      p.x = Math.max(0, Math.min(canvasWidth - newW, p.x + dx));
      p.y = Math.max(0, Math.min(canvasHeight - newH, p.y + dy));
      p.width = newW;
      p.height = newH;
    } else if (area < minAllowedArea) {
      // Hard floor: scale factor must not fall below 0.70x
      const k = Math.sqrt(minAllowedArea / area);
      let newW = Math.min(canvasWidth, Math.ceil(p.width * k));
      let newH = Math.min(canvasHeight, Math.ceil(p.height * k));
      while (newW * newH < minAllowedArea && (p.x + newW < canvasWidth || p.y + newH < canvasHeight)) {
        if (newW <= newH && p.x + newW < canvasWidth) newW++;
        else if (p.y + newH < canvasHeight) newH++;
        else break;
      }
      if (p.x + newW > canvasWidth) {
        p.x = Math.max(0, canvasWidth - newW);
      }
      if (p.y + newH > canvasHeight) {
        p.y = Math.max(0, canvasHeight - newH);
      }
      p.width = Math.min(canvasWidth, newW);
      p.height = Math.min(canvasHeight, newH);
    }
  }

  return placements;
}

/**
 * Builds an organic, irregular PhotoHive tree layout.
 *
 * Implements strict area-based sizing:
 * - targetAverageArea = canvasArea / N
 * - Uniform: 0.70x to 1.30x target area
 * - Balanced: ~0.8x to 1.4x target area
 * - Dynamic: ~0.5x to 2.3x target area
 */
export function buildPhotoHiveTree(
  photos: Photo[],
  targetAspect: number,
  rng: SeededRNG,
  settings: LayoutSettings
): LayoutNode {
  if (photos.length === 0) {
    throw new Error('No photos provided to layout');
  }

  const canvasArea = settings.canvasWidth * settings.canvasHeight;
  const N = photos.length;
  const targetAvgArea = canvasArea / N;

  if (N === 1) {
    return { type: 'leaf', photo: photos[0], targetArea: canvasArea };
  }

  // 1. Assign Target Areas based on settings.sizeVariation:
  // - Uniform ('low'): range strictly 0.70 - 1.30 * canvasArea / N
  // - Balanced ('medium'): moderate shift from canvasArea / N
  // - Dynamic ('high'): increased shift from canvasArea / N
  const shuffled = rng.shuffle(photos);
  const anchorSet = new Set<string>();
  const photoTargetAreas = new Map<string, number>();

  if (settings.sizeVariation === 'low') {
    // UNIFORM MODE: range 0.70 - 1.30 * target area
    const mults = getUniformMultipliers(N, rng, settings.randomness);
    for (let i = 0; i < N; i++) {
      const p = shuffled[i];
      photoTargetAreas.set(p.id, targetAvgArea * mults[i]);
    }
  } else if (settings.sizeVariation === 'medium') {
    // BALANCED MODE:
    // Moderate shift from targetAvgArea
    const anchorCount = Math.max(1, Math.min(Math.round(N * 0.10), Math.floor(N * 0.20)));
    const smallCount = Math.max(0, Math.min(Math.round(N * 0.15), Math.floor(N * 0.25)));
    const rawItems: { photo: Photo; mult: number; isAnchor: boolean }[] = [];
    const jitterMag = settings.randomness === 'high' ? 0.04 : 0.02;

    for (let i = 0; i < N; i++) {
      const p = shuffled[i];
      const jitter = rng.nextFloat(1 - jitterMag, 1 + jitterMag);
      if (i < anchorCount) {
        anchorSet.add(p.id);
        rawItems.push({ photo: p, mult: 1.35 * jitter, isAnchor: true });
      } else if (i < anchorCount + smallCount) {
        rawItems.push({ photo: p, mult: 0.80 * jitter, isAnchor: false });
      } else {
        rawItems.push({ photo: p, mult: 1.0 * jitter, isAnchor: false });
      }
    }
    const sumMult = rawItems.reduce((acc, it) => acc + it.mult, 0);
    const norm = N / sumMult;
    for (const it of rawItems) {
      photoTargetAreas.set(it.photo.id, targetAvgArea * it.mult * norm);
    }
  } else {
    // DYNAMIC MODE:
    // High shift from targetAvgArea
    const anchorCount = Math.max(1, Math.min(Math.round(N * 0.16), Math.floor(N * 0.28)));
    const smallCount = Math.max(1, Math.min(Math.round(N * 0.22), Math.floor(N * 0.35)));
    const rawItems: { photo: Photo; mult: number; isAnchor: boolean }[] = [];
    const jitterMag = settings.randomness === 'high' ? 0.08 : 0.04;

    for (let i = 0; i < N; i++) {
      const p = shuffled[i];
      const jitter = rng.nextFloat(1 - jitterMag, 1 + jitterMag);
      if (i < anchorCount) {
        anchorSet.add(p.id);
        rawItems.push({ photo: p, mult: 2.25 * jitter, isAnchor: true });
      } else if (i < anchorCount + smallCount) {
        rawItems.push({ photo: p, mult: 0.52 * jitter, isAnchor: false });
      } else {
        rawItems.push({ photo: p, mult: 0.95 * jitter, isAnchor: false });
      }
    }
    const sumMult = rawItems.reduce((acc, it) => acc + it.mult, 0);
    const norm = N / sumMult;
    for (const it of rawItems) {
      photoTargetAreas.set(it.photo.id, targetAvgArea * it.mult * norm);
    }
  }

  // 2. Recursive area-weighted hierarchical partitioning
  function buildAreaSubtree(
    items: Photo[],
    boxAspect: number,
    boxArea: number,
    depth: number
  ): LayoutNode {
    const count = items.length;

    if (count === 1) {
      const p = items[0];
      return {
        type: 'leaf',
        photo: p,
        isAnchor: anchorSet.has(p.id),
        targetArea: photoTargetAreas.get(p.id) || boxArea,
      };
    }

    if (count === 2) {
      const p1 = items[0];
      const p2 = items[1];
      const a1 = photoTargetAreas.get(p1.id) || boxArea / 2;
      const a2 = photoTargetAreas.get(p2.id) || boxArea / 2;
      const tot = a1 + a2;

      const leaf1: LayoutNode = {
        type: 'leaf',
        photo: p1,
        isAnchor: anchorSet.has(p1.id),
        targetArea: a1,
      };
      const leaf2: LayoutNode = {
        type: 'leaf',
        photo: p2,
        isAnchor: anchorSet.has(p2.id),
        targetArea: a2,
      };

      const hAspect1 = boxAspect * (a1 / tot);
      const hAspect2 = boxAspect * (a2 / tot);
      const hDistort1 = Math.abs(hAspect1 - p1.aspectRatio) / p1.aspectRatio;
      const hDistort2 = Math.abs(hAspect2 - p2.aspectRatio) / p2.aspectRatio;
      const hScore = hDistort1 + hDistort2 + (boxAspect < 0.6 ? 0.8 : 0);

      const vAspect1 = boxAspect / (a1 / tot);
      const vAspect2 = boxAspect / (a2 / tot);
      const vDistort1 = Math.abs(vAspect1 - p1.aspectRatio) / p1.aspectRatio;
      const vDistort2 = Math.abs(vAspect2 - p2.aspectRatio) / p2.aspectRatio;
      const vScore = vDistort1 + vDistort2 + (boxAspect > 1.8 ? 0.8 : 0);

      const splitType = hScore <= vScore ? 'horizontal' : 'vertical';
      return {
        type: splitType,
        children: [leaf1, leaf2],
        targetArea: tot,
      };
    }

    if (count === 3) {
      if (settings.sizeVariation === 'low') {
        let bestSingleIdx = 0;
        let bestSplit: 'horizontal' | 'vertical' = boxAspect >= 1.0 ? 'horizontal' : 'vertical';
        let bestDistort = Infinity;

        for (let i = 0; i < 3; i++) {
          const singlePhoto = items[i];
          const pairPhotos = items.filter((_, idx) => idx !== i);
          const aSingle = photoTargetAreas.get(singlePhoto.id) || boxArea / 3;
          const aPair =
            (photoTargetAreas.get(pairPhotos[0].id) || boxArea / 3) +
            (photoTargetAreas.get(pairPhotos[1].id) || boxArea / 3);
          const tot = aSingle + aPair;
          const fracSingle = aSingle / tot;

          const hSingleAspect = boxAspect * fracSingle;
          const hDistort =
            Math.abs(hSingleAspect - singlePhoto.aspectRatio) / singlePhoto.aspectRatio;
          if (hDistort < bestDistort) {
            bestDistort = hDistort;
            bestSingleIdx = i;
            bestSplit = 'horizontal';
          }

          const vSingleAspect = boxAspect / fracSingle;
          const vDistort =
            Math.abs(vSingleAspect - singlePhoto.aspectRatio) / singlePhoto.aspectRatio;
          if (vDistort < bestDistort) {
            bestDistort = vDistort;
            bestSingleIdx = i;
            bestSplit = 'vertical';
          }
        }

        const hero = items[bestSingleIdx];
        const subPair = items.filter((_, idx) => idx !== bestSingleIdx);
        const heroArea = photoTargetAreas.get(hero.id) || boxArea / 3;
        const pairArea =
          (photoTargetAreas.get(subPair[0].id) || boxArea / 3) +
          (photoTargetAreas.get(subPair[1].id) || boxArea / 3);
        const tot = heroArea + pairArea;
        const heroFrac = heroArea / tot;
        const pairFrac = pairArea / tot;

        const isH = bestSplit === 'horizontal';
        const heroBoxAspect = isH ? boxAspect * heroFrac : boxAspect / heroFrac;
        const pairBoxAspect = isH ? boxAspect * pairFrac : boxAspect / pairFrac;

        const heroNode: LayoutNode = {
          type: 'leaf',
          photo: hero,
          isAnchor: false,
          targetArea: heroArea,
        };
        const pairNode = buildAreaSubtree(subPair, pairBoxAspect, pairArea, depth + 1);
        const children = rng.nextBool() ? [heroNode, pairNode] : [pairNode, heroNode];
        return {
          type: bestSplit,
          children,
          targetArea: tot,
        };
      }

      // Medium / High
      const sorted = [...items].sort(
        (a, b) => (photoTargetAreas.get(b.id) || 0) - (photoTargetAreas.get(a.id) || 0)
      );
      const hero = sorted[0];
      const subPair = [sorted[1], sorted[2]];

      const heroArea = photoTargetAreas.get(hero.id) || boxArea / 3;
      const pairArea =
        (photoTargetAreas.get(subPair[0].id) || boxArea / 3) +
        (photoTargetAreas.get(subPair[1].id) || boxArea / 3);
      const tot = heroArea + pairArea;
      const heroFrac = heroArea / tot;
      const pairFrac = pairArea / tot;

      const preferH = boxAspect > 1.1;
      const splitType = preferH ? 'horizontal' : 'vertical';
      const heroBoxAspect = preferH ? boxAspect * heroFrac : boxAspect / heroFrac;
      const pairBoxAspect = preferH ? boxAspect * pairFrac : boxAspect / pairFrac;

      const heroNode: LayoutNode = {
        type: 'leaf',
        photo: hero,
        isAnchor: anchorSet.has(hero.id),
        targetArea: heroArea,
      };
      const pairNode = buildAreaSubtree(subPair, pairBoxAspect, pairArea, depth + 1);
      const children = rng.nextBool() ? [heroNode, pairNode] : [pairNode, heroNode];
      return {
        type: splitType,
        children,
        targetArea: tot,
      };
    }

    // For count >= 4:
    const s1: Photo[] = [];
    const s2: Photo[] = [];

    if (settings.sizeVariation === 'low') {
      const half = Math.floor(count / 2);
      for (let i = 0; i < count; i++) {
        if (i < half) s1.push(items[i]);
        else s2.push(items[i]);
      }
    } else {
      const anchorsInGroup: Photo[] = [];
      const regularInGroup: Photo[] = [];
      for (const p of items) {
        if (anchorSet.has(p.id)) {
          anchorsInGroup.push(p);
        } else {
          regularInGroup.push(p);
        }
      }

      for (let i = 0; i < anchorsInGroup.length; i++) {
        if (i % 2 === 0) s1.push(anchorsInGroup[i]);
        else s2.push(anchorsInGroup[i]);
      }

      let s1Area = s1.reduce((sum, p) => sum + (photoTargetAreas.get(p.id) || 0), 0);
      let s2Area = s2.reduce((sum, p) => sum + (photoTargetAreas.get(p.id) || 0), 0);

      regularInGroup.sort(
        (a, b) => (photoTargetAreas.get(b.id) || 0) - (photoTargetAreas.get(a.id) || 0)
      );

      for (const p of regularInGroup) {
        const a = photoTargetAreas.get(p.id) || 0;
        if (s1Area <= s2Area && s1.length < Math.ceil(count * 0.65)) {
          s1.push(p);
          s1Area += a;
        } else if (s2.length < Math.ceil(count * 0.65)) {
          s2.push(p);
          s2Area += a;
        } else {
          s1.push(p);
          s1Area += a;
        }
      }

      if (s1.length === 0 && s2.length > 0) s1.push(s2.pop()!);
      if (s2.length === 0 && s1.length > 0) s2.push(s1.pop()!);
    }

    const s1Area = s1.reduce((sum, p) => sum + (photoTargetAreas.get(p.id) || 0), 0);
    const s2Area = s2.reduce((sum, p) => sum + (photoTargetAreas.get(p.id) || 0), 0);
    const totArea = s1Area + s2Area;

    let splitDirection: 'horizontal' | 'vertical';
    if (boxAspect > 1.35) {
      splitDirection = 'horizontal';
    } else if (boxAspect < 0.75) {
      splitDirection = 'vertical';
    } else {
      const preferH = boxAspect >= 1.0;
      const jitter = (rng.next() - 0.5) * 0.3;
      splitDirection = (preferH ? 0.6 : 0.4) + jitter >= 0.5 ? 'horizontal' : 'vertical';
    }

    const frac1 = s1Area / totArea;
    const frac2 = s2Area / totArea;

    const boxAspect1 = splitDirection === 'horizontal' ? boxAspect * frac1 : boxAspect / frac1;
    const boxAspect2 = splitDirection === 'horizontal' ? boxAspect * frac2 : boxAspect / frac2;

    const child1 = buildAreaSubtree(s1, boxAspect1, s1Area, depth + 1);
    const child2 = buildAreaSubtree(s2, boxAspect2, s2Area, depth + 1);

    const children = rng.nextBool() ? [child1, child2] : [child2, child1];
    return {
      type: splitDirection,
      children,
      targetArea: totArea,
    };
  }

  return buildAreaSubtree(shuffled, targetAspect, canvasArea, 0);
}

/**
 * Balanced Mosaic Algorithm:
 * Hierarchical compound aspect ratio tree preserving 100% exact native photo aspect ratios.
 * Zero cropping and zero stretching by construction.
 */
export function buildBalancedMosaicTree(
  photos: Photo[],
  targetAspect: number,
  rng: SeededRNG,
  settings: LayoutSettings
): LayoutNode {
  if (photos.length <= 1) {
    return { type: 'leaf', photo: photos[0] };
  }

  function recurse(items: Photo[], desiredAspect: number): LayoutNode {
    if (items.length <= 1) {
      return { type: 'leaf', photo: items[0] };
    }

    if (items.length === 2) {
      const p1 = items[0];
      const p2 = items[1];
      const ar1 = p1.aspectRatio;
      const ar2 = p2.aspectRatio;

      const arH = ar1 + ar2;
      const arV = 1 / (1 / ar1 + 1 / ar2);

      const isH = Math.abs(Math.log(arH / desiredAspect)) <= Math.abs(Math.log(arV / desiredAspect));
      return {
        type: isH ? 'horizontal' : 'vertical',
        children: [
          { type: 'leaf', photo: p1 },
          { type: 'leaf', photo: p2 },
        ],
      };
    }

    let bestNode: LayoutNode | null = null;
    let bestDiff = Infinity;

    // Split options based on sizeVariation
    const splitOptions =
      settings.sizeVariation === 'low'
        ? [Math.floor(items.length / 2)]
        : settings.sizeVariation === 'medium'
        ? [Math.floor(items.length / 2), Math.floor(items.length * 0.45), Math.floor(items.length * 0.55)]
        : [
            Math.floor(items.length / 2),
            Math.floor(items.length * 0.35),
            Math.floor(items.length * 0.65),
          ];

    const uniqueSplits = Array.from(new Set(splitOptions.filter(s => s > 0 && s < items.length)));

    for (const split of uniqueSplits) {
      const g1 = items.slice(0, split);
      const g2 = items.slice(split);
      const f1 = g1.length / items.length;
      const f2 = g2.length / items.length;

      for (const tryH of [true, false]) {
        const next1 = tryH ? desiredAspect * f1 : desiredAspect / f1;
        const next2 = tryH ? desiredAspect * f2 : desiredAspect / f2;
        const n1 = recurse(g1, next1);
        const n2 = recurse(g2, next2);
        const ar1 = getNodeAspectRatio(n1);
        const ar2 = getNodeAspectRatio(n2);
        const combAspect = tryH ? ar1 + ar2 : 1 / (1 / Math.max(0.01, ar1) + 1 / Math.max(0.01, ar2));
        const diff = Math.abs(Math.log(combAspect / desiredAspect));

        if (diff < bestDiff) {
          bestDiff = diff;
          bestNode = {
            type: tryH ? 'horizontal' : 'vertical',
            children: [n1, n2],
          };
        }
      }
    }

    return (
      bestNode || {
        type: 'horizontal',
        children: [recurse(items.slice(0, 1), desiredAspect), recurse(items.slice(1), desiredAspect)],
      }
    );
  }

  const shuffled = rng.shuffle(photos);
  return recurse(shuffled, targetAspect);
}

/**
 * Organic Justified Rows Layout:
 * Arranges photos into justified rows with target row heights.
 */
export function buildJustifiedLayout(
  photos: Photo[],
  canvasWidth: number,
  canvasHeight: number,
  rng: SeededRNG,
  settings: LayoutSettings
): Placement[] {
  const placements: Placement[] = [];
  const N = photos.length;
  if (N === 0) return placements;

  const shuffled = rng.shuffle(photos);

  if (settings.sizeVariation === 'low') {
    // UNIFORM MODE: range strictly 0.70 - 1.30 * target area
    const mults = getUniformMultipliers(N, rng, settings.randomness);
    const targetAvgArea = (canvasWidth * canvasHeight) / N;
    const photoItems = shuffled.map((p, i) => ({ photo: p, area: targetAvgArea * mults[i] }));

    const targetRowCount = Math.max(1, Math.round(Math.sqrt(N * (canvasHeight / canvasWidth))));
    const rows: { photo: Photo; area: number }[][] = Array(targetRowCount).fill(0).map(() => []);

    for (let i = 0; i < N; i++) {
      rows[i % targetRowCount].push(photoItems[i]);
    }

    const rowAreas = rows.map(r => r.reduce((sum, item) => sum + item.area, 0));
    const totalRowArea = rowAreas.reduce((sum, a) => sum + a, 0);

    let curY = 0;
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const rArea = rowAreas[rIdx];
      const rowH = (rIdx === rows.length - 1)
        ? Math.max(1, canvasHeight - curY)
        : Math.max(1, Math.round(canvasHeight * (rArea / totalRowArea)));

      let curX = 0;
      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        const item = row[cIdx];
        const photoW = (cIdx === row.length - 1)
          ? Math.max(1, canvasWidth - curX)
          : Math.max(1, Math.round(canvasWidth * (item.area / rArea)));

        const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
        placements.push({
          photoId: item.photo.id,
          x: Math.round(curX + pad),
          y: Math.round(curY + pad),
          width: Math.max(1, Math.round(photoW - settings.spacing)),
          height: Math.max(1, Math.round(rowH - settings.spacing)),
          aspectRatio: item.photo.aspectRatio,
        });
        curX += photoW;
      }
      curY += rowH;
    }
    return placements;
  }

  // Balanced / Dynamic mode
  const targetRowCount = Math.max(2, Math.round(Math.sqrt(N * (canvasHeight / canvasWidth))));
  const baseRowHeight = canvasHeight / targetRowCount;

  const rows: Photo[][] = [];
  let currentRow: Photo[] = [];
  let currentAspectSum = 0;
  const targetRowAspect = canvasWidth / baseRowHeight;

  const varianceRange = settings.sizeVariation === 'medium' ? [0.90, 1.15] : [0.75, 1.30];

  for (const p of shuffled) {
    currentRow.push(p);
    currentAspectSum += p.aspectRatio;

    const variance = rng.nextFloat(varianceRange[0], varianceRange[1]);
    if (currentAspectSum >= targetRowAspect * variance && currentRow.length >= 2) {
      rows.push(currentRow);
      currentRow = [];
      currentAspectSum = 0;
    }
  }

  if (currentRow.length > 0) {
    if (rows.length > 0 && currentRow.length === 1) {
      rows[rows.length - 1].push(currentRow[0]);
    } else {
      rows.push(currentRow);
    }
  }

  // Calculate row heights so they stack to exactly canvasHeight
  const rowNaturalAspects = rows.map(r => r.reduce((sum, p) => sum + p.aspectRatio, 0));
  const totalInvAspect = rowNaturalAspects.reduce((sum, ar) => sum + (ar > 0 ? 1 / ar : 1), 0);

  let curY = 0;
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const rowAspect = rowNaturalAspects[rIdx];
    let rowH: number;

    if (rIdx === rows.length - 1) {
      rowH = Math.max(1, canvasHeight - curY);
    } else {
      const fraction = (1 / rowAspect) / totalInvAspect;
      rowH = Math.max(1, Math.round(canvasHeight * fraction));
    }

    let curX = 0;
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const photo = row[cIdx];
      let photoW: number;

      if (cIdx === row.length - 1) {
        photoW = Math.max(1, canvasWidth - curX);
      } else {
        const frac = photo.aspectRatio / rowAspect;
        photoW = Math.max(1, Math.round(canvasWidth * frac));
      }

      const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
      placements.push({
        photoId: photo.id,
        x: Math.round(curX + pad),
        y: Math.round(curY + pad),
        width: Math.max(1, Math.round(photoW - settings.spacing)),
        height: Math.max(1, Math.round(rowH - settings.spacing)),
        aspectRatio: photo.aspectRatio,
      });

      curX += photoW;
    }
    curY += rowH;
  }

  return placements;
}

/**
 * Masonry Layout:
 * Multi-column arrangement with column widths.
 */
export function buildMasonryLayout(
  photos: Photo[],
  canvasWidth: number,
  canvasHeight: number,
  rng: SeededRNG,
  settings: LayoutSettings
): Placement[] {
  const placements: Placement[] = [];
  const N = photos.length;
  if (N === 0) return placements;

  const shuffled = rng.shuffle(photos);

  if (settings.sizeVariation === 'low') {
    // UNIFORM MODE: range strictly 0.70 - 1.30 * target area
    const mults = getUniformMultipliers(N, rng, settings.randomness);
    const targetAvgArea = (canvasWidth * canvasHeight) / N;
    const photoItems = shuffled.map((p, i) => ({ photo: p, area: targetAvgArea * mults[i] }));

    const numCols = Math.max(1, Math.min(24, Math.round(Math.sqrt(N * (canvasWidth / canvasHeight)))));
    const cols: { photo: Photo; area: number }[][] = Array(numCols).fill(0).map(() => []);

    for (let i = 0; i < N; i++) {
      cols[i % numCols].push(photoItems[i]);
    }

    const colAreas = cols.map(c => c.reduce((sum, item) => sum + item.area, 0));
    const totalColArea = colAreas.reduce((sum, a) => sum + a, 0);

    let curX = 0;
    for (let cIdx = 0; cIdx < cols.length; cIdx++) {
      const col = cols[cIdx];
      const cArea = colAreas[cIdx];
      const colW = (cIdx === cols.length - 1)
        ? Math.max(1, canvasWidth - curX)
        : Math.max(1, Math.round(canvasWidth * (cArea / totalColArea)));

      let curY = 0;
      for (let pIdx = 0; pIdx < col.length; pIdx++) {
        const item = col[pIdx];
        const photoH = (pIdx === col.length - 1)
          ? Math.max(1, canvasHeight - curY)
          : Math.max(1, Math.round(canvasHeight * (item.area / cArea)));

        const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
        placements.push({
          photoId: item.photo.id,
          x: Math.round(curX + pad),
          y: Math.round(curY + pad),
          width: Math.max(1, Math.round(colW - settings.spacing)),
          height: Math.max(1, Math.round(photoH - settings.spacing)),
          aspectRatio: item.photo.aspectRatio,
        });
        curY += photoH;
      }
      curX += colW;
    }
    return placements;
  }

  // Balanced / Dynamic mode
  const numCols = Math.max(
    2,
    Math.min(24, Math.round(Math.sqrt(N * (canvasWidth / canvasHeight))))
  );
  const colWidth = Math.round(canvasWidth / numCols);

  const cols: Photo[][] = Array(numCols).fill(0).map(() => []);
  const colHeights = Array(numCols).fill(0);

  for (const p of shuffled) {
    let minCol = 0;
    let minH = colHeights[0];
    for (let i = 1; i < numCols; i++) {
      if (colHeights[i] < minH) {
        minH = colHeights[i];
        minCol = i;
      }
    }
    cols[minCol].push(p);
    colHeights[minCol] += colWidth / p.aspectRatio;
  }

  let curX = 0;
  for (let c = 0; c < numCols; c++) {
    const colPhotos = cols[c];
    const actualW = (c === numCols - 1) ? canvasWidth - curX : colWidth;

    const totalInvAspect = colPhotos.reduce((sum, p) => sum + (1 / p.aspectRatio), 0);
    let curY = 0;

    for (let pIdx = 0; pIdx < colPhotos.length; pIdx++) {
      const p = colPhotos[pIdx];
      let itemH: number;
      if (pIdx === colPhotos.length - 1) {
        itemH = Math.max(1, canvasHeight - curY);
      } else {
        const fraction = (1 / p.aspectRatio) / totalInvAspect;
        itemH = Math.max(1, Math.round(canvasHeight * fraction));
      }

      const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
      placements.push({
        photoId: p.id,
        x: Math.round(curX + pad),
        y: Math.round(curY + pad),
        width: Math.max(1, Math.round(actualW - settings.spacing)),
        height: Math.max(1, Math.round(itemH - settings.spacing)),
        aspectRatio: p.aspectRatio,
      });

      curY += itemH;
    }
    curX += actualW;
  }

  return placements;
}

/**
 * Grid Layout:
 * Conventional grid with aspect ratio preservation (letterbox fitted).
 */
export function buildGridLayout(
  photos: Photo[],
  canvasWidth: number,
  canvasHeight: number,
  rng: SeededRNG,
  settings: LayoutSettings
): Placement[] {
  const placements: Placement[] = [];
  if (photos.length === 0) return placements;

  const count = photos.length;
  // Choose optimal column and row counts matching canvas aspect ratio
  let cols = Math.max(1, Math.round(Math.sqrt(count * (canvasWidth / canvasHeight))));
  let rows = Math.ceil(count / cols);

  if (cols * (rows - 1) >= count) {
    rows = rows - 1;
  }

  const cellH = canvasHeight / rows;
  const shuffled = rng.shuffle(photos);

  let pIdx = 0;
  for (let r = 0; r < rows; r++) {
    const curY = Math.round(r * cellH);
    const nextY = Math.round((r + 1) * cellH);
    const actualH = Math.max(1, nextY - curY);

    const remainingPhotos = count - pIdx;
    const remainingRows = rows - r;
    const rowPhotoCount = Math.min(
      remainingPhotos,
      Math.ceil(remainingPhotos / remainingRows)
    );

    const cellW = canvasWidth / Math.max(1, rowPhotoCount);
    for (let c = 0; c < rowPhotoCount; c++) {
      const p = shuffled[pIdx++];
      const curX = Math.round(c * cellW);
      const nextX = Math.round((c + 1) * cellW);
      const actualW = Math.max(1, nextX - curX);

      const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
      placements.push({
        photoId: p.id,
        x: Math.round(curX + pad),
        y: Math.round(curY + pad),
        width: Math.max(1, Math.round(actualW - settings.spacing)),
        height: Math.max(1, Math.round(actualH - settings.spacing)),
        aspectRatio: p.aspectRatio,
      });
    }
  }

  return placements;
}
