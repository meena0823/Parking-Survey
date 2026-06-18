"""
MongoDB connection, atomic upserts, and time-window deduplication.
Uses Motor (async driver) for non-blocking DB operations.
Falls back to an in-memory store when MongoDB is unavailable.
"""

import os
import asyncio
from datetime import datetime, timedelta
from typing import Optional
from bson import ObjectId

# ── Try to import Motor; fall back to in-memory ─────────────
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    HAS_MOTOR = True
except ImportError:
    HAS_MOTOR = False

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "parking_survey")
DEDUP_WINDOW_MINUTES = 5

# ── In-memory fallback store ────────────────────────────────
_memory_store: dict[str, list[dict]] = {
    "raw_scans": [],
    "parking_sessions": [],
    "contextual_tags": [],
}
_memory_lock = asyncio.Lock()

# ── Global DB handle ────────────────────────────────────────
_client = None
_db = None
_use_memory = False


async def connect_db():
    """Initialise connection — tries Mongo first, then falls back."""
    global _client, _db, _use_memory
    if not HAS_MOTOR:
        print("⚠  Motor not installed — using in-memory store")
        _use_memory = True
        return

    try:
        _client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=2000)
        await _client.server_info()  # will throw if unreachable
        _db = _client[DB_NAME]
        # Core indexes
        await _db.parking_sessions.create_index("license_plate", unique=True)
        await _db.parking_sessions.create_index("last_seen")
        await _db.raw_scans.create_index("timestamp")
        # Slot-based duplicate detection index
        await _db.raw_scans.create_index([("time_slot_id", 1), ("detections.license_plate", 1)])
        await _db.raw_scans.create_index("source")
        print(f"✓  Connected to MongoDB: {MONGO_URL}/{DB_NAME}")
    except Exception as e:
        print(f"⚠  MongoDB unavailable ({e}) — using in-memory store")
        _use_memory = True


async def close_db():
    global _client
    if _client:
        _client.close()


# ── Raw Scans ────────────────────────────────────────────────

async def insert_raw_scan(doc: dict) -> str:
    """Insert a raw scan document."""
    doc.setdefault("created_at", datetime.utcnow())
    doc.setdefault("source", "ML Detection")
    if _use_memory:
        async with _memory_lock:
            doc["_id"] = f"mem_{len(_memory_store['raw_scans'])}"
            _memory_store["raw_scans"].append(doc)
            return doc["_id"]
    result = await _db.raw_scans.insert_one(doc)
    return str(result.inserted_id)


async def get_raw_scans(limit: int = 100, skip: int = 0) -> list[dict]:
    if _use_memory:
        items = _memory_store["raw_scans"][:]
        items.reverse()
        return items[skip: skip + limit]
    cursor = _db.raw_scans.find().sort("timestamp", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


# ── Slot-based Duplicate Detection ──────────────────────────

async def check_slot_duplicate(license_plate: str, slot_id: str) -> Optional[dict]:
    """
    Check if a vehicle with the given plate is already recorded in the given
    time slot. Searches both ML detections and manual entries (unified check).
    Returns the matching scan document, or None if no duplicate found.
    """
    if not slot_id or not license_plate:
        return None

    if _use_memory:
        async with _memory_lock:
            for scan in _memory_store["raw_scans"]:
                if scan.get("time_slot_id") == slot_id:
                    for det in scan.get("detections", []):
                        if det.get("license_plate") == license_plate:
                            return scan
        return None

    # MongoDB: find any scan in this slot with this plate
    result = await _db.raw_scans.find_one({
        "time_slot_id": slot_id,
        "detections.license_plate": license_plate,
    })
    if result:
        result["_id"] = str(result["_id"])
    return result


# ── Parking Sessions — Atomic Upsert with Dedup ─────────────

async def upsert_parking_session(
    license_plate: str,
    vehicle_class: str,
    timestamp: datetime,
    lat: float,
    lng: float,
    vantage_point: str,
    source: str = "ML Detection",
    enumerator_id: str = "",
    slot_id: str = "",
    notes: Optional[str] = None,
) -> dict:
    """
    Atomic upsert with 5-minute deduplication window.
    If the same plate was seen within DEDUP_WINDOW_MINUTES, we merge
    (update location, bump count).  Otherwise, create a new session.
    Source, enumerator_id, slot_id and notes are stored on first insert.
    """
    location_entry = {
        "lat": lat,
        "lng": lng,
        "vantage_point": vantage_point,
        "seen_at": timestamp.isoformat(),
        "source": source,
    }

    if _use_memory:
        async with _memory_lock:
            existing = None
            for s in _memory_store["parking_sessions"]:
                if s["license_plate"] == license_plate:
                    last = datetime.fromisoformat(s["last_seen"]) if isinstance(s["last_seen"], str) else s["last_seen"]
                    if abs((timestamp - last).total_seconds()) <= DEDUP_WINDOW_MINUTES * 60:
                        existing = s
                        break

            if existing:
                existing["last_seen"] = timestamp.isoformat()
                existing["detection_count"] = existing.get("detection_count", 1) + 1
                existing["locations"].append(location_entry)
                return existing
            else:
                # Check if plate already exists (outside time window) — unique plate constraint
                for s in _memory_store["parking_sessions"]:
                    if s["license_plate"] == license_plate:
                        s["last_seen"] = timestamp.isoformat()
                        s["detection_count"] = s.get("detection_count", 1) + 1
                        s["locations"].append(location_entry)
                        return s

                new_doc = {
                    "_id": f"mem_{len(_memory_store['parking_sessions'])}",
                    "license_plate": license_plate,
                    "vehicle_class": vehicle_class,
                    "first_seen": timestamp.isoformat(),
                    "last_seen": timestamp.isoformat(),
                    "locations": [location_entry],
                    "detection_count": 1,
                    "tags": [],
                    "source": source,
                    "enumerator_id": enumerator_id,
                    "slot_id": slot_id,
                    "notes": notes,
                }
                _memory_store["parking_sessions"].append(new_doc)
                return new_doc

    # ── MongoDB atomic upsert ───────────────────────────────
    window_start = timestamp - timedelta(minutes=DEDUP_WINDOW_MINUTES)

    result = await _db.parking_sessions.find_one_and_update(
        {
            "license_plate": license_plate,
            "last_seen": {"$gte": window_start},
        },
        {
            "$set": {"last_seen": timestamp, "vehicle_class": vehicle_class},
            "$inc": {"detection_count": 1},
            "$push": {"locations": location_entry},
        },
        return_document=True,
    )

    if result:
        result["_id"] = str(result["_id"])
        return result

    # No recent session — insert new
    new_doc = {
        "license_plate": license_plate,
        "vehicle_class": vehicle_class,
        "first_seen": timestamp,
        "last_seen": timestamp,
        "locations": [location_entry],
        "detection_count": 1,
        "tags": [],
        "source": source,
        "enumerator_id": enumerator_id,
        "slot_id": slot_id,
        "notes": notes,
    }
    try:
        ins = await _db.parking_sessions.insert_one(new_doc)
        new_doc["_id"] = str(ins.inserted_id)
    except Exception:
        # Concurrent insert race or unique constraint (plate already exists outside window)
        result = await _db.parking_sessions.find_one_and_update(
            {"license_plate": license_plate},
            {
                "$set": {"last_seen": timestamp},
                "$inc": {"detection_count": 1},
                "$push": {"locations": location_entry},
            },
            return_document=True,
        )
        if result:
            result["_id"] = str(result["_id"])
            return result
    return new_doc


async def get_parking_sessions(limit: int = 100, skip: int = 0) -> list[dict]:
    if _use_memory:
        items = _memory_store["parking_sessions"][:]
        items.reverse()
        return items[skip: skip + limit]
    cursor = _db.parking_sessions.find().sort("last_seen", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs:
        d["_id"] = str(d["_id"])
        for key in ("first_seen", "last_seen"):
            if isinstance(d.get(key), datetime):
                d[key] = d[key].isoformat()
    return docs


async def get_session_count() -> int:
    if _use_memory:
        return len(_memory_store["parking_sessions"])
    return await _db.parking_sessions.count_documents({})


# ── Vehicle Detection History (flattened) ───────────────────

async def get_vehicle_history(limit: int = 500) -> list[dict]:
    """
    Return a flattened, per-detection history list from raw_scans.
    Includes both ML Detection and Manual Entry records.
    Skips UNREADABLE plates.
    """
    scans = await get_raw_scans(limit=limit)
    history: list[dict] = []

    for scan in scans:
        # Infer source for legacy records that lack the field
        source = scan.get("source")
        if not source:
            source = "Manual Entry" if scan.get("agent_id") == "admin-manual" else "ML Detection"

        ts = scan.get("timestamp", "")
        enumerator_id = scan.get("enumerator_id") or scan.get("agent_id", "")
        slot_id = scan.get("time_slot_id", "")

        for det in scan.get("detections", []):
            plate = det.get("license_plate") or ""
            if not plate or plate.upper() == "UNREADABLE":
                continue
            history.append({
                "timestamp": ts,
                "vehicle_type": det.get("vehicle_class", "Unknown"),
                "license_plate": plate,
                "source": source,
                "enumerator_id": enumerator_id,
                "slot_id": slot_id,
                "scan_id": scan.get("_id", ""),
            })

    # Already sorted newest-first by get_raw_scans; trim to limit
    return history[:limit]


# ── Contextual Tags ─────────────────────────────────────────

async def add_contextual_tag(tag: dict) -> str:
    tag.setdefault("created_at", datetime.utcnow().isoformat())
    if _use_memory:
        async with _memory_lock:
            tag["_id"] = f"tag_{len(_memory_store['contextual_tags'])}"
            _memory_store["contextual_tags"].append(tag)
            return tag["_id"]
    result = await _db.contextual_tags.insert_one(tag)
    return str(result.inserted_id)


async def get_contextual_tags() -> list[dict]:
    if _use_memory:
        return _memory_store["contextual_tags"][:]
    cursor = _db.contextual_tags.find().sort("date", -1)
    docs = await cursor.to_list(length=200)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


# ── Utility ──────────────────────────────────────────────────

async def clear_all_data() -> dict:
    """Clear all data from the database (scans, sessions, tags)."""
    if _use_memory:
        async with _memory_lock:
            _memory_store["raw_scans"].clear()
            _memory_store["parking_sessions"].clear()
            _memory_store["contextual_tags"].clear()
            return {"success": True, "message": "In-memory store cleared"}

    try:
        await _db.raw_scans.delete_many({})
        await _db.parking_sessions.delete_many({})
        await _db.contextual_tags.delete_many({})
        return {"success": True, "message": "MongoDB collections cleared"}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def delete_item(collection: str, item_id: str) -> bool:
    """Delete a single item by ID from the specified collection."""
    if _use_memory:
        async with _memory_lock:
            if collection not in _memory_store:
                return False
            original_len = len(_memory_store[collection])
            _memory_store[collection] = [x for x in _memory_store[collection] if str(x.get("_id")) != item_id]
            return len(_memory_store[collection]) < original_len

    try:
        if collection == "raw_scans":
            result = await _db.raw_scans.delete_one({"_id": ObjectId(item_id)})
        elif collection == "parking_sessions":
            result = await _db.parking_sessions.delete_one({"_id": ObjectId(item_id)})
        elif collection == "contextual_tags":
            result = await _db.contextual_tags.delete_one({"_id": ObjectId(item_id)})
        else:
            return False
        return result.deleted_count > 0
    except Exception:
        try:
            if collection == "raw_scans":
                result = await _db.raw_scans.delete_one({"_id": item_id})
            elif collection == "parking_sessions":
                result = await _db.parking_sessions.delete_one({"_id": item_id})
            elif collection == "contextual_tags":
                result = await _db.contextual_tags.delete_one({"_id": item_id})
            return result.deleted_count > 0
        except Exception:
            return False
