"""
ParkSense — Automated Spatio-Temporal Parking Survey API
FastAPI application with image upload, CV processing, analytics, and DB viewer endpoints.
"""

import os
import uuid
import shutil
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from models import ManualEntry, ContextualTag
from cv_pipeline import process_image, get_pipeline_status
import database as db
import analytics

# ── Survey-app vehicle type mapping ──────────────────────────
# Maps ParkSense/YOLO class names to the SurveyFlow key set used in
# vehicle_captures.vehicle_type.
# The second block handles PR-only detections whose vehicle_class is already
# a survey key (e.g. "car", "two_wheeler") — identity pass-through.
_SURVEY_CLASS_MAP: dict[str, str] = {
    # YOLO / Indian-model class names
    "Motorcycle":    "two_wheeler",
    "Bike":          "two_wheeler",
    "Bicycle":       "two_wheeler",
    "Car":           "car",
    "Auto-Rickshaw": "auto",
    "Bus":           "bus",
    "Truck":         "truck",
    "LCV":           "lcv",
    # Plate Recognizer-only detections already carry survey keys
    "two_wheeler":   "two_wheeler",
    "car":           "car",
    "auto":          "auto",
    "bus":           "bus",
    "truck":         "truck",
    "lcv":           "lcv",
    "others":        "others",
}

# ── App setup ────────────────────────────────────────────────

app = FastAPI(
    title="ParkSense API",
    description="Automated Spatio-Temporal Parking Survey System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
async def startup():
    await db.connect_db()


@app.on_event("shutdown")
async def shutdown():
    await db.close_db()


# ── Health / Status ──────────────────────────────────────────

@app.get("/api/status")
async def status():
    return {
        "status": "online",
        "pipeline": get_pipeline_status(),
        "sessions_count": await db.get_session_count(),
    }


# ── Image Upload & Processing ────────────────────────────────

@app.post("/api/upload")
async def upload_images(
    files: list[UploadFile] = File(...),
    agent_id: str = Form("agent-001"),
    vantage_point: str = Form("Zone A - North Gate"),
    timestamp: str = Form(None),
    latitude: float = Form(28.6139),
    longitude: float = Form(77.2090),
):
    """
    Receive batch images from a field agent.
    Runs CV pipeline on each, stores RawScans, and upserts ParkingSessions.
    Tags all records with source='ML Detection'.
    """
    ts = datetime.fromisoformat(timestamp) if timestamp else datetime.utcnow()

    results = []
    total_vehicles = 0

    for file in files:
        ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
        fname = f"{uuid.uuid4().hex}{ext}"
        fpath = os.path.join(UPLOAD_DIR, fname)

        with open(fpath, "wb") as f:
            content = await file.read()
            f.write(content)

        detections = process_image(fpath)
        total_vehicles += len(detections)

        scan_doc = {
            "image_path": f"/uploads/{fname}",
            "agent_id": agent_id,
            "vantage_point": vantage_point,
            "timestamp": ts.isoformat(),
            "latitude": latitude,
            "longitude": longitude,
            "source": "ML Detection",
            "detections": detections,
        }
        scan_id = await db.insert_raw_scan(scan_doc)

        for det in detections:
            plate = det.get("license_plate")
            if plate and plate != "UNREADABLE":
                await db.upsert_parking_session(
                    license_plate=plate,
                    vehicle_class=det["vehicle_class"],
                    timestamp=ts,
                    lat=latitude,
                    lng=longitude,
                    vantage_point=vantage_point,
                    source="ML Detection",
                    enumerator_id=agent_id,
                )

        results.append({
            "scan_id": scan_id,
            "file": file.filename,
            "vehicles_detected": len(detections),
            "detections": detections,
        })

    return {
        "success": True,
        "files_processed": len(files),
        "total_vehicles_detected": total_vehicles,
        "timestamp": ts.isoformat(),
        "results": results,
    }


# ── Single-image detection for Enumerator Dashboard ─────────

@app.post("/api/detect")
async def detect_vehicles(
    file: UploadFile = File(...),
    enumerator_id: str = Form(""),
    slot_id: str = Form(""),
    project_id: str = Form(""),
    lat: float = Form(0.0),
    lng: float = Form(0.0),
    timestamp: str = Form(None),
):
    """
    Run the CV pipeline (YOLO + Plate Recognizer) on a single camera frame.

    Returns all detected vehicles with:
      - SurveyFlow vehicle_type key (YOLO primary, Plate Recognizer fallback)
      - Plate Recognizer enrichment: vehicle_number, make, model, color,
        plate_confidence, detailed_vehicle_type, orientation

    A single image may yield multiple detection objects (one per vehicle).
    Does NOT write to MongoDB — Supabase is the app database.
    """
    ts = datetime.fromisoformat(timestamp) if timestamp else datetime.utcnow()

    ext = os.path.splitext(file.filename or "frame.jpg")[1] or ".jpg"
    fname = f"detect_{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)

    try:
        with open(fpath, "wb") as f:
            f.write(await file.read())

        raw_detections = process_image(fpath)

        detections = []
        for det in raw_detections:
            survey_type = _SURVEY_CLASS_MAP.get(det["vehicle_class"], "others")
            plate = det.get("license_plate") or "UNREADABLE"
            # vehicle_number: prefer Plate Recognizer plate, fall back to OCR plate
            vehicle_number = det.get("vehicle_number") or (
                plate if plate != "UNREADABLE" else None
            )
            detections.append({
                "vehicle_type":           survey_type,
                "vehicle_class_raw":      det["vehicle_class"],
                "confidence":             det["confidence"],
                "license_plate":          plate,
                "bbox":                   det.get("bbox", []),
                # Plate Recognizer enrichment fields
                "vehicle_number":         vehicle_number,
                "vehicle_make":           det.get("vehicle_make"),
                "vehicle_model":          det.get("vehicle_model"),
                "vehicle_color":          det.get("vehicle_color"),
                "plate_confidence":       det.get("plate_confidence"),
                "detailed_vehicle_type":  det.get("detailed_vehicle_type"),
                "orientation":            det.get("orientation"),
            })

        dominant = "others"
        if detections:
            dominant = max(detections, key=lambda d: d["confidence"])["vehicle_type"]

        return {
            "success":          True,
            "detections":       detections,
            "total_detected":   len(detections),
            "dominant_vehicle": dominant,
            "processed_at":     ts.isoformat(),
            "enumerator_id":    enumerator_id,
            "slot_id":          slot_id,
        }

    finally:
        try:
            os.remove(fpath)
        except OSError:
            pass


# ── Manual Entry ─────────────────────────────────────────────

@app.post("/api/manual-entry")
async def manual_entry(entry: ManualEntry):
    """
    Enumerator manual vehicle entry.
    - Validates vehicle number plate (required, non-blank).
    - Performs slot-based duplicate detection: if the same plate is already
      recorded in the given time_slot_id (by any source — ML or Manual),
      returns HTTP 409 with a clear message. No duplicate count is added.
    - Saves with source='Manual Entry' and associates enumerator / slot context.
    - Updates unified dataset (parking_sessions) used by all dashboards.
    """
    plate = entry.license_plate  # already stripped/uppercased by validator

    # Slot-based duplicate check (across ML Detection AND Manual Entry)
    if entry.time_slot_id:
        existing = await db.check_slot_duplicate(plate, entry.time_slot_id)
        if existing:
            existing_source = existing.get("source", "ML Detection")
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Vehicle {plate} is already recorded in slot "
                    f"'{entry.time_slot_id}' (source: {existing_source}). "
                    f"Duplicate entry prevented."
                ),
            )

    # Save to parking_sessions (unified dataset)
    session = await db.upsert_parking_session(
        license_plate=plate,
        vehicle_class=entry.vehicle_class,
        timestamp=entry.timestamp,
        lat=entry.latitude,
        lng=entry.longitude,
        vantage_point=entry.vantage_point,
        source="Manual Entry",
        enumerator_id=entry.enumerator_id,
        slot_id=entry.time_slot_id,
        notes=entry.notes,
    )

    # Save raw scan record (enables detection history & slot-dup checks)
    scan_doc = {
        "image_path": None,
        "agent_id": entry.enumerator_id or "manual",
        "vantage_point": entry.vantage_point,
        "timestamp": entry.timestamp.isoformat(),
        "latitude": entry.latitude,
        "longitude": entry.longitude,
        "source": "Manual Entry",
        "enumerator_id": entry.enumerator_id,
        "survey_session_id": entry.survey_session_id,
        "time_slot_id": entry.time_slot_id,
        "location_id": entry.location_id,
        "notes": entry.notes,
        "detections": [{
            "vehicle_class": entry.vehicle_class,
            "confidence": 1.0,
            "license_plate": plate,
            "bbox": [],
        }],
    }
    scan_id = await db.insert_raw_scan(scan_doc)

    return {
        "success": True,
        "session": session,
        "scan_id": scan_id,
    }


# ── Duplicate Pre-check ──────────────────────────────────────

@app.get("/api/check-duplicate")
async def check_duplicate(plate: str, slot_id: str = ""):
    """
    Pre-check whether a vehicle plate is already recorded in a given slot.
    Used by the frontend to provide real-time duplicate warnings before submit.
    """
    if not slot_id or not plate:
        return {"duplicate": False}

    clean_plate = plate.strip().upper()
    existing = await db.check_slot_duplicate(clean_plate, slot_id)
    if existing:
        return {
            "duplicate": True,
            "plate": clean_plate,
            "slot_id": slot_id,
            "existing_source": existing.get("source", "Unknown"),
        }
    return {"duplicate": False, "plate": clean_plate, "slot_id": slot_id}


# ── Database Viewer ──────────────────────────────────────────

@app.get("/api/scans")
async def get_scans(limit: int = 100, skip: int = 0):
    scans = await db.get_raw_scans(limit=limit, skip=skip)
    return {"scans": scans, "count": len(scans)}


@app.get("/api/sessions")
async def get_sessions(limit: int = 100, skip: int = 0):
    sessions = await db.get_parking_sessions(limit=limit, skip=skip)
    return {"sessions": sessions, "count": len(sessions)}


# ── Vehicle Detection History ────────────────────────────────

@app.get("/api/vehicle-history")
async def get_vehicle_history(limit: int = 500):
    """
    Returns a flat, per-detection history list combining ML Detection and
    Manual Entry records. Used to populate the Detection History dashboard.
    Each record contains: timestamp, vehicle_type, license_plate, source.
    """
    history = await db.get_vehicle_history(limit=limit)
    return {"history": history, "count": len(history)}


# ── Analytics ────────────────────────────────────────────────

@app.get("/api/analytics")
async def get_analytics():
    data = await analytics.compute_analytics(db)
    return data


# ── Contextual Tags ─────────────────────────────────────────

@app.post("/api/tags")
async def add_tag(tag: ContextualTag):
    tag_id = await db.add_contextual_tag(tag.model_dump())
    return {"success": True, "tag_id": tag_id}


@app.get("/api/tags")
async def get_tags():
    tags = await db.get_contextual_tags()
    return {"tags": tags}


# ── Time-Lapse ───────────────────────────────────────────────

@app.get("/api/timelapse/{date}")
async def get_timelapse(date: str):
    """Return ordered images for a specific date to create a time-lapse."""
    scans = await db.get_raw_scans(limit=5000)
    day_scans = []
    for s in scans:
        try:
            scan_ts = s.get("timestamp", "")
            if isinstance(scan_ts, str) and scan_ts.startswith(date):
                day_scans.append(s)
        except Exception:
            continue

    day_scans.sort(key=lambda x: x.get("timestamp", ""))

    frames = []
    for s in day_scans:
        if s.get("image_path"):
            frames.append({
                "image_url": s["image_path"],
                "timestamp": s["timestamp"],
                "vantage_point": s.get("vantage_point", ""),
                "vehicle_count": len(s.get("detections", [])),
            })

    return {
        "date": date,
        "frame_count": len(frames),
        "frames": frames,
    }


# ── Utilities ────────────────────────────────────────────────

@app.post("/api/clear")
async def clear_database():
    """Clear all data from the database."""
    result = await db.clear_all_data()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@app.delete("/api/delete/{collection}/{item_id}")
async def delete_item(collection: str, item_id: str):
    """Delete a single item by ID from a specific collection."""
    success = await db.delete_item(collection, item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found or could not be deleted")
    return {"success": True, "deleted_id": item_id}
