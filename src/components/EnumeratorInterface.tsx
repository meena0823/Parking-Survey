import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSlots, getCaptures, uploadImage, createCapture, upsertCount, getSlotCompletions, upsertSlotCompletion } from '../lib/database';
import { detectVehicles, getMlStatus, type MlDetection } from '../lib/mlApi';
import type { SlotCompletion, SurveyProject, SurveySlot, VehicleCapture } from '../lib/types';
import { VEHICLE_CATEGORIES } from '../lib/types';
import { getBreakStatus } from '../lib/slotWorkflow';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area,
} from 'recharts';
import {
  Camera, Clock, MapPin, Wifi, X, Loader2, Plus, BarChart3, ChevronDown, LogOut,
} from 'lucide-react';
// getCurrentSlot no longer needed — enumerator view is driven by the active slot only

interface Props { enumeratorId: string; project: SurveyProject; onLogout?: () => void; }

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 768px)').matches);
}

function DetectionChip({ det }: { det: MlDetection }) {
  const cat = VEHICLE_CATEGORIES.find(c => c.key === det.vehicle_type);
  const pct = Math.round(det.confidence * 100);
  // Prefer Plate Recognizer plate (vehicle_number) over raw OCR (license_plate)
  const displayPlate = det.vehicle_number ?? (det.license_plate !== 'UNREADABLE' ? det.license_plate : null);
  const prPct = det.plate_confidence !== null ? Math.round((det.plate_confidence ?? 0) * 100) : null;
  const hasMeta = det.vehicle_make || det.vehicle_model || det.vehicle_color;

  return (
    <div className="flex flex-col gap-1.5 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
      {/* Row 1: type dot + label + YOLO confidence */}
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat?.color ?? '#6B7280' }} />
        <span className="flex-1 text-sm font-medium text-slate-800">
          {cat?.label ?? det.vehicle_type}
          {det.detailed_vehicle_type && (
            <span className="ml-1 text-[11px] font-normal text-slate-400">({det.detailed_vehicle_type})</span>
          )}
        </span>
        <span className="text-xs font-mono text-slate-500">{pct}%</span>
      </div>

      {/* Row 2: plate number + PR confidence */}
      {displayPlate && (
        <div className="flex items-center gap-2 pl-5">
          <span className="text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono tracking-wider">
            {displayPlate}
          </span>
          {prPct !== null && (
            <span className="text-[10px] text-slate-400">{prPct}% plate conf.</span>
          )}
        </div>
      )}

      {/* Row 3: make / model / color from Plate Recognizer */}
      {hasMeta && (
        <div className="pl-5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          {det.vehicle_make  && <span><span className="font-medium text-slate-600">Make:</span> {det.vehicle_make}</span>}
          {det.vehicle_model && <span><span className="font-medium text-slate-600">Model:</span> {det.vehicle_model}</span>}
          {det.vehicle_color && <span><span className="font-medium text-slate-600">Color:</span> {det.vehicle_color}</span>}
        </div>
      )}
    </div>
  );
}

function DetectionOverlay({ detections, onDismiss }: { detections: MlDetection[]; onDismiss: () => void }) {
  const enrichedCount = detections.filter(d => d.vehicle_number || d.vehicle_make).length;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 w-full max-w-sm shadow-2xl pointer-events-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {detections.length} Vehicle{detections.length !== 1 ? 's' : ''} Detected
            </p>
            {enrichedCount > 0 && (
              <p className="text-[11px] text-violet-600 mt-0.5">
                {enrichedCount} enriched via Plate Recognizer
              </p>
            )}
          </div>
          <button onClick={onDismiss} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          {detections.map((det, i) => <DetectionChip key={i} det={det} />)}
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">Auto-closing in a few seconds…</p>
      </div>
    </div>
  );
}

function ManualAddSheet({
  onClose,
  onSubmit,
  submitting,
  slotCaptures,
}: {
  onClose: () => void;
  onSubmit: (vehicleType: string, vehicleNumber: string, notes: string) => void;
  submitting: boolean;
  slotCaptures: VehicleCapture[];
}) {
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [notes, setNotes] = useState('');

  const plate = vehicleNumber.trim().toUpperCase();

  // Slot-based duplicate detection — checks both ML and Manual captures
  const existingCapture = plate.length > 0
    ? slotCaptures.find(c => c.vehicle_number?.toUpperCase() === plate)
    : undefined;

  const existingSource = existingCapture
    ? (existingCapture.source ?? (existingCapture.image_url === null ? 'Manual Entry' : 'ML Detection'))
    : undefined;

  const isDuplicate = !!existingCapture;
  const canSubmit = vehicleType && plate.length >= 2 && !isDuplicate && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-semibold text-slate-900">Add Vehicle Manually</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-500">Use this if a vehicle was missed during camera capture.</p>

          {/* Vehicle Number Plate — Required */}
          <div>
            <label htmlFor="vehicle-number" className="block text-sm font-medium text-slate-700 mb-1.5">
              Vehicle Number Plate
              <span className="text-red-500 ml-1">*</span>
              <span className="text-xs font-normal text-slate-400 ml-1">Required</span>
            </label>
            <input
              id="vehicle-number"
              type="text"
              value={vehicleNumber}
              onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
              placeholder="e.g. KL49H6635"
              autoComplete="off"
              spellCheck={false}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 font-mono uppercase tracking-widest ${
                isDuplicate
                  ? 'border-amber-400 focus:ring-amber-400 bg-amber-50'
                  : plate.length > 0
                    ? 'border-emerald-400 focus:ring-emerald-500 focus:border-emerald-500'
                    : 'border-slate-200 focus:ring-emerald-500 focus:border-emerald-500'
              }`}
            />
            <p className="text-xs text-slate-400 mt-1">
              Mandatory · Stored exactly as entered · Cannot save without a number plate
            </p>
          </div>

          {/* Duplicate Warning */}
          {isDuplicate && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-3">
              <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Vehicle already recorded in this slot</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  <span className="font-mono font-bold">{plate}</span> was already counted via{' '}
                  <span className="font-medium">{existingSource}</span>.
                  Duplicate entry is blocked to prevent double-counting.
                </p>
              </div>
            </div>
          )}

          {/* Vehicle Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Vehicle Type</label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setVehicleType(cat.key)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                    vehicleType === cat.key
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm font-medium text-slate-800">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes — Optional */}
          <div>
            <label htmlFor="manual-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
              Notes
              <span className="text-xs font-normal text-slate-400 ml-1">(optional)</span>
            </label>
            <textarea
              id="manual-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional observations…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Source label */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            This entry will be saved as <span className="font-semibold text-slate-700 ml-1">Manual Entry</span>
            &nbsp;and counted in all dashboards and reports.
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit(vehicleType, plate, notes.trim())}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : isDuplicate ? 'Duplicate — Cannot Save' : !plate ? 'Enter Number Plate to Continue' : 'Save Manual Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EnumeratorInterface({ enumeratorId, project, onLogout }: Props) {
  const [slots, setSlots] = useState<SurveySlot[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [slotCompletions, setSlotCompletions] = useState<SlotCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSlotId, setViewSlotId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mlOnline, setMlOnline] = useState(false);
  const [isProcessingMl, setIsProcessingMl] = useState(false);
  const [lastDetections, setLastDetections] = useState<MlDetection[]>([]);
  const [showDetectionOverlay, setShowDetectionOverlay] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [finishSubmitting, setFinishSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // local project status — updated via Supabase Realtime when Team Head ends the survey
  const [projectStatus, setProjectStatus] = useState<SurveyProject['status']>(project.status);

  const activeSlot = slots.find(s => s.status === 'active') ?? null;
  // In manual lifecycle mode the "current" slot for the enumerator is the active slot only
  const currentSlot = activeSlot;
  const displaySlot = slots.find(s => s.id === viewSlotId) ?? activeSlot;
  const breakInfo = useMemo(() => getBreakStatus(project, slots), [project, slots]);
  const myCaptures = captures.filter(c => c.enumerator_id === enumeratorId);
  const slotCaptures = displaySlot
    ? myCaptures.filter(c => c.slot_id === displaySlot.id)
    : [];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, c, completions] = await Promise.all([getSlots(project.id), getCaptures(project.id), getSlotCompletions(project.id)]);
      setSlots(s);
      setCaptures(c.filter(cap => cap.enumerator_id === enumeratorId));
      setSlotCompletions(completions);
      const active = s.find((sl: SurveySlot) => sl.status === 'active');
      if (active) setViewSlotId(active.id);
      setLoading(false);
    }
    load();

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        pos => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); },
        () => {},
        { enableHighAccuracy: true }
      );
    }

    getMlStatus().then(status => {
      setMlOnline(
        status?.status === 'online' &&
        (status.pipeline.plate_recognizer_enabled === true ||
          status.pipeline.mode === 'plate_recognizer_only')
      );
    });

    const channel = supabase
      .channel(`enumerator-${project.id}-${enumeratorId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'survey_slots', filter: `project_id=eq.${project.id}` },
        payload => {
          setSlots(prev =>
            prev.map(s => s.id === payload.new.id ? { ...s, status: (payload.new as SurveySlot).status } : s)
          );
          const updated = payload.new as SurveySlot;
          if (updated.status === 'active') setViewSlotId(updated.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slot_completions', filter: `project_id=eq.${project.id}` },
        async () => setSlotCompletions(await getSlotCompletions(project.id))
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vehicle_captures', filter: `project_id=eq.${project.id}` },
        payload => {
          const cap = payload.new as VehicleCapture;
          if (cap.enumerator_id === enumeratorId) {
            setCaptures(prev => [...prev, cap]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'survey_projects', filter: `id=eq.${project.id}` },
        payload => {
          const updated = payload.new as SurveyProject;
          setProjectStatus(updated.status);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); stopCamera(); };
  }, [project.id, enumeratorId]);

  // Assign stream to <video> after it is mounted in the DOM
  useEffect(() => {
    if (showCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [showCamera]);

  useEffect(() => {
    if (!showDetectionOverlay) return;
    const timer = window.setTimeout(() => setShowDetectionOverlay(false), 4000);
    return () => window.clearTimeout(timer);
  }, [showDetectionOverlay]);

  const [timeRemaining, setTimeRemaining] = useState('');
  useEffect(() => {
    if (!currentSlot) { setTimeRemaining(''); return; }
    const interval = setInterval(() => {
      const now = new Date();
      const [endH, endM] = currentSlot.end_time.split(':').map(Number);
      const endDate = new Date();
      endDate.setHours(endH, endM, 0);
      const diff = endDate.getTime() - now.getTime();
      if (diff <= 0) setTimeRemaining('Completed');
      else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${mins}:${String(secs).padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSlot]);

  // Break countdown
  const [breakSecondsLeft, setBreakSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!breakInfo.isBreak || !breakInfo.breakEndsAt) { setBreakSecondsLeft(null); return; }
    const tick = () => setBreakSecondsLeft(Math.floor((breakInfo.breakEndsAt!.getTime() - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [breakInfo.isBreak, breakInfo.breakEndsAt?.getTime()]);

  const completionForCurrent = currentSlot
    ? slotCompletions.find(c => c.slot_id === currentSlot.id && c.enumerator_id === enumeratorId)
    : null;
  const hasFinishedCurrent = completionForCurrent?.status === 'completed';
  // Enumerator can signal "I'm done" whenever a slot is active (TH sees this in the dashboard)
  const canFinishSlot = !!activeSlot && !hasFinishedCurrent;

  const [finishError, setFinishError] = useState<string | null>(null);

  async function finishCurrentSlot() {
    if (!activeSlot || hasFinishedCurrent) return;
    setFinishSubmitting(true);
    setFinishError(null);
    try {
      console.log('[finishCurrentSlot] Marking slot done — slot:', activeSlot.id, 'enumerator:', enumeratorId);
      const result = await upsertSlotCompletion({
        project_id: project.id,
        slot_id: activeSlot.id,
        enumerator_id: enumeratorId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      if (!result) {
        // upsertSlotCompletion returned null → Supabase write failed (error logged inside)
        console.error('[finishCurrentSlot] DB write returned null. Check [upsertSlotCompletion] log above for Supabase error details.');
        setFinishError('Could not save. Check your connection or contact the Team Head.');
      } else {
        console.log('[finishCurrentSlot] Slot completion saved successfully:', result.id);
      }

      // Always refresh local state — even on failure it keeps the list consistent
      const completions = await getSlotCompletions(project.id);
      console.log('[finishCurrentSlot] Refreshed completions:', completions.length, 'records for project');
      setSlotCompletions(completions);
    } catch (err) {
      console.error('[finishCurrentSlot] Unexpected error:', err);
      setFinishError('Unexpected error. Please try again.');
    } finally {
      setFinishSubmitting(false);
    }
  }

  async function startCamera() {
    try {
      const facingMode = isMobileDevice() ? 'environment' : 'user';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setShowCamera(true);   // mount <video> first
      setCameraActive(true);
      // srcObject is assigned in the effect below, after <video> is in the DOM
    } catch (err) {
      console.error('Camera access denied:', err);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function flushCounts(allSlotCaptures: VehicleCapture[]) {
    if (!activeSlot) return;
    await upsertCount({
      project_id:    project.id,
      enumerator_id: enumeratorId,
      slot_id:       activeSlot.id,
      two_wheeler:   allSlotCaptures.filter(c => c.vehicle_type === 'two_wheeler').length,
      car:           allSlotCaptures.filter(c => c.vehicle_type === 'car').length,
      auto:          allSlotCaptures.filter(c => c.vehicle_type === 'auto').length,
      bus:           allSlotCaptures.filter(c => c.vehicle_type === 'bus').length,
      truck:         allSlotCaptures.filter(c => c.vehicle_type === 'truck').length,
      lcv:           allSlotCaptures.filter(c => c.vehicle_type === 'lcv').length,
      others:        allSlotCaptures.filter(c => c.vehicle_type === 'others').length,
      total:         allSlotCaptures.length,
    });
  }

  async function captureAndDetect() {
    if (!activeSlot || !videoRef.current || capturing) return;
    setCapturing(true);
    setLastDetections([]);

    try {
      const canvas = document.createElement('canvas');
      canvas.width  = videoRef.current.videoWidth  || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) return;

      setIsProcessingMl(true);
      const mlResult = await detectVehicles(blob, {
        enumeratorId,
        slotId:    activeSlot.id,
        projectId: project.id,
        lat: gpsLat,
        lng: gpsLng,
      });
      setIsProcessingMl(false);
      if (!mlResult && mlOnline) setMlOnline(false);

      const filePath = `${project.id}/${enumeratorId}/slot_${activeSlot.slot_number}/${Date.now()}.jpg`;
      const imageUrl = await uploadImage(filePath, blob);
      const now = new Date().toISOString();
      const newCaptures: VehicleCapture[] = [];

      if (mlResult && mlResult.detections.length > 0) {
        setLastDetections(mlResult.detections);
        setShowDetectionOverlay(true);

        for (const det of mlResult.detections) {
          // Prefer Plate Recognizer plate (vehicle_number) over raw OCR plate
          const plate = det.vehicle_number
            ?? (det.license_plate !== 'UNREADABLE' ? det.license_plate : null);

          // Core fields — always available regardless of migration state
          const captureBase = {
            project_id:      project.id,
            enumerator_id:   enumeratorId,
            slot_id:         activeSlot.id,
            image_url:       imageUrl,
            thumbnail_url:   imageUrl,
            timestamp:       now,
            gps_lat:         gpsLat,
            gps_lng:         gpsLng,
            vehicle_type:    det.vehicle_type,   // already survey-mapped by backend
            vehicle_number:  plate,
            ai_count_result: 1,
            ai_confidence:   det.confidence,
            manual_count:    1,
            is_verified:     true,
            source:          'ML Detection',
          };

          // Attempt 1: full insert including PR enrichment columns (migration 009)
          let capture = await createCapture({
            ...captureBase,
            vehicle_make:          det.vehicle_make          ?? null,
            vehicle_model:         det.vehicle_model         ?? null,
            vehicle_color:         det.vehicle_color         ?? null,
            plate_confidence:      det.plate_confidence      ?? null,
            detailed_vehicle_type: det.detailed_vehicle_type ?? null,
          });

          // Attempt 2: if migration 009 columns don't exist yet, fall back to core fields
          // so the count pipeline is never blocked by a pending migration
          if (!capture) {
            console.warn(
              '[captureAndDetect] Full insert failed (migration 009 columns may be missing); ' +
              'retrying without PR enrichment fields for vehicle_type=%s plate=%s',
              det.vehicle_type, plate
            );
            capture = await createCapture(captureBase);
          }

          if (capture) newCaptures.push(capture);
        }
      } else {
        const capture = await createCapture({
          project_id:      project.id,
          enumerator_id:   enumeratorId,
          slot_id:         activeSlot.id,
          image_url:       imageUrl,
          thumbnail_url:   imageUrl,
          timestamp:       now,
          gps_lat:         gpsLat,
          gps_lng:         gpsLng,
          vehicle_type:    'others',
          vehicle_number:  null,
          ai_count_result: null,
          ai_confidence:   null,
          manual_count:    1,
          is_verified:     false,
          source:          'ML Detection',
        });
        if (capture) newCaptures.push(capture);
      }

      if (newCaptures.length > 0) {
        const allCaptures  = [...captures, ...newCaptures];
        const activeSlotCaps = allCaptures.filter(c => c.slot_id === activeSlot.id);
        setCaptures(allCaptures);
        await flushCounts(activeSlotCaps);
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      setCapturing(false);
      setIsProcessingMl(false);
    }
  }

  async function manualAddVehicle(vehicleType: string, vehicleNumber: string, notes: string) {
    if (!activeSlot) return;
    setManualSubmitting(true);
    try {
      const plate = vehicleNumber.trim().toUpperCase() || null;

      // Final server-side duplicate guard (belt-and-suspenders beyond UI check)
      const currentSlotCaptures = captures.filter(c => c.slot_id === activeSlot.id);
      if (plate && currentSlotCaptures.some(c => c.vehicle_number?.toUpperCase() === plate)) {
        // Already caught by UI — just close and bail without saving
        setShowManualAdd(false);
        return;
      }

      const capture = await createCapture({
        project_id:      project.id,
        enumerator_id:   enumeratorId,
        slot_id:         activeSlot.id,
        image_url:       null,
        thumbnail_url:   null,
        timestamp:       new Date().toISOString(),
        gps_lat:         gpsLat,
        gps_lng:         gpsLng,
        vehicle_type:    vehicleType,
        vehicle_number:  plate,
        ai_count_result: null,
        ai_confidence:   null,
        manual_count:    1,
        is_verified:     false,
        source:          'Manual Entry',
        notes:           notes || null,
      });
      if (capture) {
        const allCaptures    = [...captures, capture];
        const activeSlotCaps = allCaptures.filter(c => c.slot_id === activeSlot.id);
        setCaptures(allCaptures);
        await flushCounts(activeSlotCaps);
        setShowManualAdd(false);
      }
    } finally {
      setManualSubmitting(false);
    }
  }

  const vehicleTypeData = VEHICLE_CATEGORIES.map(cat => ({
    name:  cat.label,
    count: slotCaptures.filter(c => c.vehicle_type === cat.key).length,
    color: cat.color,
  }));

  const slotProgressData = slots.map(s => ({
    name:  `S${s.slot_number}`,
    count: myCaptures.filter(c => c.slot_id === s.id).length,
    active: s.status === 'active',
  }));

  const totalSlotCaptures = slotCaptures.length;
  const vehicleSummary = VEHICLE_CATEGORIES.map(cat => ({
    ...cat,
    count: slotCaptures.filter(c => c.vehicle_type === cat.key).length,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {showDetectionOverlay && lastDetections.length > 0 && (
        <DetectionOverlay detections={lastDetections} onDismiss={() => setShowDetectionOverlay(false)} />
      )}
      {showManualAdd && (
        <ManualAddSheet
          onClose={() => setShowManualAdd(false)}
          onSubmit={manualAddVehicle}
          submitting={manualSubmitting}
          slotCaptures={activeSlot ? captures.filter(c => c.slot_id === activeSlot.id) : []}
        />
      )}

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 text-lg mb-1">Log out?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Your survey data and vehicle counts are saved. You can rejoin using your mobile number.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); onLogout?.(); }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Survey ended overlay — shown when Team Head ends the survey */}
      {projectStatus === 'cancelled' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-sm text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Survey Ended</h3>
            <p className="text-sm text-slate-500 mb-6">
              The survey has been ended by the Team Head. No further captures are allowed. Thank you for your participation.
            </p>
            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors"
              >
                Exit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{project.project_name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {gpsLat ? `${gpsLat.toFixed(4)}, ${gpsLng?.toFixed(4)}` : 'GPS…'}
              </span>
              <span className="flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-500" /> Online
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${mlOnline ? 'bg-violet-500' : 'bg-slate-300'}`} />
                {mlOnline ? 'ML Active' : 'ML Offline'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentSlot && (
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-600">Slot {currentSlot.slot_number}</p>
                <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono font-bold text-slate-800">{timeRemaining || '—'}</span>
                </p>
              </div>
            )}
            {onLogout && (
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Camera section — collapsible on mobile */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => { if (!showCamera) startCamera(); else setShowCamera(v => !v); }}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <span className="font-semibold text-slate-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-600" /> Camera Capture
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showCamera ? 'rotate-180' : ''}`} />
          </button>

          {showCamera && (
            <div className="relative bg-black border-t border-slate-100">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-[4/3] object-cover"
              />
              {isProcessingMl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                  <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                  <p className="text-xs text-slate-300 mt-2">Detecting vehicles…</p>
                </div>
              )}
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 rounded-xl font-medium text-white hover:bg-emerald-700 transition-colors text-sm"
                  >
                    <Camera className="w-4 h-4" />
                    Open {isMobileDevice() ? 'Back' : 'Front'} Camera
                  </button>
                </div>
              )}
              {cameraActive && activeSlot && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <button
                    onClick={captureAndDetect}
                    disabled={capturing || !activeSlot}
                    className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                    aria-label="Capture"
                  >
                    <div className={`w-10 h-10 rounded-full border-4 ${capturing ? 'border-slate-400' : 'border-slate-800'}`} />
                  </button>
                </div>
              )}
              {cameraActive && !activeSlot && (
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <p className="text-xs text-white/80 bg-black/50 inline-block px-3 py-1 rounded-full">
                    {breakInfo.isBreak ? '⏳ Break period — captures disabled' : 'Waiting for Team Head to start the next slot'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Break period / no active slot banner */}
        {projectStatus === 'active' && !activeSlot && (
          breakInfo.isBreak ? (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-500 text-xl">⏳</span>
                <div>
                  <p className="text-sm font-bold text-amber-900">Survey Break Period</p>
                  <p className="text-xs text-amber-700">Waiting for next slot to begin.</p>
                </div>
              </div>
              <div className="bg-amber-100 rounded-lg px-3 py-2 space-y-1">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Captures Disabled · Manual Entry Disabled</p>
                {breakInfo.nextPendingSlot && (
                  <p className="text-xs text-amber-700">
                    Next slot: <span className="font-semibold">Slot {breakInfo.nextPendingSlot.slot_number}</span>
                    {' — '}{breakInfo.nextPendingSlot.start_time.slice(0, 5)} to {breakInfo.nextPendingSlot.end_time.slice(0, 5)}
                  </p>
                )}
                {breakSecondsLeft !== null && (
                  <p className="text-xs text-amber-700">
                    Starts in:{' '}
                    <span className={`font-bold font-mono ${breakSecondsLeft < 0 ? 'text-red-600' : ''}`}>
                      {breakSecondsLeft >= 0
                        ? (() => {
                            const m = Math.floor(breakSecondsLeft / 60);
                            const s = breakSecondsLeft % 60;
                            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                          })()
                        : 'Starting soon…'
                      }
                    </span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-amber-800">No Active Slot</p>
              <p className="text-xs text-amber-700 mt-1">
                Waiting for Team Head to start the next slot. Camera and manual entry are disabled.
              </p>
            </div>
          )
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-0.5">Current Slot</p>
            <p className="text-lg font-bold text-emerald-600">{currentSlot ? `Slot ${currentSlot.slot_number}` : 'None'}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-0.5">My Captures</p>
            <p className="text-lg font-bold text-slate-900">{myCaptures.length}</p>
          </div>
        </div>

        {/* Time slots — team head style, green for active */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" /> Time Slots
            </h3>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {slots.map(s => {
                const isActive = s.status === 'active';
                const isViewing = displaySlot?.id === s.id;
                const count = myCaptures.filter(c => c.slot_id === s.id).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setViewSlotId(s.id)}
                    className={`rounded-lg p-2 text-center border transition-all ${
                      isActive
                        ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-400'
                        : s.status === 'cancelled'
                          ? 'border-red-200 bg-red-50'
                          : isViewing
                            ? 'border-blue-300 bg-blue-50'
                            : s.status === 'completed'
                              ? 'border-slate-300 bg-slate-50'
                              : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-700">S{s.slot_number}</p>
                    <p className="text-[10px] text-slate-500">{s.start_time}</p>
                    <p className="text-[10px] font-bold text-slate-700 mt-0.5">{count}</p>
                    <div className={`mt-1 w-2 h-2 rounded-full mx-auto ${
                      isActive
                        ? 'bg-emerald-500 animate-pulse'
                        : s.status === 'cancelled'
                          ? 'bg-red-400'
                          : s.status === 'completed'
                            ? 'bg-slate-400'
                            : 'bg-slate-200'
                    }`} />
                  </button>
                );
              })}
            </div>
            {displaySlot && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                Viewing Slot {displaySlot.slot_number} · {displaySlot.start_time.slice(0,5)}–{displaySlot.end_time.slice(0,5)}
                {displaySlot.status === 'active' && (
                  <span className="ml-1 text-emerald-600 font-medium">· Currently active</span>
                )}
                {displaySlot.status === 'cancelled' && (
                  <span className="ml-1 text-red-500 font-medium">· Cancelled</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Vehicle counts — bar chart like team head LiveMonitoring */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4" /> Vehicle Type Distribution
            {displaySlot && <span className="text-slate-400 font-normal">· Slot {displaySlot.slot_number}</span>}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vehicleTypeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {vehicleTypeData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Captures per slot — area chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3 text-sm">Captures per Slot</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={slotProgressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Progress bars — team head ProjectDetail style */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Vehicle Counts</h3>
          </div>
          <div className="p-4 space-y-3">
            {vehicleSummary.map(v => (
              <div key={v.key} className="flex items-center gap-3">
                <div className="w-16 sm:w-20 text-xs sm:text-sm font-medium text-slate-700 truncate">{v.label}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${totalSlotCaptures > 0 ? (v.count / totalSlotCaptures) * 100 : 0}%`,
                      backgroundColor: v.color,
                      minWidth: v.count > 0 ? '6px' : '0',
                    }}
                  />
                </div>
                <div className="w-8 text-right text-sm font-bold text-slate-900">{v.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent captures for selected slot */}
        {slotCaptures.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm">Detection History</h3>
              <span className="text-xs text-slate-400">{slotCaptures.length} records</span>
            </div>
            {/* Column headers */}
            <div className="px-4 py-1.5 grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-50">
              <span>Type &amp; Plate</span>
              <span>Source</span>
              <span>Time</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
              {[...slotCaptures].reverse().slice(0, 20).map(cap => {
                const cat = VEHICLE_CATEGORIES.find(c => c.key === cap.vehicle_type);
                // Derive source: prefer explicit field, fall back to inference
                const isManual = cap.source === 'Manual Entry'
                  || (!cap.source && cap.image_url === null && cap.ai_confidence === null);
                const capTime = new Date(cap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={cap.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat?.color ?? '#6B7280' }} />
                      <div className="min-w-0">
                        <span className="text-sm text-slate-800 block truncate">{cat?.label ?? cap.vehicle_type}</span>
                        {cap.vehicle_number && (
                          <span className="text-[11px] font-mono text-slate-500">{cap.vehicle_number}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                      isManual
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-violet-50 text-violet-700'
                    }`}>
                      {isManual ? '✏️ Manual' : '🤖 ML'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">{capTime}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canFinishSlot && activeSlot && (
          <div className={`bg-white rounded-xl border p-4 ${finishError ? 'border-red-300' : 'border-emerald-200'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Slot {activeSlot.slot_number} — Mark as Done</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Let the Team Head know you have finished your captures for this slot.
                </p>
                {finishError && (
                  <p className="text-xs text-red-600 mt-1 font-medium">⚠ {finishError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={finishCurrentSlot}
                disabled={finishSubmitting}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {finishSubmitting ? 'Saving…' : '✓ Mark Done'}
              </button>
            </div>
          </div>
        )}

        {hasFinishedCurrent && activeSlot && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-sm font-medium text-emerald-800">✓ You marked Slot {activeSlot.slot_number} as done</p>
            <p className="text-xs text-emerald-700 mt-0.5">Waiting for Team Head to complete this slot.</p>
          </div>
        )}
      </div>

      {/* Fixed bottom action — manual add */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 z-40">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setShowManualAdd(true)}
            disabled={!activeSlot}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-5 h-5" />
            Add Vehicle Manually
          </button>
          {!activeSlot && (
            <p className="text-xs text-slate-500 text-center mt-1.5">Manual entry available when a slot is active</p>
          )}
        </div>
      </div>
    </div>
  );
}
