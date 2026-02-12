/**
 * Fetch vehicle models from NHTSA vPIC API.
 * Free, no API key required.
 * @see https://vpic.nhtsa.dot.gov/api/
 */

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api';

export async function fetchVehicleModels(make: string, year: string): Promise<string[]> {
  const makeTrim = String(make || '').trim();
  const yearTrim = String(year || '').trim();
  if (!makeTrim || !yearTrim) return [];

  const url = `${NHTSA_BASE}/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(makeTrim)}/modelyear/${encodeURIComponent(yearTrim)}?format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data?.Results;
    if (!Array.isArray(results)) return [];
    const names = results
      .map((r: { Model_Name?: string }) => r?.Model_Name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
