/**
 * Typed client for the ParkSense FastAPI ML backend.
 * Calls /api/detect (single-frame detection) and /api/status.
 *
 * If VITE_ML_API_URL is not set or the server is unreachable,
 * all functions return null — callers fall back to manual mode.
 */

const ML_BASE = import.meta.env.VITE_ML_API_URL ?? '';

// ── Types ────────────────────────────────────────────────────

export interface MlDetection {
  /** Survey-app category: car | truck | bus | two_wheeler | auto | lcv | others */
  vehicle_type: string;
  /** Raw YOLO/ParkSense class: Car | Truck | Motorcycle | … */
  vehicle_class_raw: string;
  /** YOLO detection confidence (0–1) */
  confidence: number;
  /** Plate text — Plate Recognizer result, EasyOCR fallback, or "UNREADABLE" */
  license_plate: string;
  bbox: number[];             // [x, y, w, h]
  // ── Plate Recognizer enrichment ──────────────────────────
  /** Plate Recognizer plate text (uppercase) — preferred over license_plate */
  vehicle_number: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  /** 0–1 confidence from Plate Recognizer for the plate reading */
  plate_confidence: number | null;
  /** Raw Plate Recognizer type: Sedan, SUV, Hatchback, Pickup, Van, Motorcycle … */
  detailed_vehicle_type: string | null;
  /** Front | Rear | Unknown */
  orientation: string | null;
}

export interface MlDetectResponse {
  success: boolean;
  detections: MlDetection[];
  total_detected: number;
  dominant_vehicle: string;
  processed_at: string;
  enumerator_id: string;
  slot_id: string;
}

export interface MlPipelineStatus {
  yolo_available: boolean;
  ocr_available: boolean;
  plate_recognizer_enabled: boolean;
  mode: 'real' | 'unavailable' | 'plate_recognizer_only';
}

export interface MlStatusResponse {
  status: string;
  pipeline: MlPipelineStatus;
  sessions_count: number;
}

// ── Helpers ──────────────────────────────────────────────────

function makeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() =>
    window.clearTimeout(timer)
  );
}

// ── Public API ───────────────────────────────────────────────

/**
 * Check whether the ML backend is reachable and Plate Recognizer is enabled.
 * Returns null if the server is offline or VITE_ML_API_URL is not set.
 */
export async function getMlStatus(timeoutMs = 3000): Promise<MlStatusResponse | null> {
  if (!ML_BASE) return null;
  try {
    const res = await makeFetch(`${ML_BASE}/api/status`, {}, timeoutMs);
    if (!res.ok) return null;
    return res.json() as Promise<MlStatusResponse>;
  } catch {
    return null;
  }
}

/**
 * Send a captured JPEG blob to the ML backend and get vehicle detections.
 * Returns null on timeout, network error, or non-OK HTTP status — caller
 * must handle this as "ML offline" and fall back to manual counting.
 */
export async function detectVehicles(
  imageBlob: Blob,
  params: {
    enumeratorId: string;
    slotId: string;
    projectId: string;
    lat: number | null;
    lng: number | null;
  },
  timeoutMs = 8000
): Promise<MlDetectResponse | null> {
  if (!ML_BASE) return null;

  const form = new FormData();
  form.append('file', imageBlob, 'capture.jpg');
  form.append('enumerator_id', params.enumeratorId);
  form.append('slot_id', params.slotId);
  form.append('project_id', params.projectId);
  form.append('lat', String(params.lat ?? 0));
  form.append('lng', String(params.lng ?? 0));
  form.append('timestamp', new Date().toISOString());

  try {
    const res = await makeFetch(
      `${ML_BASE}/api/detect`,
      { method: 'POST', body: form },
      timeoutMs
    );
    if (!res.ok) return null;
    return res.json() as Promise<MlDetectResponse>;
  } catch {
    return null;
  }
}
