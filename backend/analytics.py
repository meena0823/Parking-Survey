"""
Analytics aggregation for the Dashboard.
Computes metrics from raw_scans and parking_sessions collections.
Works in both MongoDB and in-memory modes.
"""

from datetime import datetime, timedelta
from collections import Counter, defaultdict
import random


async def compute_analytics(db_module) -> dict:
    """
    Fetch all sessions and scans, compute dashboard metrics.
    `db_module` is the database module so we reuse its connection.
    Both ML Detection and Manual Entry records feed into the same unified dataset.
    """
    sessions = await db_module.get_parking_sessions(limit=5000, skip=0)
    scans = await db_module.get_raw_scans(limit=5000, skip=0)
    total_sessions = len(sessions)

    # ── Vehicle Mix ──────────────────────────────────────────
    vehicle_counts = Counter()
    for s in sessions:
        vehicle_counts[s.get("vehicle_class", "Unknown")] += 1

    vehicle_mix = [
        {"type": k, "count": v, "percentage": round(v / max(total_sessions, 1) * 100, 1)}
        for k, v in vehicle_counts.most_common()
    ]

    # ── Source Breakdown (ML Detection vs Manual Entry) ──────
    source_counts = Counter()
    for s in sessions:
        src = s.get("source", "ML Detection")
        source_counts[src] += 1

    # Also count from scans for cross-reference
    scan_source_counts = Counter()
    for sc in scans:
        src = sc.get("source")
        if not src:
            src = "Manual Entry" if sc.get("agent_id") == "admin-manual" else "ML Detection"
        scan_source_counts[src] += 1

    source_breakdown = {
        "ml_detection": source_counts.get("ML Detection", 0),
        "manual_entry": source_counts.get("Manual Entry", 0),
        "ml_scans": scan_source_counts.get("ML Detection", 0),
        "manual_scans": scan_source_counts.get("Manual Entry", 0),
    }

    # ── Duration Profiling ───────────────────────────────────
    durations = {"short": 0, "medium": 0, "long": 0}
    duration_values = []
    for s in sessions:
        try:
            first = s.get("first_seen")
            last = s.get("last_seen")
            if isinstance(first, str):
                first = datetime.fromisoformat(first)
            if isinstance(last, str):
                last = datetime.fromisoformat(last)
            diff_hours = (last - first).total_seconds() / 3600
            duration_values.append(diff_hours)
            if diff_hours < 1:
                durations["short"] += 1
            elif diff_hours < 4:
                durations["medium"] += 1
            else:
                durations["long"] += 1
        except Exception:
            durations["short"] += 1
            duration_values.append(0.5)

    avg_duration = round(sum(duration_values) / max(len(duration_values), 1), 2)
    duration_profile = {
        "short_term_under_1h": durations["short"],
        "medium_1h_to_4h": durations["medium"],
        "long_term_over_4h": durations["long"],
        "average_hours": avg_duration,
    }

    # ── Turnover Rate ────────────────────────────────────────
    total_detections = sum(s.get("detection_count", 1) for s in sessions)
    turnover_rate = round(total_detections / max(total_sessions, 1), 2)

    # ── Occupancy Heatmap (zone-based) ───────────────────────
    zone_counts = defaultdict(int)
    for s in sessions:
        for loc in s.get("locations", []):
            vp = loc.get("vantage_point", "Unknown")
            zone_counts[vp] += 1

    heatmap_data = [
        {"zone": k, "count": v, "intensity": min(round(v / max(max(zone_counts.values(), default=1), 1), 2), 1.0)}
        for k, v in sorted(zone_counts.items(), key=lambda x: -x[1])
    ]

    # Fill in demo zones if empty
    if not heatmap_data:
        demo_zones = ["Zone A - North Gate", "Zone B - East Lot", "Zone C - South Field",
                       "Zone D - West Entry", "Zone E - Central", "Zone F - Overflow"]
        heatmap_data = [
            {"zone": z, "count": random.randint(5, 45),
             "intensity": round(random.uniform(0.2, 1.0), 2)}
            for z in demo_zones
        ]

    # ── Environmental Impact ─────────────────────────────────
    emission_weights = {"Car": 1.0, "SUV": 1.4, "Truck": 3.2, "Motorcycle": 0.5}
    wear_weights = {"Car": 1.0, "SUV": 1.5, "Truck": 4.0, "Motorcycle": 0.3}

    total_emission_score = sum(
        vehicle_counts.get(v, 0) * emission_weights.get(v, 1.0) for v in emission_weights
    )
    total_wear_score = sum(
        vehicle_counts.get(v, 0) * wear_weights.get(v, 1.0) for v in wear_weights
    )
    environmental = {
        "emission_index": round(total_emission_score, 1),
        "wear_index": round(total_wear_score, 1),
        "heavy_vehicle_percentage": round(
            vehicle_counts.get("Truck", 0) / max(total_sessions, 1) * 100, 1
        ),
        "green_score": round(max(0, 100 - total_emission_score * 0.8), 1),
    }

    # ── Vantage Point Coverage ───────────────────────────────
    vantage_points_seen = set()
    for s in scans:
        vantage_points_seen.add(s.get("vantage_point", "Unknown"))

    all_vantage_points = [
        {"name": "Zone A - North Gate", "lat": 28.6150, "lng": 77.2080, "angle": 0},
        {"name": "Zone B - East Lot", "lat": 28.6145, "lng": 77.2100, "angle": 90},
        {"name": "Zone C - South Field", "lat": 28.6130, "lng": 77.2090, "angle": 180},
        {"name": "Zone D - West Entry", "lat": 28.6140, "lng": 77.2070, "angle": 270},
        {"name": "Zone E - Central", "lat": 28.6140, "lng": 77.2088, "angle": 45},
        {"name": "Zone F - Overflow", "lat": 28.6135, "lng": 77.2095, "angle": 135},
    ]

    coverage = {
        "vantage_points": [
            {**vp, "active": vp["name"] in vantage_points_seen}
            for vp in all_vantage_points
        ],
        "coverage_percentage": round(
            len(vantage_points_seen & {vp["name"] for vp in all_vantage_points})
            / len(all_vantage_points) * 100, 1
        ) if vantage_points_seen else 0,
        "blind_spots": [
            vp["name"] for vp in all_vantage_points
            if vp["name"] not in vantage_points_seen
        ],
    }

    return {
        "total_sessions": total_sessions,
        "total_scans": len(scans),
        "vehicle_mix": vehicle_mix,
        "duration_profile": duration_profile,
        "turnover_rate": turnover_rate,
        "heatmap": heatmap_data,
        "environmental": environmental,
        "coverage": coverage,
        "source_breakdown": source_breakdown,
    }
