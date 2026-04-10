import React from 'react';
import { Service, Detailer, type VehicleSize } from './types';

const currentYear = new Date().getFullYear();
export const VEHICLE_YEARS = Array.from({ length: 16 }, (_, i) => String(currentYear - i));
const VEHICLE_MAKES_LIST = [
  'Honda', 'Toyota', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes-Benz', 'Hyundai', 'Kia', 'Jeep',
  'Volkswagen', 'Subaru', 'Mazda', 'Ram', 'GMC', 'Dodge', 'Lexus', 'Audi', 'Tesla', 'Acura', 'Cadillac', 'Other',
] as const;
const OTHER_MAKE = 'Other';
export const VEHICLE_MAKES = [
  ...VEHICLE_MAKES_LIST.filter((m) => m !== OTHER_MAKE).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  ),
  OTHER_MAKE,
];
export const VEHICLE_COLORS = ['Black', 'White', 'Gray', 'Silver', 'Red', 'Blue', 'Brown', 'Green', 'Other'];

/** Vehicle size options for pricing (label + id). */
export const VEHICLE_SIZES: { id: VehicleSize; label: string; sublabel?: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'medium', label: 'Medium', sublabel: 'Small SUV/Truck' },
  { id: 'large', label: 'Large', sublabel: '3-Row/Large Truck' },
  { id: 'xl', label: 'XL', sublabel: 'Van/Lifted/Dualy' },
];

/** Services: standard and express tiers. Price comes from PRICING_MATRIX by vehicle size (express tiers use flat pricing). */
export const SERVICES: Service[] = [
  {
    id: 'interior-detail',
    name: 'Interior Detail',
    price: 175,
    duration: '2–3 hrs',
    description: 'Deep vacuum, steam clean, upholstery and surfaces.',
  },
  {
    id: 'exterior-detail',
    name: 'Exterior Detail',
    price: 125,
    duration: '1–1.5 hrs',
    description: 'Wash, wax, wheels and trim.',
  },
  {
    id: 'full-detail',
    name: 'Full Detail',
    price: 250,
    duration: '3–4 hrs',
    description: 'Interior + exterior full detail.',
  },
  {
    id: 'express-interior',
    name: 'Express Interior',
    price: 85,
    duration: '1–1.5 hrs',
    description: 'Quick interior refresh: vacuum, wipe-down, and light surface care.',
  },
  {
    id: 'express-exterior',
    name: 'Express Exterior',
    price: 75,
    duration: '45 min–1 hr',
    description: 'Fast exterior: wash, dry, wheels, and basic shine.',
  },
  {
    id: 'express-full-detail',
    name: 'Express Full Detail',
    price: 150,
    duration: '1.5–2.5 hrs',
    description: 'Streamlined interior and exterior package for a same-day refresh.',
  },
];

/** Pricing matrix: [serviceId][vehicleSize] = price (USD). */
export const PRICING_MATRIX: Record<string, Record<VehicleSize, number>> = {
  'interior-detail': { sedan: 175, medium: 215, large: 250, xl: 300 },
  'exterior-detail': { sedan: 125, medium: 150, large: 185, xl: 225 },
  'full-detail': { sedan: 250, medium: 285, large: 315, xl: 375 },
  'express-interior': { sedan: 85, medium: 85, large: 85, xl: 85 },
  'express-exterior': { sedan: 75, medium: 75, large: 75, xl: 75 },
  'express-full-detail': { sedan: 150, medium: 150, large: 150, xl: 150 },
};

export function getServicePrice(serviceId: string, vehicleSize: VehicleSize): number {
  const row = PRICING_MATRIX[serviceId];
  if (!row) return 0;
  return row[vehicleSize] ?? 0;
}

/** Midpoint minutes per service (for multi-vehicle scheduled duration totals). */
export const SERVICE_DURATION_MINUTES: Record<string, number> = {
  'interior-detail': 150,
  'exterior-detail': 75,
  'full-detail': 210,
  'express-interior': 75,
  'express-exterior': 52,
  'express-full-detail': 120,
};

export function getServiceDurationMinutes(serviceId: string): number {
  return SERVICE_DURATION_MINUTES[serviceId] ?? 90;
}

/** Human-readable combined service time for detailers / checkout. */
export function formatCombinedDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '—';
  if (totalMinutes < 60) return `~${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `~${h} hr`;
  return `~${h} hr ${m} min`;
}

/** Add-ons: optional extras with fixed price (USD). */
export const ADD_ONS: { id: string; name: string; price: number }[] = [
  { id: 'pet-hair', name: 'Pet hair removal', price: 25 },
  { id: 'engine-bay', name: 'Engine bay wipe', price: 20 },
  { id: 'odor', name: 'Odor treatment', price: 35 },
  { id: 'headlight', name: 'Headlight restoration', price: 45 },
];

/** Dirtiness / condition levels: label and upcharge in USD (protects detailers). */
export type DirtinessLevel = 'light' | 'normal' | 'heavy' | 'extreme';

export const DIRTINESS_LEVELS: { id: DirtinessLevel; label: string; upcharge: number }[] = [
  { id: 'light', label: 'Light', upcharge: 0 },
  { id: 'normal', label: 'Normal', upcharge: 0 },
  { id: 'heavy', label: 'Heavy', upcharge: 15 },
  { id: 'extreme', label: 'Extreme', upcharge: 30 },
];

export function getDirtinessUpcharge(level: DirtinessLevel): number {
  return DIRTINESS_LEVELS.find((d) => d.id === level)?.upcharge ?? 0;
}

