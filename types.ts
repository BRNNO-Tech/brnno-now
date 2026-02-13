
export enum BookingStatus {
  IDLE = 'IDLE',
  SELECTING = 'SELECTING',
  SEARCHING = 'SEARCHING',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  COMPLETED = 'COMPLETED'
}

export interface Detailer {
  id: string;
  name: string;
  rating: number;
  trips: number;
  car: string;
  lat: number;
  lng: number;
  avatar: string;
  startingAddress: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: string;
  description: string;
  icon: string;
}

export interface UserProfile {
  name: string;
  rating: number;
  trips: number;
  balance: number;
}

/** Vehicle size tier used for pricing (Sedan, Medium, Large, XL). */
export type VehicleSize = 'sedan' | 'medium' | 'large' | 'xl';

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  color?: string;
  /** Used for pricing; optional for backward compat with saved vehicles. */
  size?: VehicleSize;
}

export function vehicleDisplayString(vehicle: VehicleInfo | null | undefined): string {
  if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model) return '';
  const base = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return vehicle.color?.trim() ? `${base}, ${vehicle.color.trim()}` : base;
}

export interface PastBooking {
  id: string;
  serviceName: string;
  date: string;
  cost: number;
  status: 'Completed' | 'Cancelled' | 'In progress';
  detailerName: string;
  carName: string;
  location: string;
}
