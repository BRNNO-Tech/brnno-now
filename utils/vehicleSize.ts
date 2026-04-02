import type { VehicleSize } from '../types';

const SIZE_ORDER: VehicleSize[] = ['sedan', 'medium', 'large', 'xl'];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a pattern against free-text make/model without substring false positives
 * (e.g. "edge" in "knowledge", "rio" in "Patriot", "nv" in "Envoy").
 * Multi-word patterns allow flexible non-alphanumeric separators; single tokens are whole-token only.
 */
function patternMatches(haystack: string, pattern: string): boolean {
  const hay = normalize(haystack).replace(/-/g, ' ');
  const pNorm = normalize(pattern).replace(/-/g, ' ');
  if (!pNorm || !hay) return false;
  const parts = pNorm.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const body = parts.map(escapeRegExp).join('[^a-z0-9]+');
    return new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, 'i').test(hay);
  }
  const single = escapeRegExp(parts[0]!);
  return new RegExp(`(^|[^a-z0-9])${single}([^a-z0-9]|$)`, 'i').test(hay);
}

/** Model substrings that indicate XL (vans, heavy duty, dualy, etc.) */
const XL_MODEL_PATTERNS: string[] = [
  'transit',
  'sprinter',
  'promaster',
  'nv200',
  'nv2500',
  'nv3500',
  'nv1500',
  'nv passenger',
  'express',
  'savana',
  'dualy',
  'dually',
  '3500',
  '4500',
  '5500',
  'chassis cab',
  'e-series',
  'econoline',
];

/** Model substrings that indicate large (full-size trucks, large SUVs) */
const LARGE_MODEL_PATTERNS: string[] = [
  'f-150',
  'f150',
  'silverado',
  'sierra 1500',
  'sierra 2500',
  'sierra 3500',
  'ram 1500',
  'ram 2500',
  'ram 3500',
  'tundra',
  'titan',
  'suburban',
  'yukon xl',
  'escalade esv',
  'navigator l',
  'armada',
  'tahoe',
  'yukon',
  'expedition',
  'sequoia',
  '4runner',
  'wrangler',
  'gladiator',
  'bronco',
  'ranger',
  'colorado',
  'canyon',
  'frontier',
  'tacoma',
  'ridgeline',
  'sierra',
  'denali',
  'durango',
  'grand cherokee',
  'telluride',
  'palisade',
  'atlas',
  'ascent',
  'highlander',
  'pilot',
  'passport',
  'explorer',
  'traverse',
  'atlas cross sport',
];

/** Model substrings that indicate medium (mid-size SUVs, crossovers, small trucks) */
const MEDIUM_MODEL_PATTERNS: string[] = [
  'cr-v',
  'crv',
  'rav4',
  'rav 4',
  'escape',
  'equinox',
  'rogue',
  'tucson',
  'sportage',
  'cx-5',
  'cx5',
  'forester',
  'outback',
  'crosstrek',
  'edge',
  'murano',
  'pathfinder',
  'pilot',
  'highlander',
  '4runner',
  'explorer',
  'traverse',
  'acadia',
  'enclave',
  'atlas',
  'compass',
  'renegade',
  'cherokee',
  'bronco sport',
  'model y',
  'model x',
  'id.4',
  'ev6',
  'ioniq 5',
  'mach-e',
  'mustang mach-e',
  'stelvio',
  'tonale',
];

/** Model substrings that indicate sedan/compact (clear sedans) */
const SEDAN_MODEL_PATTERNS: string[] = [
  'civic',
  'accord',
  'camry',
  'corolla',
  'altima',
  'maxima',
  'sentra',
  'fusion',
  'malibu',
  'impala',
  'cruze',
  'spark',
  'elantra',
  'sonata',
  'optima',
  'k5',
  'forte',
  'rio',
  'passat',
  'jetta',
  'golf',
  'gli',
  'gti',
  'mazda3',
  'mazda 3',
  'mazda6',
  'mazda 6',
  'legacy',
  'wrx',
  'impreza',
  'model 3',
  'model s',
  'a3',
  'a4',
  'a6',
  '3 series',
  '5 series',
  'c-class',
  'e-class',
  'is ',
  'es ',
  'gs ',
  'ls ',
  'tlx',
  'ilx',
  'rlx',
  'cts',
  'ct5',
  'ct6',
  'giulia',
  'giulietta',
  '4c',
];

function matchesAnyPattern(haystack: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => patternMatches(haystack, p));
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
  // When make is "Other", user types real make/model in the model field; matching on
  // "other …" caused noise. Use model text only for pattern tiers (make-specific rules still use m).
  const haystackForPatterns = m === 'other' ? mod : combined;

  if (matchesAnyPattern(haystackForPatterns, XL_MODEL_PATTERNS)) return 'xl';
  if (matchesAnyPattern(haystackForPatterns, LARGE_MODEL_PATTERNS)) return 'large';
  if (matchesAnyPattern(haystackForPatterns, MEDIUM_MODEL_PATTERNS)) return 'medium';
  if (matchesAnyPattern(haystackForPatterns, SEDAN_MODEL_PATTERNS)) return 'sedan';

  // Make-level hints for common truck/SUV brands when model wasn't in patterns
  if (m === 'ram') return 'large';
  if (m === 'gmc' && (mod.includes('sierra') || mod.includes('yukon') || mod.includes('canyon') || mod.includes('denali'))) return 'large';
  if (m === 'ford' && (mod.includes('f-') || mod.includes('f150') || mod.includes('ranger') || mod.includes('expedition') || mod.includes('bronco'))) return 'large';
  if (m === 'chevrolet' && (mod.includes('silverado') || mod.includes('tahoe') || mod.includes('suburban'))) return 'large';
  if (m === 'toyota' && (mod.includes('tundra') || mod.includes('tacoma') || mod.includes('sequoia') || mod.includes('4runner'))) return 'large';
  if (m === 'jeep' && (mod.includes('wrangler') || mod.includes('gladiator') || mod.includes('grand cherokee'))) return 'large';

  return 'medium'; // unknown: conservative to avoid undercharging
}

/** Compare two sizes: returns true if a is strictly smaller tier than b. */
export function isSizeSmallerThan(a: VehicleSize, b: VehicleSize): boolean {
  return SIZE_ORDER.indexOf(a) < SIZE_ORDER.indexOf(b);
}

/** Minimum allowed size (user cannot select a smaller tier than this). */
export function minimumAllowedSize(inferred: VehicleSize): VehicleSize {
  return inferred;
}
