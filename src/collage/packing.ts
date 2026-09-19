import { Photo, Placement, LayoutSettings } from '../types';
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

  const minSFAllowed =
    settings.sizeVariation === 'low' ? 0.70 : settings.sizeVariation === 'medium' ? 0.40 : 0.20;
  const maxSFAllowed =
    settings.sizeVariation === 'low' ? 1.30 : settings.sizeVariation === 'medium' ? 2.20 : 4.50;

  const noiseFactor =
    settings.randomness === 'high' ? 0.20 : settings.randomness === 'medium' ? 0.10 : 0.03;

  function recurse(
    items: Photo[],
    desiredAspect: number,
    parentDir: 'horizontal' | 'vertical' | null = null,
    depth = 0
  ): LayoutNode {
    if (items.length <= 1) {
      return { type: 'leaf', photo: items[0] };
    }

    if (items.length === 2) {
      const p1 = items[0];
      const p2 = items[1];
      const arH = p1.aspectRatio + p2.aspectRatio;
      const inv1 = 1 / Math.max(0.01, p1.aspectRatio);
      const inv2 = 1 / Math.max(0.01, p2.aspectRatio);
      const invSum = inv1 + inv2;
      const arV = 1 / Math.max(0.01, invSum);

      let diffH = Math.abs(Math.log(arH / desiredAspect));
      let diffV = Math.abs(Math.log(arV / desiredAspect));

      const sf1H = (p1.aspectRatio / arH) / 0.5;
      const sf2H = (p2.aspectRatio / arH) / 0.5;
      const penH =
        (sf1H < minSFAllowed ? (minSFAllowed - sf1H) * 80 : 0) +
        (sf1H > maxSFAllowed ? (sf1H - maxSFAllowed) * 80 : 0) +
        (sf2H < minSFAllowed ? (minSFAllowed - sf2H) * 80 : 0) +
        (sf2H > maxSFAllowed ? (sf2H - maxSFAllowed) * 80 : 0);

      const sf1V = (inv1 / invSum) / 0.5;
      const sf2V = (inv2 / invSum) / 0.5;
      const penV =
        (sf1V < minSFAllowed ? (minSFAllowed - sf1V) * 80 : 0) +
        (sf1V > maxSFAllowed ? (sf1V - maxSFAllowed) * 80 : 0) +
        (sf2V < minSFAllowed ? (minSFAllowed - sf2V) * 80 : 0) +
        (sf2V > maxSFAllowed ? (sf2V - maxSFAllowed) * 80 : 0);

      // Anti-striping penalty: discourage repeating the same split direction as parent
      if (parentDir === 'horizontal') diffH += 0.50;
      if (parentDir === 'vertical') diffV += 0.50;

      const jitter = (rng.next() - 0.5) * noiseFactor;
      const isH = diffH + penH + jitter <= diffV + penV;

      const leaf1: LayoutNode = { type: 'leaf', photo: p1 };
      const leaf2: LayoutNode = { type: 'leaf', photo: p2 };

      // Randomize child placement order (left/right or top/bottom)
      const children = rng.nextBool() ? [leaf1, leaf2] : [leaf2, leaf1];
      return {
        type: isH ? 'horizontal' : 'vertical',
        children,
      };
    }

    const n = items.length;
    const mid = Math.floor(n / 2);
    const candidateSplits: number[] = [mid];
    if (n >= 4 && settings.sizeVariation === 'high') {
      const alt = rng.nextInt(Math.max(1, Math.floor(n * 0.35)), Math.min(n - 1, Math.ceil(n * 0.65)));
      if (alt !== mid) candidateSplits.push(alt);
    }

    let bestChoice: { node: LayoutNode; cost: number } | null = null;

    for (const split of candidateSplits) {
      const g1 = items.slice(0, split);
      const g2 = items.slice(split);
      const f1 = g1.length / n;
      const f2 = g2.length / n;

      // When n > 4, determine preferred cut direction to avoid exponential 2^depth branch explosion
      const shouldBranchBoth = n <= 4;
      const preferHorizontal = desiredAspect >= 1.0;
      const jitterDir = (rng.next() - 0.5) * noiseFactor;
      const doH = shouldBranchBoth || (preferHorizontal ? 0.6 + jitterDir >= 0.5 : 0.4 + jitterDir >= 0.5);
      const doV = shouldBranchBoth || !doH;

      let costH = Infinity;
      let costV = Infinity;
      let n1H: LayoutNode | null = null;
      let n2H: LayoutNode | null = null;
      let n1V: LayoutNode | null = null;
      let n2V: LayoutNode | null = null;

      if (doH) {
        n1H = recurse(g1, desiredAspect * f1, 'horizontal', depth + 1);
        n2H = recurse(g2, desiredAspect * f2, 'horizontal', depth + 1);
        const ar1H = getNodeAspectRatio(n1H);
        const ar2H = getNodeAspectRatio(n2H);
        const combAspectH = ar1H + ar2H;
        const aspectDiffH = Math.abs(Math.log(combAspectH / desiredAspect));
        const areaMismatchH = Math.abs(Math.log((ar1H / combAspectH) / f1));
        const sf1H = (ar1H / combAspectH) / f1;
        const sf2H = (ar2H / combAspectH) / f2;
        let penH = 0;
        if (sf1H < minSFAllowed) penH += (minSFAllowed - sf1H) * 80;
        if (sf1H > maxSFAllowed) penH += (sf1H - maxSFAllowed) * 80;
        if (sf2H < minSFAllowed) penH += (minSFAllowed - sf2H) * 80;
        if (sf2H > maxSFAllowed) penH += (sf2H - maxSFAllowed) * 80;
        const repPenaltyH = parentDir === 'horizontal' ? 0.40 : 0;
        const jitterH = (rng.next() - 0.5) * noiseFactor;
        costH = aspectDiffH * 2.5 + areaMismatchH * 3.5 + penH + repPenaltyH + jitterH;
      }

      if (doV) {
        n1V = recurse(g1, desiredAspect / f1, 'vertical', depth + 1);
        n2V = recurse(g2, desiredAspect / f2, 'vertical', depth + 1);
        const ar1V = getNodeAspectRatio(n1V);
        const ar2V = getNodeAspectRatio(n2V);
        const inv1V = 1 / Math.max(0.01, ar1V);
        const inv2V = 1 / Math.max(0.01, ar2V);
        const invSumV = inv1V + inv2V;
        const combAspectV = 1 / Math.max(0.01, invSumV);
        const aspectDiffV = Math.abs(Math.log(combAspectV / desiredAspect));
        const areaMismatchV = Math.abs(Math.log((inv1V / invSumV) / f1));
        const sf1V = (inv1V / invSumV) / f1;
        const sf2V = (inv2V / invSumV) / f2;
        let penV = 0;
        if (sf1V < minSFAllowed) penV += (minSFAllowed - sf1V) * 80;
        if (sf1V > maxSFAllowed) penV += (sf1V - maxSFAllowed) * 80;
        if (sf2V < minSFAllowed) penV += (minSFAllowed - sf2V) * 80;
        if (sf2V > maxSFAllowed) penV += (sf2V - maxSFAllowed) * 80;
        const repPenaltyV = parentDir === 'vertical' ? 0.40 : 0;
        const jitterV = (rng.next() - 0.5) * noiseFactor;
        costV = aspectDiffV * 2.5 + areaMismatchV * 3.5 + penV + repPenaltyV + jitterV;
      }

      const isH = costH <= costV;
      const minCost = isH ? costH : costV;

      if (!bestChoice || minCost < bestChoice.cost) {
        bestChoice = {
          node: {
            type: isH ? 'horizontal' : 'vertical',
            children: isH
              ? (rng.nextBool() ? [n1H!, n2H!] : [n2H!, n1H!])
              : (rng.nextBool() ? [n1V!, n2V!] : [n2V!, n1V!]),
          },
          cost: minCost,
        };
      }
    }

    return bestChoice!.node;
  }

  // Generate candidates and filter for scale factor, coverage, and distortion compliance
  const numOrderings =
    settings.randomness === 'high' ? 3 : settings.randomness === 'medium' ? 2 : 1;
  let bestCompliantRoot: LayoutNode | null = null;
  let bestCompliantScore = -Infinity;
  let fallbackRoot: LayoutNode | null = null;
  let fallbackScore = -Infinity;

  const canvasW = settings.canvasWidth;
  const canvasH = settings.canvasHeight;
  const targetAvgArea = (canvasW * canvasH) / photos.length;

  for (let ordIdx = 0; ordIdx < numOrderings; ordIdx++) {
    const shuffled = ordIdx === 0 ? photos : rng.shuffle(photos);
    const root = recurse(shuffled, targetAspect, null, 0);
    const pl = layoutNodeToPlacements(root, 0, 0, canvasW, canvasH, settings.spacing, [], false);

    let minSF = Infinity;
    let maxSF = -Infinity;
    let maxDistort = 0;
    let coveredArea = 0;

    for (const p of pl) {
      const cellW = settings.spacing > 0 ? p.width + settings.spacing : p.width;
      const cellH = settings.spacing > 0 ? p.height + settings.spacing : p.height;
      const area = cellW * cellH;
      coveredArea += area;
      const sf = area / targetAvgArea;
      if (sf < minSF) minSF = sf;
      if (sf > maxSF) maxSF = sf;
      const curRatio = p.width / Math.max(1, p.height);
      const dist = Math.abs(curRatio - p.aspectRatio) / p.aspectRatio;
      if (dist > maxDistort) maxDistort = dist;
    }

    const cov = Math.min(1, Math.max(0, coveredArea / (canvasW * canvasH)));
    const compliant =
      cov >= 0.959 &&
      minSF >= minSFAllowed - 0.005 &&
      maxSF <= maxSFAllowed + 0.005 &&
      maxDistort <= 0.08;

    // Score layout: balance, aspect fidelity, coverage, stochastic jitter
    const ar = getNodeAspectRatio(root);
    const aspectDiff = Math.abs(Math.log(ar / targetAspect));
    const jitter = (rng.next() - 0.5) * (noiseFactor * 4.0);
    const score = cov * 100 - aspectDiff * 20 - maxDistort * 50 + jitter;

    if (compliant && score > bestCompliantScore) {
      bestCompliantScore = score;
      bestCompliantRoot = root;
      if (cov >= 0.98) break; // Early exit on high-quality compliant tree
    }
    if (score > fallbackScore) {
      fallbackScore = score;
      fallbackRoot = root;
    }
  }

  return bestCompliantRoot || fallbackRoot || recurse(photos, targetAspect);
}

/**
 * Exact Uniform Mode Solver:
 * Fast, vector-optimized analytical search across Row counts R, Column counts C,
 * aspect-sorted chunkings, and hill-climbing swaps to find a layout that strictly satisfies:
 * 1) 0.70 <= minScaleFactor <= maxScaleFactor <= 1.30 (relative to canvasArea / N)
 * 2) coverage >= 0.96 (96.0%+)
 * 3) exact aspect ratio fidelity (0% crop, 0% stretch)
 * 4) seamless edge-to-edge alignment (0 gaps)
 * 5) 100% strictly within canvas bounds
 */
export function solveStrictUniformLayout(
  photos: Photo[],
  canvasWidth: number,
  canvasHeight: number,
  spacing: number,
  rng: SeededRNG
): Placement[] {
  const N = photos.length;
  if (N === 0) return [];
  if (N === 1) {
    const p = photos[0];
    const canvasAspect = canvasWidth / canvasHeight;
    let w: number;
    let h: number;
    if (p.aspectRatio >= canvasAspect) {
      w = canvasWidth;
      h = Math.max(1, Math.round(canvasWidth / p.aspectRatio));
    } else {
      h = canvasHeight;
      w = Math.max(1, Math.round(canvasHeight * p.aspectRatio));
    }
    const x = Math.max(0, Math.round((canvasWidth - w) / 2));
    const y = Math.max(0, Math.round((canvasHeight - h) / 2));
    return [{ photoId: p.id, x, y, width: w, height: h, aspectRatio: p.aspectRatio }];
  }

  // Fast analytical evaluation of row partition without allocating placement objects
  function fastEvalRows(activeRows: Photo[][]): { minSF: number; maxSF: number; cov: number; maxDistort: number; isCompliant: boolean } | null {
    const R = activeRows.length;
    if (R === 0) return null;
    let totalRelH = 0;
    for (let r = 0; r < R; r++) {
      const row = activeRows[r];
      if (row.length === 0) return null;
      let s = 0;
      for (let i = 0; i < row.length; i++) s += row[i].aspectRatio;
      if (s <= 0) return null;
      totalRelH += 1.0 / s;
    }
    if (totalRelH <= 0) return null;

    const K = N / totalRelH;
    let minSF = Infinity;
    let maxSF = -Infinity;

    for (let r = 0; r < R; r++) {
      const row = activeRows[r];
      let s = 0;
      let minA = Infinity;
      let maxA = -Infinity;
      for (let i = 0; i < row.length; i++) {
        const ar = row[i].aspectRatio;
        s += ar;
        if (ar < minA) minA = ar;
        if (ar > maxA) maxA = ar;
      }
      const Fr = K / (s * s);
      const rowMinSF = Fr * minA;
      const rowMaxSF = Fr * maxA;
      if (rowMinSF < minSF) minSF = rowMinSF;
      if (rowMaxSF > maxSF) maxSF = rowMaxSF;
    }

    const maxDistort = Math.abs((canvasWidth / canvasHeight) * totalRelH - 1);
    const cov = 1.0;
    const isCompliant = minSF >= 0.6999 && maxSF <= 1.3001 && maxDistort <= 0.0801;
    return { minSF, maxSF, cov, maxDistort, isCompliant };
  }

  // Fast analytical evaluation of col partition without allocating placement objects
  function fastEvalCols(activeCols: Photo[][]): { minSF: number; maxSF: number; cov: number; maxDistort: number; isCompliant: boolean } | null {
    const C = activeCols.length;
    if (C === 0) return null;
    let totalRelW = 0;
    for (let c = 0; c < C; c++) {
      const col = activeCols[c];
      if (col.length === 0) return null;
      let s = 0;
      for (let i = 0; i < col.length; i++) s += 1.0 / col[i].aspectRatio;
      if (s <= 0) return null;
      totalRelW += 1.0 / s;
    }
    if (totalRelW <= 0) return null;

    const K = N / totalRelW;
    let minSF = Infinity;
    let maxSF = -Infinity;

    for (let c = 0; c < C; c++) {
      const col = activeCols[c];
      let s = 0;
      let minInvA = Infinity;
      let maxInvA = -Infinity;
      for (let i = 0; i < col.length; i++) {
        const invA = 1.0 / col[i].aspectRatio;
        s += invA;
        if (invA < minInvA) minInvA = invA;
        if (invA > maxInvA) maxInvA = invA;
      }
      const Fc = K / (s * s);
      const colMinSF = Fc * minInvA;
      const colMaxSF = Fc * maxInvA;
      if (colMinSF < minSF) minSF = colMinSF;
      if (colMaxSF > maxSF) maxSF = colMaxSF;
    }

    const maxDistort = Math.abs((canvasHeight / canvasWidth) * totalRelW - 1);
    const cov = 1.0;
    const isCompliant = minSF >= 0.6999 && maxSF <= 1.3001 && maxDistort <= 0.0801;
    return { minSF, maxSF, cov, maxDistort, isCompliant };
  }

  // Fast in-place hill-climbing optimizer for row partition
  function optimizeRows(initialRows: Photo[][]): Photo[][] {
    const currentRows = initialRows.map(r => [...r]);
    const initEval = fastEvalRows(currentRows);
    if (!initEval || initEval.isCompliant) return currentRows;

    const calcViol = (e: { minSF: number; maxSF: number; maxDistort: number }) =>
      (e.minSF < 0.70 ? (0.70 - e.minSF) * 4 : 0) +
      (e.maxSF > 1.30 ? (e.maxSF - 1.30) * 4 : 0) +
      (e.maxDistort > 0.08 ? (e.maxDistort - 0.08) * 5 : 0);

    let curViol = calcViol(initEval);

    for (let iter = 0; iter < 10; iter++) {
      let improved = false;
      const R = currentRows.length;

      // 1. Move photo from r1 to r2
      for (let r1 = 0; r1 < R; r1++) {
        if (currentRows[r1].length <= 1) continue;
        for (let pIdx = 0; pIdx < currentRows[r1].length; pIdx++) {
          const photoToMove = currentRows[r1][pIdx];
          for (let r2 = 0; r2 < R; r2++) {
            if (r1 === r2) continue;
            currentRows[r1].splice(pIdx, 1);
            currentRows[r2].push(photoToMove);

            const res = fastEvalRows(currentRows);
            if (res) {
              const newViol = calcViol(res);
              if (newViol < curViol - 0.0005) {
                curViol = newViol;
                improved = true;
                if (res.isCompliant) return currentRows;
                break;
              }
            }
            // Revert move
            currentRows[r2].pop();
            currentRows[r1].splice(pIdx, 0, photoToMove);
          }
          if (improved) break;
        }
        if (improved) break;
      }

      // 2. Swap photos between r1 and r2
      if (!improved) {
        for (let r1 = 0; r1 < R; r1++) {
          for (let i1 = 0; i1 < currentRows[r1].length; i1++) {
            for (let r2 = r1 + 1; r2 < R; r2++) {
              for (let i2 = 0; i2 < currentRows[r2].length; i2++) {
                const tmp = currentRows[r1][i1];
                currentRows[r1][i1] = currentRows[r2][i2];
                currentRows[r2][i2] = tmp;

                const res = fastEvalRows(currentRows);
                if (res) {
                  const newViol = calcViol(res);
                  if (newViol < curViol - 0.0005) {
                    curViol = newViol;
                    improved = true;
                    if (res.isCompliant) return currentRows;
                    break;
                  }
                }
                // Revert swap
                currentRows[r2][i2] = currentRows[r1][i1];
                currentRows[r1][i1] = tmp;
              }
              if (improved) break;
            }
            if (improved) break;
          }
          if (improved) break;
        }
      }

      if (!improved) break;
    }
    return currentRows;
  }

  // Fast in-place hill-climbing optimizer for col partition
  function optimizeCols(initialCols: Photo[][]): Photo[][] {
    const currentCols = initialCols.map(c => [...c]);
    const initEval = fastEvalCols(currentCols);
    if (!initEval || initEval.isCompliant) return currentCols;

    const calcViol = (e: { minSF: number; maxSF: number; maxDistort: number }) =>
      (e.minSF < 0.70 ? (0.70 - e.minSF) * 4 : 0) +
      (e.maxSF > 1.30 ? (e.maxSF - 1.30) * 4 : 0) +
      (e.maxDistort > 0.08 ? (e.maxDistort - 0.08) * 5 : 0);

    let curViol = calcViol(initEval);

    for (let iter = 0; iter < 10; iter++) {
      let improved = false;
      const C = currentCols.length;

      // 1. Move photo from c1 to c2
      for (let c1 = 0; c1 < C; c1++) {
        if (currentCols[c1].length <= 1) continue;
        for (let pIdx = 0; pIdx < currentCols[c1].length; pIdx++) {
          const photoToMove = currentCols[c1][pIdx];
          for (let c2 = 0; c2 < C; c2++) {
            if (c1 === c2) continue;
            currentCols[c1].splice(pIdx, 1);
            currentCols[c2].push(photoToMove);

            const res = fastEvalCols(currentCols);
            if (res) {
              const newViol = calcViol(res);
              if (newViol < curViol - 0.0005) {
                curViol = newViol;
                improved = true;
                if (res.isCompliant) return currentCols;
                break;
              }
            }
            currentCols[c2].pop();
            currentCols[c1].splice(pIdx, 0, photoToMove);
          }
          if (improved) break;
        }
        if (improved) break;
      }

      // 2. Swap photos between c1 and c2
      if (!improved) {
        for (let c1 = 0; c1 < C; c1++) {
          for (let i1 = 0; i1 < currentCols[c1].length; i1++) {
            for (let c2 = c1 + 1; c2 < C; c2++) {
              for (let i2 = 0; i2 < currentCols[c2].length; i2++) {
                const tmp = currentCols[c1][i1];
                currentCols[c1][i1] = currentCols[c2][i2];
                currentCols[c2][i2] = tmp;

                const res = fastEvalCols(currentCols);
                if (res) {
                  const newViol = calcViol(res);
                  if (newViol < curViol - 0.0005) {
                    curViol = newViol;
                    improved = true;
                    if (res.isCompliant) return currentCols;
                    break;
                  }
                }
                currentCols[c2][i2] = currentCols[c1][i1];
                currentCols[c1][i1] = tmp;
              }
              if (improved) break;
            }
            if (improved) break;
          }
          if (improved) break;
        }
      }

      if (!improved) break;
    }
    return currentCols;
  }

  // Final placement constructor from optimal row configuration
  function buildFinalRowPlacements(activeRows: Photo[][]): Placement[] {
    const rowAspectSums = activeRows.map(r => r.reduce((sum, p) => sum + p.aspectRatio, 0));
    const relHeights = rowAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
    const totalRelH = relHeights.reduce((sum, h) => sum + h, 0);

    const blockW = canvasWidth;
    const blockH = canvasHeight;
    const placements: Placement[] = [];
    let curY = 0;

    for (let r = 0; r < activeRows.length; r++) {
      const row = activeRows[r];
      const rowSum = rowAspectSums[r];
      const nextY = (r === activeRows.length - 1)
        ? blockH
        : Math.round(blockH * (relHeights.slice(0, r + 1).reduce((a, b) => a + b, 0) / totalRelH));
      const rh = Math.max(1, nextY - curY);

      let curX = 0;
      let cumAspect = 0;

      for (let i = 0; i < row.length; i++) {
        const p = row[i];
        cumAspect += p.aspectRatio;
        const nextX = (i === row.length - 1)
          ? blockW
          : Math.round(blockW * (cumAspect / rowSum));
        const pw = Math.max(1, nextX - curX);
        const pad = spacing > 0 ? spacing / 2 : 0;

        placements.push({
          photoId: p.id,
          x: Math.round(curX + pad),
          y: Math.round(curY + pad),
          width: Math.max(1, Math.round(pw - spacing)),
          height: Math.max(1, Math.round(rh - spacing)),
          aspectRatio: p.aspectRatio,
        });
        curX = nextX;
      }
      curY = nextY;
    }
    return placements;
  }

  // Final placement constructor from optimal col configuration
  function buildFinalColPlacements(activeCols: Photo[][]): Placement[] {
    const colInvAspectSums = activeCols.map(c => c.reduce((sum, p) => sum + 1.0 / p.aspectRatio, 0));
    const relWidths = colInvAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
    const totalRelW = relWidths.reduce((sum, w) => sum + w, 0);

    const blockW = canvasWidth;
    const blockH = canvasHeight;
    const placements: Placement[] = [];
    let curX = 0;

    for (let c = 0; c < activeCols.length; c++) {
      const col = activeCols[c];
      const colInvSum = colInvAspectSums[c];
      const nextX = (c === activeCols.length - 1)
        ? blockW
        : Math.round(blockW * (relWidths.slice(0, c + 1).reduce((a, b) => a + b, 0) / totalRelW));
      const cw = Math.max(1, nextX - curX);

      let curY = 0;
      let cumInvAspect = 0;

      for (let pIdx = 0; pIdx < col.length; pIdx++) {
        const p = col[pIdx];
        cumInvAspect += 1.0 / p.aspectRatio;
        const nextY = (pIdx === col.length - 1)
          ? blockH
          : Math.round(blockH * (cumInvAspect / colInvSum));
        const ph = Math.max(1, nextY - curY);
        const pad = spacing > 0 ? spacing / 2 : 0;

        placements.push({
          photoId: p.id,
          x: Math.round(curX + pad),
          y: Math.round(curY + pad),
          width: Math.max(1, Math.round(cw - spacing)),
          height: Math.max(1, Math.round(ph - spacing)),
          aspectRatio: p.aspectRatio,
        });
        curY = nextY;
      }
      curX = nextX;
    }
    return placements;
  }

  const sortedPhotos = [...photos].sort((a, b) => a.aspectRatio - b.aspectRatio);
  const shuffledPhotos = rng.shuffle(photos);

  let bestConfig: { type: 'rows'; rows: Photo[][] } | { type: 'cols'; cols: Photo[][] } | null = null;
  let bestScore = -Infinity;

  // 1. Search across Row counts R (Horizontal Slicing)
  const R_ideal = Math.max(1, Math.min(N, Math.round(Math.sqrt(N * (canvasHeight / canvasWidth)))));
  const minR = Math.max(1, R_ideal - 2);
  const maxR = Math.min(Math.max(1, Math.floor(N / 2)), R_ideal + 2);

  for (let R = minR; R <= maxR; R++) {
    // Strategy A: Shuffled allocation
    const rowsShuffled: Photo[][] = Array.from({ length: R }, () => []);
    for (let i = 0; i < N; i++) rowsShuffled[i % R].push(shuffledPhotos[i]);
    const optRowsShuf = optimizeRows(rowsShuffled);
    const evalShuf = fastEvalRows(optRowsShuf);
    if (evalShuf) {
      const randBonus = rng.next() * 200;
      const score = evalShuf.isCompliant
        ? 20000 + randBonus + evalShuf.cov * 1000 - Math.max(Math.abs(evalShuf.minSF - 1.0), Math.abs(evalShuf.maxSF - 1.0)) * 100
        : evalShuf.cov * 100 - (evalShuf.minSF < 0.70 ? (0.70 - evalShuf.minSF) * 500 : 0) - (evalShuf.maxSF > 1.30 ? (evalShuf.maxSF - 1.30) * 500 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestConfig = { type: 'rows', rows: optRowsShuf };
        if (evalShuf.isCompliant && score > 20150) break;
      }
    }

    // Strategy B: Sorted chunks
    const rowsSorted: Photo[][] = Array.from({ length: R }, () => []);
    for (let i = 0; i < N; i++) rowsSorted[Math.min(R - 1, Math.floor((i * R) / N))].push(sortedPhotos[i]);
    const optRowsSorted = optimizeRows(rowsSorted);
    const evalSorted = fastEvalRows(optRowsSorted);
    if (evalSorted) {
      const score = evalSorted.isCompliant
        ? 10000 + evalSorted.cov * 1000 - Math.max(Math.abs(evalSorted.minSF - 1.0), Math.abs(evalSorted.maxSF - 1.0)) * 200
        : evalSorted.cov * 100 - (evalSorted.minSF < 0.70 ? (0.70 - evalSorted.minSF) * 500 : 0) - (evalSorted.maxSF > 1.30 ? (evalSorted.maxSF - 1.30) * 500 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestConfig = { type: 'rows', rows: optRowsSorted };
      }
    }
  }

  // 2. Search across Column counts C (Vertical Slicing)
  const C_ideal = Math.max(1, Math.min(N, Math.round(Math.sqrt(N * (canvasWidth / canvasHeight)))));
  const minC = Math.max(1, C_ideal - 2);
  const maxC = Math.min(Math.max(1, Math.floor(N / 2)), C_ideal + 2);

  for (let C = minC; C <= maxC; C++) {
    const colsShuf: Photo[][] = Array.from({ length: C }, () => []);
    for (let i = 0; i < N; i++) colsShuf[i % C].push(shuffledPhotos[i]);
    const optColsShuf = optimizeCols(colsShuf);
    const evalShuf = fastEvalCols(optColsShuf);
    if (evalShuf) {
      const randBonus = rng.next() * 200;
      const score = evalShuf.isCompliant
        ? 20000 + randBonus + evalShuf.cov * 1000 - Math.max(Math.abs(evalShuf.minSF - 1.0), Math.abs(evalShuf.maxSF - 1.0)) * 100
        : evalShuf.cov * 100 - (evalShuf.minSF < 0.70 ? (0.70 - evalShuf.minSF) * 500 : 0) - (evalShuf.maxSF > 1.30 ? (evalShuf.maxSF - 1.30) * 500 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestConfig = { type: 'cols', cols: optColsShuf };
      }
    }
  }

  if (bestConfig) {
    return bestConfig.type === 'rows'
      ? buildFinalRowPlacements(bestConfig.rows)
      : buildFinalColPlacements(bestConfig.cols);
  }

  // Fallback row layout
  const fallbackRows: Photo[][] = Array.from({ length: R_ideal }, () => []);
  for (let i = 0; i < N; i++) fallbackRows[i % R_ideal].push(shuffledPhotos[i]);
  return buildFinalRowPlacements(fallbackRows);
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
  const rows: Photo[][] = [];

  const baseRowHeight = canvasHeight / targetRowCount;
  const targetRowAspect = canvasWidth / baseRowHeight;
  const varianceRange =
    settings.sizeVariation === 'low'
      ? [0.95, 1.05]
      : settings.sizeVariation === 'medium'
      ? [0.85, 1.18]
      : [0.70, 1.35];

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

  const activeRows = rows.filter(r => r.length > 0);
  if (activeRows.length === 0) return placements;

  const rowAspectSums = activeRows.map(r => r.reduce((sum, p) => sum + p.aspectRatio, 0));
  const relHeights = rowAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
  const totalRelH = relHeights.reduce((sum, h) => sum + h, 0);

  const blockW = canvasWidth;
  const blockH = canvasHeight;
  const startX = 0;
  const startY = 0;

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

  const cols: Photo[][] = Array.from({ length: numCols }, () => []);
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

  const activeCols = cols.filter(c => c.length > 0);
  if (activeCols.length === 0) return placements;

  const colInvAspectSums = activeCols.map(c => c.reduce((sum, p) => sum + 1 / p.aspectRatio, 0));
  const relWidths = colInvAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
  const totalRelW = relWidths.reduce((sum, w) => sum + w, 0);

  const blockW = canvasWidth;
  const blockH = canvasHeight;
  const startX = 0;
  const startY = 0;

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
 * Symmetrical structured grid with exact photo aspect ratios, zero crop, zero stretch, and zero gaps.
 */
export function buildGridLayout(
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
  const numRows = Math.ceil(N / numCols);

  const rows: Photo[][] = Array.from({ length: numRows }, () => []);
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / numCols);
    rows[r].push(shuffled[i]);
  }

  const activeRows = rows.filter(r => r.length > 0);
  const rowAspectSums = activeRows.map(r => r.reduce((sum, p) => sum + p.aspectRatio, 0));
  const relHeights = rowAspectSums.map(s => (s > 0 ? 1.0 / s : 1.0));
  const totalRelH = relHeights.reduce((sum, h) => sum + h, 0);

  const blockW = canvasWidth;
  const blockH = canvasHeight;
  const startX = 0;
  const startY = 0;

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
