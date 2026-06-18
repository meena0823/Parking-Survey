"""
Computer Vision pipeline: YOLOv8 vehicle detection + Plate Recognizer enrichment
+ EasyOCR fallback.

Detection flow:
  1. YOLOv8  — vehicle classification, bounding boxes (primary survey category).
  2. Plate Recognizer Cloud API — plate number, make, model, color, detailed type.
  3. EasyOCR — plate fallback when Plate Recognizer is unavailable/fails.
  4. Merge by IoU: YOLO classification + PR enrichment per vehicle.
     PR-only detections (missed by YOLO) are appended using PR's mapped category.
"""

import os
import re
import tempfile
from typing import Optional

import plate_recognizer as _pr

# ── Try importing CV libraries ───────────────────────────────
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

try:
    import easyocr
    HAS_OCR = True
    _ocr_reader = None
except ImportError:
    HAS_OCR = False

VEHICLE_CLASSES = ["Car", "Truck", "Motorcycle", "Bus", "Bicycle", "Auto-Rickshaw"]

# Fine-tuned model class IDs (from indian_yolov8n.pt training)
# Falls back to COCO mapping if custom model is not available
INDIAN_VEHICLE_MAP = {0: "Car", 1: "Truck", 2: "Motorcycle", 3: "Bus", 4: "Bicycle", 5: "Auto-Rickshaw"}
COCO_VEHICLE_MAP = {1: "Bicycle", 2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

# Minimum confidence for YOLO detections
MIN_CONFIDENCE = 0.25

# IoU threshold for deduplication — boxes overlapping more than this are merged
IOU_THRESHOLD = 0.3

# Minimum characters for a valid plate reading
MIN_PLATE_LENGTH = 4

# Whether using the fine-tuned Indian model
_using_indian_model = False
_yolo_model = None


def _load_yolo():
    global _yolo_model, _using_indian_model
    if _yolo_model is None and HAS_YOLO:
        import os
        indian_model = os.path.join(os.path.dirname(__file__), "indian_yolov8n.pt")
        if os.path.exists(indian_model):
            _yolo_model = YOLO(indian_model)
            _using_indian_model = True
            print("✓  Loaded fine-tuned Indian vehicle model")
        else:
            _yolo_model = YOLO("yolov8n.pt")
            _using_indian_model = False
            print("⚠  Indian model not found, using default YOLOv8n")
    return _yolo_model


def _load_ocr():
    global _ocr_reader
    if _ocr_reader is None and HAS_OCR:
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
    return _ocr_reader


# ── IoU Deduplication ────────────────────────────────────────

def _compute_iou(box_a, box_b):
    """
    Compute Intersection over Union between two boxes.
    Each box is (x1, y1, x2, y2).
    """
    xa = max(box_a[0], box_b[0])
    ya = max(box_a[1], box_b[1])
    xb = min(box_a[2], box_b[2])
    yb = min(box_a[3], box_b[3])

    inter = max(0, xb - xa) * max(0, yb - ya)
    if inter == 0:
        return 0.0

    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter

    return inter / union if union > 0 else 0.0


def _deduplicate_detections(raw_detections: list[dict]) -> list[dict]:
    """
    Remove overlapping detections of the same vehicle.
    When two boxes overlap beyond IOU_THRESHOLD, keep the one with higher confidence.
    """
    if not raw_detections:
        return []

    # Sort by confidence descending — keep highest-confidence detections first
    sorted_dets = sorted(raw_detections, key=lambda d: d["confidence"], reverse=True)
    keep = []

    for det in sorted_dets:
        box = det["_xyxy"]  # (x1, y1, x2, y2)
        is_duplicate = False
        for kept in keep:
            iou = _compute_iou(box, kept["_xyxy"])
            if iou > IOU_THRESHOLD:
                is_duplicate = True
                break
        if not is_duplicate:
            keep.append(det)

    # Remove internal _xyxy field before returning
    for det in keep:
        del det["_xyxy"]

    return keep


# ── Plate text cleaning ─────────────────────────────────────

def _clean_plate_text(raw_text: str) -> Optional[str]:
    """
    Clean and validate OCR output to extract a license plate string.
    Returns None if the text doesn't look like a valid plate.
    """
    # Remove spaces, special characters, keep only alphanumeric
    cleaned = re.sub(r'[^A-Z0-9]', '', raw_text.upper())

    if len(cleaned) < MIN_PLATE_LENGTH:
        return None

    return cleaned


# ── OCR plate reading ────────────────────────────────────────

def _read_plate_from_region(image_path: str, x1: float, y1: float, x2: float, y2: float) -> Optional[str]:
    """
    Attempt OCR on the plate region of a vehicle bounding box.
    Tries multiple crop strategies:
    1. Bottom 35% of bounding box (most common plate location)
    2. Bottom-right quadrant (offset plates)
    3. Full bounding box (last resort)
    Returns cleaned plate text or None.
    """
    if not HAS_OCR:
        return None

    try:
        from PIL import Image
        img = Image.open(image_path)
        reader = _load_ocr()

        box_h = y2 - y1
        box_w = x2 - x1

        # Strategy 1: Bottom 35% of bounding box
        crop_regions = [
            (int(x1), int(y1 + box_h * 0.65), int(x2), int(y2)),           # bottom 35%
            (int(x1 + box_w * 0.3), int(y1 + box_h * 0.6), int(x2), int(y2)),  # bottom-right
            (int(x1), int(y1), int(x2), int(y2)),                           # full box (fallback)
        ]

        for region in crop_regions:
            try:
                crop = img.crop(region)
                # Save temp crop for OCR (cross-platform path)
                crop_path = os.path.join(tempfile.gettempdir(), "_plate_crop.jpg")
                crop.save(crop_path)
                ocr_results = reader.readtext(crop_path)

                if ocr_results:
                    # Combine all detected text segments
                    raw_text = "".join(r[1] for r in ocr_results)
                    plate = _clean_plate_text(raw_text)
                    if plate:
                        return plate
            except Exception:
                continue

    except Exception:
        pass

    return None


# ── Real detection ───────────────────────────────────────────

def _real_detect(image_path: str) -> list[dict]:
    """Run YOLOv8 + OCR on a real image with deduplication."""
    model = _load_yolo()
    # Select correct class mapping based on loaded model
    vehicle_map = INDIAN_VEHICLE_MAP if _using_indian_model else COCO_VEHICLE_MAP
    results = model(image_path, verbose=False)
    raw_detections = []

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            if cls_id not in vehicle_map:
                continue
            conf = float(box.conf[0])
            if conf < MIN_CONFIDENCE:
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()
            vclass = vehicle_map[cls_id]

            raw_detections.append({
                "vehicle_class": vclass,
                "confidence": round(conf, 2),
                "_xyxy": (x1, y1, x2, y2),  # kept for dedup, removed after
                "bbox": [round(x1, 1), round(y1, 1),
                         round(x2 - x1, 1), round(y2 - y1, 1)],
            })

    # Deduplicate overlapping boxes
    detections = _deduplicate_detections(raw_detections)

    # Now run OCR on deduplicated detections only
    for det in detections:
        bx, by, bw, bh = det["bbox"]
        plate = _read_plate_from_region(image_path, bx, by, bx + bw, by + bh)
        det["license_plate"] = plate if plate else "UNREADABLE"

    return detections


# ── Plate Recognizer merging ─────────────────────────────────

def _merge_detections(yolo_dets: list[dict], pr_dets: list[dict]) -> list[dict]:
    """
    Merge YOLO and Plate Recognizer detections into enriched result objects.

    Rules:
    - YOLO vehicle_class is the authoritative survey category whenever available.
    - Plate Recognizer supplies: vehicle_number, make, model, color,
      detailed_vehicle_type, orientation.
    - Matching uses vehicle bounding-box IoU (threshold 0.15 — boxes from two
      independent models seldom overlap perfectly but do overlap meaningfully).
    - YOLO detections with no PR match retain EasyOCR plate; new PR fields = None.
    - PR-only detections (YOLO missed) are appended using PR's mapped survey key
      as the fallback vehicle_class.
    """
    if not yolo_dets and not pr_dets:
        return []

    merged: list[dict] = []
    pr_matched: set[int] = set()

    for yolo_det in yolo_dets:
        # Convert YOLO bbox [x, y, w, h] → xyxy for IoU calculation
        bx, by, bw, bh = yolo_det["bbox"]
        yolo_xyxy = (bx, by, bx + bw, by + bh)

        best_pr_idx: Optional[int] = None
        best_iou = 0.0
        for i, pr_det in enumerate(pr_dets):
            if i in pr_matched:
                continue
            iou = _compute_iou(yolo_xyxy, pr_det["bbox_xyxy"])
            if iou > best_iou:
                best_iou = iou
                best_pr_idx = i

        enriched = dict(yolo_det)

        if best_pr_idx is not None and best_iou > 0.15:
            pr_det = pr_dets[best_pr_idx]
            pr_matched.add(best_pr_idx)
            enriched.update({
                "vehicle_number":         pr_det["plate_number"],
                "plate_confidence":       pr_det["plate_confidence"],
                "vehicle_make":           pr_det["vehicle_make"],
                "vehicle_model":          pr_det["vehicle_model"],
                "vehicle_color":          pr_det["vehicle_color"],
                "detailed_vehicle_type":  pr_det["detailed_vehicle_type"],
                "orientation":            pr_det["orientation"],
            })
            # Prefer Plate Recognizer plate over EasyOCR when available
            if pr_det["plate_number"]:
                enriched["license_plate"] = pr_det["plate_number"]
        else:
            # No PR match — keep EasyOCR plate, fill new fields as None
            ocr_plate = yolo_det.get("license_plate")
            enriched.update({
                "vehicle_number":         ocr_plate if ocr_plate != "UNREADABLE" else None,
                "plate_confidence":       None,
                "vehicle_make":           None,
                "vehicle_model":          None,
                "vehicle_color":          None,
                "detailed_vehicle_type":  None,
                "orientation":            None,
            })

        merged.append(enriched)

    # Add PR-only detections (vehicles Plate Recognizer found that YOLO missed)
    for i, pr_det in enumerate(pr_dets):
        if i not in pr_matched:
            merged.append({
                "vehicle_class":          pr_det["pr_vehicle_type"],
                "confidence":             pr_det["plate_confidence"],
                "license_plate":          pr_det["plate_number"] or "UNREADABLE",
                "bbox":                   [],
                "vehicle_number":         pr_det["plate_number"],
                "plate_confidence":       pr_det["plate_confidence"],
                "vehicle_make":           pr_det["vehicle_make"],
                "vehicle_model":          pr_det["vehicle_model"],
                "vehicle_color":          pr_det["vehicle_color"],
                "detailed_vehicle_type":  pr_det["detailed_vehicle_type"],
                "orientation":            pr_det["orientation"],
            })

    return merged


# ── Public API ───────────────────────────────────────────────

def process_image(image_path: str) -> list[dict]:
    """
    Run the full CV pipeline: YOLOv8 → Plate Recognizer → merge.

    - YOLO provides vehicle classification (primary survey category).
    - Plate Recognizer provides plate number, make, model, color, detailed type.
    - If YOLO fails or is unavailable, Plate Recognizer detections are used alone.
    - If Plate Recognizer fails, YOLO + EasyOCR results are returned unchanged.
    - Returns an empty list when no vehicles are found.
    """
    yolo_dets: list[dict] = []
    if HAS_YOLO:
        try:
            yolo_dets = _real_detect(image_path)
        except Exception as e:
            print(f"⚠  YOLO inference failed ({e})")

    # Plate Recognizer — always attempt; returns [] on any failure, never raises
    pr_dets = _pr.recognize_plates(image_path)

    if not yolo_dets and not pr_dets:
        if not HAS_YOLO:
            print("⚠  YOLO not installed — cannot process image. Install ultralytics.")
        return []

    return _merge_detections(yolo_dets, pr_dets)


def get_pipeline_status() -> dict:
    """Return status of CV pipeline components."""
    return {
        "yolo_available":            HAS_YOLO,
        "ocr_available":             HAS_OCR,
        "plate_recognizer_enabled":  bool(_pr._TOKEN),
        "mode":                      "real" if HAS_YOLO else "unavailable",
    }
