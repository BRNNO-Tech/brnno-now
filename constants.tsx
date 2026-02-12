import React from 'react';
import { Service, Detailer, type VehicleSize } from './types';

const currentYear = new Date().getFullYear();
export const VEHICLE_YEARS = Array.from({ length: 16 }, (_, i) => String(currentYear - i));
export const VEHICLE_MAKES = [
  'Honda', 'Toyota', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes-Benz', 'Hyundai', 'Kia', 'Jeep',
  'Volkswagen', 'Subaru', 'Mazda', 'Ram', 'GMC', 'Dodge', 'Lexus', 'Audi', 'Tesla', 'Acura', 'Cadillac', 'Other'
];
export const VEHICLE_COLORS = ['Black', 'White', 'Gray', 'Silver', 'Red', 'Blue', 'Brown', 'Green', 'Other'];

/** Vehicle size options for pricing (label + id). */
export const VEHICLE_SIZES: { id: VehicleSize; label: string; sublabel?: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'medium', label: 'Medium', sublabel: 'Small SUV/Truck' },
  { id: 'large', label: 'Large', sublabel: '3-Row/Large Truck' },
  { id: 'xl', label: 'XL', sublabel: 'Van/Lifted/Dualy' },
];

/** Services: Interior, Exterior, Full Detail. Price comes from PRICING_MATRIX by vehicle size. */
export const SERVICES: Service[] = [
  {
    id: 'interior-detail',
    name: 'Interior Detail',
    price: 175,
    duration: '2–3 hrs',
    description: 'Deep vacuum, steam clean, upholstery and surfaces.',
    icon: '🪑'
  },
  {
    id: 'exterior-detail',
    name: 'Exterior Detail',
    price: 125,
    duration: '1–1.5 hrs',
    description: 'Wash, wax, wheels and trim.',
    icon: '✨'
  },
  {
    id: 'full-detail',
    name: 'Full Detail',
    price: 250,
    duration: '3–4 hrs',
    description: 'Interior + exterior full detail.',
    icon: '💎'
  },
];

/** Pricing matrix: [serviceId][vehicleSize] = price (USD). */
export const PRICING_MATRIX: Record<string, Record<VehicleSize, number>> = {
  'interior-detail': { sedan: 175, medium: 215, large: 250, xl: 300 },
  'exterior-detail': { sedan: 125, medium: 150, large: 185, xl: 225 },
  'full-detail': { sedan: 250, medium: 285, large: 315, xl: 375 },
};

export function getServicePrice(serviceId: string, vehicleSize: VehicleSize): number {
  const row = PRICING_MATRIX[serviceId];
  if (!row) return 0;
  return row[vehicleSize] ?? 0;
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

export const MOCK_DETAILERS: Detailer[] = [
  {
    id: 'd1',
    name: 'Marcus K.',
    rating: 4.9,
    trips: 1240,
    car: 'Ford Transit - Fully Equipped',
    lat: 40.7128,
    lng: -74.0060,
    avatar: 'https://picsum.photos/seed/marcus/200/200',
    startingAddress: '123 Broadway, New York, NY 10001'
  },
  {
    id: 'd2',
    name: 'Sarah J.',
    rating: 4.8,
    trips: 890,
    car: 'Mercedes Sprinter - Premium Gear',
    lat: 40.7150,
    lng: -74.0100,
    avatar: 'https://picsum.photos/seed/sarah/200/200',
    startingAddress: '456 5th Avenue, New York, NY 10018'
  },
  {
    id: 'd3',
    name: 'Vince L.',
    rating: 5.0,
    trips: 320,
    car: 'Ram Promaster - Pro Series',
    lat: 40.7200,
    lng: -74.0020,
    avatar: 'https://picsum.photos/seed/vince/200/200',
    startingAddress: '789 Park Avenue, New York, NY 10021'
  }
];

export const MOCK_USER = {
  name: 'Alex Rivera',
  rating: 4.95,
  trips: 42,
  balance: 124.50
};
