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

  if (settings.sizeVariation === 'low') {
    const N = photos.length;
    const canvasArea = settings.canvasWidth * settings.canvasHeight;
    const targetAvgArea = canvasArea / N;
    const mults = getUniformMultipliers(N, rng, settings.randomness);
    const photoTargetAreas = new Map<string, number>();
    const shuffled = rng.shuffle(photos);
    for (let i = 0; i < N; i++) {
      photoTargetAreas.set(shuffled[i].id, targetAvgArea * mults[i]);
    }

    function recurseUniform(items: Photo[], boxAspect: number, boxArea: number): LayoutNode {
      if (items.length === 1) {
        const p = items[0];
        return {
          type: 'leaf',
          photo: p,
          targetArea: photoTargetAreas.get(p.id) || boxArea,
        };
      }

      if (items.length === 2) {
        const p1 = items[0];
        const p2 = items[1];
        const a1 = photoTargetAreas.get(p1.id) || boxArea / 2;
        const a2 = photoTargetAreas.get(p2.id) || boxArea / 2;
        const tot = a1 + a2;
        const f1 = a1 / tot;
        const f2 = a2 / tot;

        const leaf1: LayoutNode = { type: 'leaf', photo: p1, targetArea: a1 };
        const leaf2: LayoutNode = { type: 'leaf', photo: p2, targetArea: a2 };

        const hDistort =
          Math.abs(boxAspect * f1 - p1.aspectRatio) / p1.aspectRatio +
          Math.abs(boxAspect * f2 - p2.aspectRatio) / p2.aspectRatio;
        const vDistort =
          Math.abs(boxAspect / f1 - p1.aspectRatio) / p1.aspectRatio +
          Math.abs(boxAspect / f2 - p2.aspectRatio) / p2.aspectRatio;

        const isH = hDistort <= vDistort;
        return {
          type: isH ? 'horizontal' : 'vertical',
          targetArea: tot,
          children: [leaf1, leaf2],
        };
      }

      const half = Math.floor(items.length / 2);
      const g1 = items.slice(0, half);
      const g2 = items.slice(half);

      const a1 = g1.reduce((s, p) => s + (photoTargetAreas.get(p.id) || 0), 0);
      const a2 = g2.reduce((s, p) => s + (photoTargetAreas.get(p.id) || 0), 0);
      const tot = a1 + a2;

      const f1 = a1 / tot;
      const f2 = a2 / tot;

      const preferH = boxAspect >= 1.0;
      const splitType = preferH ? 'horizontal' : 'vertical';

      const next1 = splitType === 'horizontal' ? boxAspect * f1 : boxAspect / f1;
      const next2 = splitType === 'horizontal' ? boxAspect * f2 : boxAspect / f2;

      const n1 = recurseUniform(g1, next1, a1);
      const n2 = recurseUniform(g2, next2, a2);

      return {
        type: splitType,
        targetArea: tot,
        children: [n1, n2],
      };
    }

    return recurseUniform(shuffled, targetAspect, canvasArea);
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

      const diffH = Math.abs(Math.log(arH / desiredAspect));
      const diffV = Math.abs(Math.log(arV / desiredAspect));

      const isH = diffH <= diffV;
      return {
        type: isH ? 'horizontal' : 'vertical',
        children: [
          { type: 'leaf', photo: p1 },
          { type: 'leaf', photo: p2 },
        ],
      };
    }

    let bestNode: LayoutNode | null = null;
    let bestCost = Infinity;

    // Split options based on sizeVariation
    const half = Math.floor(items.length / 2);
    const splitOptions =
      settings.sizeVariation === 'medium'
        ? [half, Math.floor(items.length * 0.45), Math.floor(items.length * 0.55)]
        : [half, Math.floor(items.length * 0.35), Math.floor(items.length * 0.65)];

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
        const aspectDiff = Math.abs(Math.log(combAspect / desiredAspect));

        if (aspectDiff < bestCost) {
          bestCost = aspectDiff;
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

  // Explore candidate orderings to optimize canvas coverage
  const numOrderings = 6;
  let bestRoot: LayoutNode | null = null;
  let bestRootScore = Infinity;

  const orderings: Photo[][] = [rng.shuffle(photos)];
  const sorted = [...photos].sort((a, b) => b.aspectRatio - a.aspectRatio);
  orderings.push(sorted);

  while (orderings.length < numOrderings) {
    orderings.push(rng.shuffle(photos));
  }

  for (const ord of orderings) {
    const root = recurse(ord, targetAspect);
    const ar = getNodeAspectRatio(root);
    const cov = ar >= targetAspect ? targetAspect / ar : ar / targetAspect;
    const score = 1 - cov;

    if (score < bestRootScore) {
      bestRootScore = score;
      bestRoot = root;
    }
  }

  return bestRoot || recurse(photos, targetAspect);
}

/**
 * Organic Justified Rows Layout:
 * Arranges photos into justified rows with exact photo aspect ratios, zero crop, zero stretch, and zero gaps.
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
  const targetRowCount = Math.max(1, Math.min(N, Math.round(Math.sqrt(N * (canvasHeight / canvasWidth)))));

  let rows: Photo[][] = [];

  if (settings.sizeVariation === 'low') {
    // UNIFORM MODE: Balance aspect sums so row heights & photo areas are tightly uniform
    const sorted = [...shuffled].sort((a, b) => b.aspectRatio - a.aspectRatio);
    rows = Array.from({ length: targetRowCount }, () => []);

    for (const p of sorted) {
      let minRow = 0;
      let minSum = rows[0].reduce((s, x) => s + x.aspectRatio, 0);
      for (let r = 1; r < targetRowCount; r++) {
        const s = rows[r].reduce((acc, x) => acc + x.aspectRatio, 0);
        if (s < minSum) {
          minSum = s;
          minRow = r;
        }
      }
      rows[minRow].push(p);
    }
  } else {
    // BALANCED / DYNAMIC MODE
    const baseRowHeight = canvasHeight / targetRowCount;
    const targetRowAspect = canvasWidth / baseRowHeight;
    const varianceRange = settings.sizeVariation === 'medium' ? [0.90, 1.15] : [0.75, 1.30];

    let currentRow: Photo[] = [];
    let currentAspectSum = 0;

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
  }

  const activeRows = rows.filter(r => r.length > 0);
  if (activeRows.length === 0) return placements;

  const rowAspectSums = activeRows.map(r => r.reduce((sum, p) => sum + p.aspectRatio, 0));
  const relHeights = rowAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
  const totalRelH = relHeights.reduce((sum, h) => sum + h, 0);
  const blockAspect = totalRelH > 0 ? 1.0 / totalRelH : 1.0;

  const canvasAspect = canvasWidth / canvasHeight;
  let blockW: number;
  let blockH: number;
  let startX: number;
  let startY: number;

  if (blockAspect >= canvasAspect) {
    blockW = canvasWidth;
    blockH = Math.max(1, Math.round(canvasWidth / blockAspect));
    startX = 0;
    startY = Math.max(0, Math.round((canvasHeight - blockH) / 2));
  } else {
    blockH = canvasHeight;
    blockW = Math.max(1, Math.round(canvasHeight * blockAspect));
    startX = Math.max(0, Math.round((canvasWidth - blockW) / 2));
    startY = 0;
  }

  let curY = startY;
  for (let r = 0; r < activeRows.length; r++) {
    const row = activeRows[r];
    const rowSum = rowAspectSums[r];
    const nextY = (r === activeRows.length - 1)
      ? startY + blockH
      : Math.round(startY + (blockH * (relHeights.slice(0, r + 1).reduce((a, b) => a + b, 0) / totalRelH)));
    const rh = Math.max(1, nextY - curY);

    let curX = startX;
    let cumAspect = 0;

    for (let i = 0; i < row.length; i++) {
      const p = row[i];
      cumAspect += p.aspectRatio;
      const nextX = (i === row.length - 1)
        ? startX + blockW
        : Math.round(startX + (blockW * (cumAspect / rowSum)));
      const pw = Math.max(1, nextX - curX);

      const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
      placements.push({
        photoId: p.id,
        x: Math.round(curX + pad),
        y: Math.round(curY + pad),
        width: Math.max(1, Math.round(pw - settings.spacing)),
        height: Math.max(1, Math.round(rh - settings.spacing)),
        aspectRatio: p.aspectRatio,
      });
      curX = nextX;
    }
    curY = nextY;
  }

  return placements;
}

/**
 * Masonry Layout:
 * Multi-column arrangement with exact photo aspect ratios, zero crop, zero stretch, and zero gaps.
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
  const numCols = Math.max(1, Math.min(N, Math.round(Math.sqrt(N * (canvasWidth / canvasHeight)))));

  let cols: Photo[][] = [];

  if (settings.sizeVariation === 'low') {
    // UNIFORM MODE: Balance inverse aspect sums so column widths & photo areas are tightly uniform
    const sorted = [...shuffled].sort((a, b) => a.aspectRatio - b.aspectRatio);
    cols = Array.from({ length: numCols }, () => []);

    for (const p of sorted) {
      let minCol = 0;
      let minInvSum = cols[0].reduce((s, x) => s + 1 / x.aspectRatio, 0);
      for (let c = 1; c < numCols; c++) {
        const s = cols[c].reduce((acc, x) => acc + 1 / x.aspectRatio, 0);
        if (s < minInvSum) {
          minInvSum = s;
          minCol = c;
        }
      }
      cols[minCol].push(p);
    }
  } else {
    // BALANCED / DYNAMIC MODE
    cols = Array.from({ length: numCols }, () => []);
    const colHeights = Array(numCols).fill(0);
    const colWidth = Math.round(canvasWidth / numCols);

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
  }

  const activeCols = cols.filter(c => c.length > 0);
  if (activeCols.length === 0) return placements;

  const colInvAspectSums = activeCols.map(c => c.reduce((sum, p) => sum + 1 / p.aspectRatio, 0));
  const relWidths = colInvAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
  const totalRelW = relWidths.reduce((sum, w) => sum + w, 0);
  const blockAspect = totalRelW;

  const canvasAspect = canvasWidth / canvasHeight;
  let blockW: number;
  let blockH: number;
  let startX: number;
  let startY: number;

  if (blockAspect >= canvasAspect) {
    blockW = canvasWidth;
    blockH = Math.max(1, Math.round(canvasWidth / blockAspect));
    startX = 0;
    startY = Math.max(0, Math.round((canvasHeight - blockH) / 2));
  } else {
    blockH = canvasHeight;
    blockW = Math.max(1, Math.round(canvasHeight * blockAspect));
    startX = Math.max(0, Math.round((canvasWidth - blockW) / 2));
    startY = 0;
  }

  let curX = startX;
  for (let c = 0; c < activeCols.length; c++) {
    const col = activeCols[c];
    const colInvSum = colInvAspectSums[c];
    const nextX = (c === activeCols.length - 1)
      ? startX + blockW
      : Math.round(startX + (blockW * (relWidths.slice(0, c + 1).reduce((a, b) => a + b, 0) / totalRelW)));
    const cw = Math.max(1, nextX - curX);

    let curY = startY;
    let cumInvAspect = 0;

    for (let pIdx = 0; pIdx < col.length; pIdx++) {
      const p = col[pIdx];
      cumInvAspect += 1 / p.aspectRatio;
      const nextY = (pIdx === col.length - 1)
        ? startY + blockH
        : Math.round(startY + (blockH * (cumInvAspect / colInvSum)));
      const ph = Math.max(1, nextY - curY);

      const pad = settings.spacing > 0 ? settings.spacing / 2 : 0;
      placements.push({
        photoId: p.id,
        x: Math.round(curX + pad),
        y: Math.round(curY + pad),
        width: Math.max(1, Math.round(cw - settings.spacing)),
        height: Math.max(1, Math.round(ph - settings.spacing)),
        aspectRatio: p.aspectRatio,
      });
      curY = nextY;
    }
    curX = nextX;
  }

  return placements;
}

/**
 * Grid Layout:
 * Conventional grid with exact photo aspect ratios, zero crop, zero stretch, and zero gaps.
 */
export function buildGridLayout(
  photos: Photo[],
  canvasWidth: number,
  canvasHeight: number,
  rng: SeededRNG,
  settings: LayoutSettings
): Placement[] {
  // Use justified row layout to ensure exact zero-crop zero-stretch zero-gap tiling
  return buildJustifiedLayout(photos, canvasWidth, canvasHeight, rng, settings);
}
