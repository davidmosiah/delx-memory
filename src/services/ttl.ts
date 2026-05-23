import { sweepExpired } from "./db.js";

/**
 * Cheap wrapper so callers don't import db internals just to sweep.
 * Returns number of rows deleted.
 */
export function runTtlSweep(now: number = Date.now()): number {
  return sweepExpired(now);
}
