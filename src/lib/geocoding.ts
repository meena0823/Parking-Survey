const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface NominatimSearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
}

export interface NominatimReverseResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function nominatimFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${NOMINATIM_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Location lookup failed');
  }

  return response.json() as Promise<T>;
}

export async function searchLocations(query: string): Promise<NominatimSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    limit: '5',
    addressdetails: '1',
  });

  return nominatimFetch<NominatimSearchResult[]>(`/search?${params.toString()}`);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
  });

  const data = await nominatimFetch<NominatimReverseResult>(`/reverse?${params.toString()}`);
  return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
