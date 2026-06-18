const API_BASE = '/api';

export async function uploadImages(files, metadata) {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('agent_id', metadata.agentId || 'agent-001');
    formData.append('vantage_point', metadata.vantagePoint || 'Zone A - North Gate');
    formData.append('timestamp', metadata.timestamp || new Date().toISOString());
    formData.append('latitude', metadata.latitude || 28.6139);
    formData.append('longitude', metadata.longitude || 77.2090);

    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
}

export async function manualEntry(entry) {
    const res = await fetch(`${API_BASE}/manual-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    });
    const data = await res.json();
    // HTTP 409 = duplicate vehicle in slot — not a hard error, return for UI handling
    if (res.status === 409) {
        return { duplicate: true, message: data.detail || 'Vehicle already recorded in this slot' };
    }
    if (!res.ok) {
        throw new Error(data.detail || `Manual entry failed: ${res.status}`);
    }
    return data;
}

export async function checkDuplicate(plate, slotId) {
    if (!plate || !slotId) return { duplicate: false };
    try {
        const res = await fetch(
            `${API_BASE}/check-duplicate?plate=${encodeURIComponent(plate)}&slot_id=${encodeURIComponent(slotId)}`
        );
        if (!res.ok) return { duplicate: false };
        return res.json();
    } catch {
        return { duplicate: false };
    }
}

export async function getScans(limit = 100, skip = 0) {
    const res = await fetch(`${API_BASE}/scans?limit=${limit}&skip=${skip}`);
    return res.json();
}

export async function getSessions(limit = 100, skip = 0) {
    const res = await fetch(`${API_BASE}/sessions?limit=${limit}&skip=${skip}`);
    return res.json();
}

export async function getVehicleHistory(limit = 500) {
    const res = await fetch(`${API_BASE}/vehicle-history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch vehicle history');
    return res.json();
}

export async function getAnalytics() {
    const res = await fetch(`${API_BASE}/analytics`);
    return res.json();
}

export async function addTag(tag) {
    const res = await fetch(`${API_BASE}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tag),
    });
    return res.json();
}

export async function getTags() {
    const res = await fetch(`${API_BASE}/tags`);
    return res.json();
}

export async function getTimelapse(date) {
    const res = await fetch(`${API_BASE}/timelapse/${date}`);
    return res.json();
}

export async function getStatus() {
    const res = await fetch(`${API_BASE}/status`);
    return res.json();
}

export async function clearDatabase() {
    const res = await fetch(`${API_BASE}/clear`, { method: 'POST' });
    if (!res.ok) throw new Error(`Clear DB failed: ${res.status}`);
    return res.json();
}

export async function deleteItem(collection, itemId) {
    const res = await fetch(`${API_BASE}/delete/${collection}/${itemId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    return res.json();
}
