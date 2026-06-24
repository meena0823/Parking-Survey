"""
Computer Vision pipeline: Plate Recognizer Cloud API only.

Detection flow:
  1. Plate Recognizer Cloud API — vehicle type, plate number, make, model, color.
  2. Map PR vehicle types to parking survey categories.
  3. Return enriched detection objects for /api/detect and /api/upload.
"""

import plate_recognizer as _pr

VEHICLE_CLASSES = ["Car", "Truck", "Motorcycle", "Bus", "Bicycle", "Auto-Rickshaw"]


def _pr_to_detection(pr_det: dict) -> dict:
    """Convert a Plate Recognizer detection to the pipeline output format."""
    xmin, ymin, xmax, ymax = pr_det["bbox_xyxy"]
    plate = pr_det.get("plate_number")
    w = max(0.0, xmax - xmin)
    h = max(0.0, ymax - ymin)

    return {
        "vehicle_class": pr_det["vehicle_class"],
        "confidence": pr_det["plate_confidence"],
        "license_plate": plate if plate else "UNREADABLE",
        "bbox": [round(xmin, 1), round(ymin, 1), round(w, 1), round(h, 1)],
        "vehicle_number": plate,
        "plate_confidence": pr_det["plate_confidence"],
        "vehicle_make": pr_det.get("vehicle_make"),
        "vehicle_model": pr_det.get("vehicle_model"),
        "vehicle_color": pr_det.get("vehicle_color"),
        "detailed_vehicle_type": pr_det.get("detailed_vehicle_type"),
        "orientation": pr_det.get("orientation"),
    }


def process_image(image_path: str) -> list[dict]:
    """
    Run Plate Recognizer on an image and return parking survey detections.

    Returns an empty list when no vehicles are found or the API is unavailable.
    """
    pr_dets = _pr.recognize_plates(image_path)
    return [_pr_to_detection(d) for d in pr_dets]


def get_pipeline_status() -> dict:
    """Return status of CV pipeline components."""
    return {
        "yolo_available": False,
        "ocr_available": False,
        "plate_recognizer_enabled": bool(_pr._TOKEN),
        "mode": "plate_recognizer_only",
    }
