"""
Plate Recognizer Cloud API service.

Calls https://api.platerecognizer.com/v1/plate-reader/ for each image,
parses all returned vehicle detections (a single image may contain multiple
vehicles and multiple license plates), and returns enriched detection objects.

Failures are caught, logged, and returned as an empty list — the capture
flow is never interrupted by an API failure.
"""

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)

_TOKEN: str = os.getenv("PLATE_RECOGNIZER_TOKEN", "")

# ── Plate Recognizer vehicle type → SurveyFlow category ──────────────────────
# Raw PR categories are mapped to the six survey categories used in all reports.
_PR_SURVEY_MAP: dict[str, str] = {
    # Car variants → car
    "Sedan":         "car",
    "SUV":           "car",
    "Hatchback":     "car",
    "Coupe":         "car",
    "Convertible":   "car",
    # Two-wheelers → two_wheeler
    "Motorcycle":    "two_wheeler",
    "Scooter":       "two_wheeler",
    # Three-wheelers → auto
    "Auto-Rickshaw": "auto",
    "Auto Rickshaw": "auto",
    # Heavy vehicles
    "Bus":           "bus",
    "Truck":         "truck",
    # Light Commercial Vehicles → lcv
    "Pickup":        "lcv",
    "Van":           "lcv",
    # Fallback
    "Unknown":       "others",
}


def map_pr_to_survey(pr_type: str) -> str:
    """Map a Plate Recognizer vehicle type string to the SurveyFlow category key."""
    return _PR_SURVEY_MAP.get(pr_type, "others")


def recognize_plates(image_path: str) -> list[dict]:
    """
    Call the Plate Recognizer Cloud API on a single image file.

    Returns one dict per detected vehicle with the following keys:
        plate_number          str | None   — uppercase plate text (None if undetected)
        plate_confidence      float        — 0–1 confidence for the plate reading
        detailed_vehicle_type str          — raw PR type: Sedan, SUV, Motorcycle, etc.
        pr_vehicle_type       str          — mapped SurveyFlow key (car, two_wheeler …)
        vehicle_make          str | None
        vehicle_model         str | None
        vehicle_color         str | None
        orientation           str | None   — Front | Rear | Unknown
        bbox_xyxy             tuple[int]   — (xmin, ymin, xmax, ymax) of vehicle box

    Returns an empty list on any failure.  Never raises.
    """
    if not _TOKEN:
        logger.warning("PLATE_RECOGNIZER_TOKEN not set — Plate Recognizer disabled")
        return []

    try:
        with open(image_path, "rb") as image_file:
            response = requests.post(
                "https://api.platerecognizer.com/v1/plate-reader/",
                headers={"Authorization": f"Token {_TOKEN}"},
                files={"upload": image_file},
                timeout=10,
            )

        if response.status_code not in (200, 201):
            logger.error(
                "Plate Recognizer API error: HTTP %d — %s",
                response.status_code,
                response.text[:300],
            )
            return []

        data = response.json()
        results = data.get("results", [])
        plates_found = sum(1 for r in results if r.get("plate"))
        logger.info(
            "Plate Recognizer: %d vehicle(s) detected, %d plate(s) identified",
            len(results),
            plates_found,
        )

        detections: list[dict] = []
        for result in results:
            # ── Plate ────────────────────────────────────────────
            plate_raw = result.get("plate", "")
            plate_clean: Optional[str] = plate_raw.upper().strip() if plate_raw else None
            score = float(result.get("score", 0.0))

            # ── Vehicle type ─────────────────────────────────────
            vehicle = result.get("vehicle") or {}
            pr_type: str = vehicle.get("type") or "Unknown"
            vbox = vehicle.get("box") or {}

            # ── Make / Model ─────────────────────────────────────
            # Plate Recognizer may use "model_make" or "make_model" key.
            mm_list = result.get("model_make") or result.get("make_model") or []
            make: Optional[str] = None
            model: Optional[str] = None
            color: Optional[str] = None

            if mm_list:
                top = mm_list[0]
                make = top.get("make") or None
                model = top.get("model") or None
                # Color can be nested inside the make/model entry or at the top level.
                color_list = top.get("color") or result.get("color") or []
                if color_list:
                    color = color_list[0].get("color") or None
            else:
                color_list = result.get("color") or []
                if color_list:
                    color = color_list[0].get("color") or None

            # ── Orientation ──────────────────────────────────────
            orient_list = result.get("orientation") or []
            orientation: Optional[str] = (
                orient_list[0].get("orientation") if orient_list else None
            )

            # ── Vehicle bounding box → xyxy ──────────────────────
            bbox_xyxy = (
                int(vbox.get("xmin", 0)),
                int(vbox.get("ymin", 0)),
                int(vbox.get("xmax", 0)),
                int(vbox.get("ymax", 0)),
            )

            detections.append({
                "plate_number":           plate_clean,
                "plate_confidence":       round(score, 4),
                "detailed_vehicle_type":  pr_type,
                "pr_vehicle_type":        map_pr_to_survey(pr_type),
                "vehicle_make":           make,
                "vehicle_model":          model,
                "vehicle_color":          color,
                "orientation":            orientation,
                "bbox_xyxy":              bbox_xyxy,
            })

        return detections

    except requests.Timeout:
        logger.error("Plate Recognizer API timed out for: %s", image_path)
        return []
    except OSError as e:
        logger.error(
            "Cannot open image for Plate Recognizer: %s — %s", image_path, e
        )
        return []
    except Exception as e:
        logger.exception("Plate Recognizer unexpected error: %s", e)
        return []
