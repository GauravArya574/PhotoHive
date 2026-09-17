/**
 * Mulberry32 seeded pseudo-random number generator.
 * Produces deterministic, reproducible pseudo-random numbers in [0, 1).
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed ? Math.floor(seed) >>> 0 : 1337;
  }

  /**
   * Returns a pseudorandom number between 0 (inclusive) and 1 (exclusive).
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Random integer between min and max (inclusive).
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Random float between min and max.
   */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Random boolean with probability p of true (default 0.5).
   */
  nextBool(p = 0.5): boolean {
    return this.next() < p;
  }

  /**
   * Pick a random item from array.
   */
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Shuffle array in-place (Fisher-Yates) using the seeded RNG.
   */
  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

/**
 * Generate a new random seed integer.
 */
export function generateRandomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}
