import type { VehicleSize } from '../types';

const SIZE_ORDER: VehicleSize[] = ['sedan', 'medium', 'large', 'xl'];

/** Model substrings that indicate XL (vans, heavy duty, dualy, etc.) */
const XL_MODEL_PATTERNS: string[] = [
  'transit', 'sprinter', 'promaster', 'nv', 'express', 'savana',
  'dualy', 'dually', '3500', '4500', '5500', 'chassis cab',
  'e-series', 'econoline',
];

/** Model substrings that indicate large (full-size trucks, large SUVs) */
const LARGE_MODEL_PATTERNS: string[] = [
  'f-150', 'f150', 'silverado', 'sierra 1500', 'sierra 2500', 'sierra 3500',
  'ram 1500', 'ram 2500', 'ram 3500', 'tundra', 'titan',
  'suburban', 'yukon xl', 'escalade esv', 'navigator l', 'armada',
  'tahoe', 'yukon', 'expedition', 'sequoia', '4runner',
  'wrangler', 'gladiator', 'bronco', 'ranger',
  'colorado', 'canyon', 'frontier', 'tacoma', 'ridgeline',
  'sierra', 'denali', 'durango', 'grand cherokee', 'telluride', 'palisade',
  'atlas', 'ascent', 'highlander', 'pilot', 'passport', 'explorer',
  'traverse', 'atlas cross sport',
];

/** Model substrings that indicate medium (mid-size SUVs, crossovers, small trucks) */
const MEDIUM_MODEL_PATTERNS: string[] = [
  'cr-v', 'crv', 'rav4', 'rav 4', 'escape', 'equinox', 'rogue', 'tucson',
  'sportage', 'cx-5', 'cx5', 'forester', 'outback', 'crosstrek',
  'edge', 'murano', 'pathfinder', 'pilot', 'highlander', '4runner',
  'explorer', 'traverse', 'acadia', 'enclave', 'atlas',
  'compass', 'renegade', 'cherokee', 'bronco sport',
  'model y', 'model x', 'id.4', 'ev6', 'ioniq 5', 'mach-e', 'mustang mach-e',
];

/** Model substrings that indicate sedan/compact (clear sedans) */
const SEDAN_MODEL_PATTERNS: string[] = [
  'civic', 'accord', 'camry', 'corolla', 'altima', 'maxima', 'sentra',
  'fusion', 'malibu', 'impala', 'cruze', 'spark',
  'elantra', 'sonata', 'optima', 'k5', 'forte', 'rio',
  'passat', 'jetta', 'golf', 'gli', 'gti',
  'mazda3', 'mazda 3', 'mazda6', 'mazda 6', 'legacy', 'wrx', 'impreza',
  'model 3', 'model s', 'a3', 'a4', 'a6', '3 series', '5 series',
  'c-class', 'e-class', 'is ', 'es ', 'gs ', 'ls ',
  'tlx', 'ilx', 'rlx', 'cts', 'ct5', 'ct6',
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Infer vehicle size tier from make and model for fair pricing.
 * Used to prevent selecting "Sedan" when the vehicle is a truck or large SUV.
 */
export function inferVehicleSize(make: string, model: string): VehicleSize {
  const m = normalize(make);
  const mod = normalize(model);
  if (!m || !mod) return 'medium'; // conservative default when insufficient info

  const combined = `${m} ${mod}`;

  for (const pattern of XL_MODEL_PATTERNS) {
    if (combined.includes(pattern)) return 'xl';
  }
  for (const pattern of LARGE_MODEL_PATTERNS) {
    if (combined.includes(pattern)) return 'large';
  }
  for (const pattern of MEDIUM_MODEL_PATTERNS) {
    if (combined.includes(pattern)) return 'medium';
  }
  for (const pattern of SEDAN_MODEL_PATTERNS) {
    if (combined.includes(pattern)) return 'sedan';
  }

  // Make-level hints for common truck/SUV brands when model wasn't in patterns
  if (m === 'ram') return 'large';
  if (m === 'gmc' && (mod.includes('sierra') || mod.includes('yukon') || mod.includes('canyon') || mod.includes('denali'))) return 'large';
  if (m === 'ford' && (mod.includes('f-') || mod.includes('f150') || mod.includes('ranger') || mod.includes('expedition') || mod.includes('bronco'))) return 'large';
  if (m === 'chevrolet' && (mod.includes('silverado') || mod.includes('tahoe') || mod.includes('suburban'))) return 'large';
  if (m === 'toyota' && (mod.includes('tundra') || mod.includes('tacoma') || mod.includes('sequoia') || mod.includes('4runner'))) return 'large';
  if (m === 'jeep' && (mod.includes('wrangler') || mod.includes('gladiator') || mod.includes('grand cherokee'))) return 'large';

  return 'medium'; // unknown / Other: conservative to avoid undercharging
}

/** Compare two sizes: returns true if a is strictly smaller tier than b. */
export function isSizeSmallerThan(a: VehicleSize, b: VehicleSize): boolean {
  return SIZE_ORDER.indexOf(a) < SIZE_ORDER.indexOf(b);
}

/** Minimum allowed size (user cannot select a smaller tier than this). */
export function minimumAllowedSize(inferred: VehicleSize): VehicleSize {
  return inferred;
}
