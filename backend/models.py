"""
Pydantic schemas and MongoDB document shapes for the Parking Survey system.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime


# ── Request schemas ──────────────────────────────────────────

class UploadMeta(BaseModel):
    agent_id: str = Field(..., description="Unique ID of the field agent")
    vantage_point: str = Field(..., description="Named vantage location")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    latitude: float = Field(default=28.6139)
    longitude: float = Field(default=77.2090)


class ManualEntry(BaseModel):
    vehicle_class: str = Field(..., description="Car | SUV | Truck | Motorcycle | Bus | Auto-Rickshaw")
    license_plate: str = Field(..., description="Vehicle number plate (required, stored as entered)")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    latitude: float = Field(default=28.6139)
    longitude: float = Field(default=77.2090)
    vantage_point: str = Field(default="Manual")
    # Survey context fields
    enumerator_id: str = Field(default="", description="Enumerator ID")
    survey_session_id: str = Field(default="", description="Survey Session ID")
    time_slot_id: str = Field(default="", description="Time Slot ID, e.g. 10:00-10:15")
    location_id: str = Field(default="", description="Location ID")
    notes: Optional[str] = Field(default=None, description="Optional notes from enumerator")

    @validator("license_plate")
    def plate_must_not_be_blank(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("Vehicle number plate cannot be empty")
        return v


class ContextualTag(BaseModel):
    date: str = Field(..., description="ISO date string YYYY-MM-DD")
    tag_type: str = Field(..., description="Weather | Event | Holiday | Other")
    description: str = Field(..., description="Tag description")


# ── Detection result from CV pipeline ──────────────────────

class DetectedVehicle(BaseModel):
    vehicle_class: str
    confidence: float
    license_plate: Optional[str] = None
    bbox: list[float] = Field(default_factory=list)


# ── MongoDB document shapes (for reference) ────────────────

class RawScanDoc(BaseModel):
    """Shape of documents in the 'raw_scans' collection."""
    image_path: Optional[str] = None
    agent_id: str
    vantage_point: str
    timestamp: datetime
    latitude: float
    longitude: float
    detections: list[DetectedVehicle] = Field(default_factory=list)
    source: str = Field(default="ML Detection", description="ML Detection | Manual Entry")
    enumerator_id: str = Field(default="")
    survey_session_id: str = Field(default="")
    time_slot_id: str = Field(default="")
    location_id: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ParkingSessionDoc(BaseModel):
    """Shape of documents in the 'parking_sessions' collection."""
    license_plate: str                       # primary key (unique index)
    vehicle_class: str
    first_seen: datetime
    last_seen: datetime
    locations: list[dict] = Field(default_factory=list)  # [{lat, lng, vantage_point, seen_at}]
    detection_count: int = 1
    tags: list[dict] = Field(default_factory=list)
    source: str = Field(default="ML Detection", description="Source of first detection")
    enumerator_id: str = Field(default="")
    slot_id: str = Field(default="")
    notes: Optional[str] = None
