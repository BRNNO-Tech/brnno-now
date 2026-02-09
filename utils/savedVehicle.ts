import type { VehicleInfo } from '../types';
import { inferVehicleSize } from './vehicleSize';

export const SAVED_VEHICLE_KEY = 'brnno_saved_vehicle';

export function loadSavedVehicle(): VehicleInfo | null {
  try {
    const raw = localStorage.getItem(SAVED_VEHICLE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as VehicleInfo;
    return v?.year && v?.make && v?.model ? v : null;
  } catch {
    return null;
  }
}

export function saveSavedVehicle(vehicle: VehicleInfo): void {
  const size = inferVehicleSize(vehicle.make, vehicle.model);
  const toSave: VehicleInfo = { ...vehicle, size };
  localStorage.setItem(SAVED_VEHICLE_KEY, JSON.stringify(toSave));
}

export function clearSavedVehicle(): void {
  localStorage.removeItem(SAVED_VEHICLE_KEY);
}
