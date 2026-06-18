import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import {
  formatCoordinates,
  reverseGeocode,
  searchLocations,
  type NominatimSearchResult,
} from '../lib/geocoding';

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
const SELECTED_ZOOM = 16;

interface LocationPickerProps {
  locationName: string;
  latitude: string;
  longitude: string;
  onLocationNameChange: (value: string) => void;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
  readOnly?: boolean;
}

function MapRecenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);

  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export default function LocationPicker({
  locationName,
  latitude,
  longitude,
  onLocationNameChange,
  onLatitudeChange,
  onLongitudeChange,
  readOnly = false,
}: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const parsedPosition = useMemo((): [number, number] | null => {
    if (!latitude || !longitude) return null;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng];
  }, [latitude, longitude]);

  const mapCenter = parsedPosition ?? DEFAULT_CENTER;
  const mapZoom = parsedPosition ? SELECTED_ZOOM : DEFAULT_ZOOM;

  const applyCoordinates = useCallback(
    async (lat: number, lng: number, name?: string) => {
      onLatitudeChange(String(lat));
      onLongitudeChange(String(lng));

      if (name) {
        onLocationNameChange(name);
        return;
      }

      setIsReverseGeocoding(true);
      try {
        const resolvedName = await reverseGeocode(lat, lng);
        onLocationNameChange(resolvedName);
      } catch {
        onLocationNameChange(formatCoordinates(lat, lng));
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    [onLatitudeChange, onLongitudeChange, onLocationNameChange]
  );

  const handleSelectSuggestion = useCallback(
    async (result: NominatimSearchResult) => {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      setSearchQuery(result.display_name);
      setSuggestions([]);
      setShowSuggestions(false);
      await applyCoordinates(lat, lng, result.display_name);
    },
    [applyCoordinates]
  );

  const handleMapInteraction = useCallback(
    (lat: number, lng: number) => {
      if (readOnly) return;
      void applyCoordinates(lat, lng);
    },
    [applyCoordinates, readOnly]
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported on this device.');
      return;
    }

    setGeoError(null);
    setIsGeolocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void applyCoordinates(position.coords.latitude, position.coords.longitude).finally(() => {
          setIsGeolocating(false);
        });
      },
      (error) => {
        setIsGeolocating(false);
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied. Please allow access or search manually.'
            : 'Unable to get your current location.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [applyCoordinates]);

  useEffect(() => {
    if (readOnly || searchQuery.trim().length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = window.setTimeout(() => {
      void searchLocations(searchQuery)
        .then((results) => {
          setSuggestions(results);
          setShowSuggestions(true);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setIsSearching(false));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchQuery, readOnly]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div ref={searchContainerRef} className="relative flex-1">
            <label className="block text-sm font-medium text-slate-200 mb-2">
              <Search size={16} className="inline mr-2" />
              Search Location
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Search for a place, address, or landmark"
                autoComplete="off"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-[1000] mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                {suggestions.map((result) => (
                  <li key={result.place_id}>
                    <button
                      type="button"
                      onClick={() => void handleSelectSuggestion(result)}
                      className="w-full px-4 py-3 text-left text-sm text-slate-800 hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="line-clamp-2">{result.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sm:pt-7">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isGeolocating}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGeolocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              Use Current Location
            </button>
          </div>
        </div>
      )}

      {(geoError || isReverseGeocoding) && !readOnly && (
        <div className="space-y-2">
          {geoError && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {geoError}
            </p>
          )}
          {isReverseGeocoding && (
            <p className="text-sm text-slate-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Resolving address...
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-200 mb-2">
          <MapPin size={16} className="inline mr-2" />
          {readOnly ? 'Selected Location' : 'Pick Location on Map'}
        </label>
        <div className="rounded-lg overflow-hidden border border-slate-600 shadow-inner h-64 sm:h-80">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom={!readOnly}
            className="h-full w-full"
            style={{ minHeight: '16rem' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapRecenter center={mapCenter} zoom={mapZoom} />
            {!readOnly && <MapClickHandler onMapClick={handleMapInteraction} />}
            {parsedPosition && (
              <Marker
                position={parsedPosition}
                draggable={!readOnly}
                eventHandlers={
                  readOnly
                    ? undefined
                    : {
                        dragend: (event) => {
                          const marker = event.target as L.Marker;
                          const { lat, lng } = marker.getLatLng();
                          void applyCoordinates(lat, lng);
                        },
                      }
                }
              />
            )}
          </MapContainer>
        </div>
        {!readOnly && (
          <p className="mt-2 text-xs text-slate-400">
            Click on the map or drag the marker to fine-tune the survey location.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-700/70 border border-slate-600 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Location Name</p>
          <p className="text-sm text-white break-words">
            {locationName.trim() || 'Not selected'}
          </p>
        </div>
        <div className="rounded-lg bg-slate-700/70 border border-slate-600 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Latitude</p>
          <p className="text-sm text-white font-mono">
            {latitude || '—'}
          </p>
        </div>
        <div className="rounded-lg bg-slate-700/70 border border-slate-600 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Longitude</p>
          <p className="text-sm text-white font-mono">
            {longitude || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
