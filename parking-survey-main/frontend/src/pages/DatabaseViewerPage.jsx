import { useState, useEffect, useCallback, useRef } from 'react'
import {
    getSessions, getScans, getVehicleHistory,
    manualEntry, checkDuplicate,
    addTag, getTags, clearDatabase, deleteItem,
} from '../lib/api'

const VEHICLE_CLASSES = ['Car', 'SUV', 'Truck', 'Motorcycle', 'Bus', 'Auto-Rickshaw', 'Bicycle']
const TAG_TYPES = ['Weather', 'Event', 'Holiday', 'Other']
const VANTAGE_POINTS = [
    'Zone A - North Gate', 'Zone B - East Lot', 'Zone C - South Field',
    'Zone D - West Entry', 'Zone E - Central', 'Zone F - Overflow',
]

function SourceBadge({ source }) {
    if (source === 'Manual Entry') {
        return (
            <span className="badge badge-amber text-[0.65rem]">
                ✏️ Manual
            </span>
        )
    }
    return (
        <span className="badge badge-blue text-[0.65rem]">
            🤖 ML
        </span>
    )
}

export default function DatabaseViewerPage() {
    const [tab, setTab] = useState('sessions')
    const [sessions, setSessions] = useState([])
    const [scans, setScans] = useState([])
    const [history, setHistory] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [polling, setPolling] = useState(true)
    const [lastUpdate, setLastUpdate] = useState(null)
    const [showManual, setShowManual] = useState(false)
    const [showTags, setShowTags] = useState(false)
    const [tags, setTags] = useState([])

    // Manual Entry Form State
    const [form, setForm] = useState({
        vehicle_class: 'Car',
        license_plate: '',
        notes: '',
        enumerator_id: '',
        survey_session_id: '',
        time_slot_id: '',
        location_id: '',
        timestamp: new Date().toISOString().slice(0, 16),
        vantage_point: VANTAGE_POINTS[0],
        latitude: '28.6139',
        longitude: '77.2090',
    })
    const [showContext, setShowContext] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitMsg, setSubmitMsg] = useState(null)
    const [duplicateWarning, setDuplicateWarning] = useState(null)
    const [liveCheckPending, setLiveCheckPending] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)

    // Tag Form State
    const [tagForm, setTagForm] = useState({
        date: new Date().toISOString().slice(0, 10),
        tag_type: 'Weather',
        description: '',
    })

    // Ref for debouncing the live duplicate check
    const dupCheckTimer = useRef(null)

    const fetchData = useCallback(async () => {
        try {
            const [sessRes, scanRes] = await Promise.all([getSessions(200), getScans(200)])
            setSessions(sessRes.sessions || [])
            setScans(scanRes.scans || [])
            setLastUpdate(new Date())
        } catch (err) {
            console.error('Fetch error:', err)
        }
    }, [])

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true)
        try {
            const res = await getVehicleHistory(500)
            setHistory(res.history || [])
        } catch (err) {
            console.error('History fetch error:', err)
        } finally {
            setHistoryLoading(false)
        }
    }, [])

    // Polling for sessions/scans
    useEffect(() => {
        fetchData()
        if (!polling) return
        const id = setInterval(fetchData, 5000)
        return () => clearInterval(id)
    }, [polling, fetchData])

    // Load history when that tab becomes active
    useEffect(() => {
        if (tab === 'history') fetchHistory()
    }, [tab, fetchHistory])

    // Load tags on mount
    useEffect(() => {
        getTags().then(res => setTags(res.tags || [])).catch(() => { })
    }, [])

    // Live duplicate pre-check (debounced)
    const runDupCheck = useCallback((plate, slotId) => {
        clearTimeout(dupCheckTimer.current)
        if (!plate || !slotId) {
            setDuplicateWarning(null)
            setLiveCheckPending(false)
            return
        }
        setLiveCheckPending(true)
        dupCheckTimer.current = setTimeout(async () => {
            try {
                const result = await checkDuplicate(plate.trim().toUpperCase(), slotId)
                if (result.duplicate) {
                    setDuplicateWarning(
                        `Vehicle ${plate.toUpperCase()} is already recorded in slot "${slotId}" (${result.existing_source || 'previously detected'}). Saving will be blocked.`
                    )
                } else {
                    setDuplicateWarning(null)
                }
            } catch {
                setDuplicateWarning(null)
            } finally {
                setLiveCheckPending(false)
            }
        }, 600)
    }, [])

    // Trigger live dup check when plate or slot changes
    useEffect(() => {
        runDupCheck(form.license_plate, form.time_slot_id)
    }, [form.license_plate, form.time_slot_id, runDupCheck])

    const handleFormChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
        setSubmitMsg(null)
    }

    const handleManualSubmit = async (e) => {
        e.preventDefault()
        setSubmitting(true)
        setSubmitMsg(null)

        const plate = form.license_plate.trim().toUpperCase()
        if (!plate) {
            setSubmitMsg({ type: 'error', text: 'Vehicle number plate is required.' })
            setSubmitting(false)
            return
        }

        try {
            const result = await manualEntry({
                vehicle_class: form.vehicle_class,
                license_plate: plate,
                notes: form.notes || null,
                enumerator_id: form.enumerator_id,
                survey_session_id: form.survey_session_id,
                time_slot_id: form.time_slot_id,
                location_id: form.location_id,
                timestamp: new Date(form.timestamp).toISOString(),
                vantage_point: form.vantage_point,
                latitude: parseFloat(form.latitude),
                longitude: parseFloat(form.longitude),
            })

            if (result.duplicate) {
                setDuplicateWarning(result.message)
                setSubmitMsg(null)
                return
            }

            setSubmitMsg({
                type: 'success',
                text: `Saved: ${plate} (${form.vehicle_class}) — source: Manual Entry`,
            })
            setForm(prev => ({ ...prev, license_plate: '', notes: '' }))
            setDuplicateWarning(null)
            fetchData()
            if (tab === 'history') fetchHistory()
        } catch (err) {
            setSubmitMsg({ type: 'error', text: err.message })
        } finally {
            setSubmitting(false)
        }
    }

    const handleTagSubmit = async (e) => {
        e.preventDefault()
        try {
            await addTag(tagForm)
            setTagForm(prev => ({ ...prev, description: '' }))
            const res = await getTags()
            setTags(res.tags || [])
        } catch { }
    }

    const handleClearDatabase = async () => {
        if (!confirmClear) {
            setConfirmClear(true)
            setTimeout(() => setConfirmClear(false), 3000)
            return
        }
        setConfirmClear(false)
        setClearing(true)
        try {
            await clearDatabase()
            await fetchData()
            setHistory([])
            const res = await getTags()
            setTags(res.tags || [])
        } catch (e) {
            alert('Failed to clear database: ' + e.message)
        } finally {
            setClearing(false)
        }
    }

    const handleRowDelete = async (collection, id) => {
        if (!window.confirm('Delete this entry forever?')) return
        try {
            await deleteItem(collection, id)
            if (collection === 'contextual_tags') {
                const res = await getTags()
                setTags(res.tags || [])
            } else {
                await fetchData()
                if (tab === 'history') fetchHistory()
            }
        } catch (e) {
            alert('Failed to delete row: ' + e.message)
        }
    }

    // ── Stats ────────────────────────────────────────────────
    const mlCount = sessions.filter(s => (s.source || 'ML Detection') === 'ML Detection').length
    const manualCount = sessions.filter(s => s.source === 'Manual Entry').length

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                        <span className="gradient-text">Live Database</span>
                    </h1>
                    <p className="text-surface-400 mt-1 text-sm">
                        Unified view — ML Detections &amp; Manual Entries share the same dataset
                    </p>
                </div>
                <div className="flex items-center gap-3 mt-3 sm:mt-0">
                    <button
                        className={`badge ${polling ? 'badge-green' : 'badge-red'} cursor-pointer`}
                        onClick={() => setPolling(!polling)}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${polling ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {polling ? 'Live' : 'Paused'}
                    </button>
                    {lastUpdate && (
                        <span className="text-xs text-surface-500">
                            Updated {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-4">
                {/* Left: Table Area */}
                <div className="lg:col-span-3">
                    {/* Tabs */}
                    <div className="flex gap-1 mb-4 border-b border-surface-700/40 flex-wrap">
                        <button
                            className={`tab-btn ${tab === 'sessions' ? 'active' : ''}`}
                            onClick={() => setTab('sessions')}
                        >
                            🅿️ Parking Sessions ({sessions.length})
                        </button>
                        <button
                            className={`tab-btn ${tab === 'scans' ? 'active' : ''}`}
                            onClick={() => setTab('scans')}
                        >
                            📷 Raw Scans ({scans.length})
                        </button>
                        <button
                            className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
                            onClick={() => setTab('history')}
                        >
                            📋 Detection History ({history.length})
                        </button>
                        <div className="ml-auto">
                            <button
                                onClick={handleClearDatabase}
                                disabled={clearing}
                                className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-white hover:bg-red-500/80 bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
                            >
                                {clearing ? 'Clearing...' : confirmClear ? '⚠️ Confirm Clear?' : '🗑️ Clear All Data'}
                            </button>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">

                            {/* ── Sessions Table ── */}
                            {tab === 'sessions' && (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Vehicle</th>
                                            <th>Number Plate</th>
                                            <th>First Seen</th>
                                            <th>Last Seen</th>
                                            <th>Location</th>
                                            <th>Source</th>
                                            <th>Count</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sessions.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="text-center py-12 text-surface-500">
                                                    <p className="text-lg mb-1">No sessions yet</p>
                                                    <p className="text-xs">Upload images or add manual entries to see data here</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            sessions.map((s, i) => (
                                                <tr key={s._id || i} className="animate-fade-in-up" style={{ animationDelay: `${i * 20}ms` }}>
                                                    <td>
                                                        <span className={`badge ${s.vehicle_class === 'Car' ? 'badge-blue' :
                                                            s.vehicle_class === 'SUV' ? 'badge-green' :
                                                                s.vehicle_class === 'Truck' ? 'badge-amber' :
                                                                    'badge-purple'
                                                            }`}>
                                                            {s.vehicle_class === 'Car' ? '🚗' :
                                                                s.vehicle_class === 'SUV' ? '🚙' :
                                                                    s.vehicle_class === 'Truck' ? '🚛' :
                                                                        s.vehicle_class === 'Bus' ? '🚌' : '🏍️'} {s.vehicle_class}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="font-mono text-xs font-semibold text-brand-400">{s.license_plate}</span>
                                                    </td>
                                                    <td className="text-xs text-surface-400">
                                                        {new Date(s.first_seen).toLocaleString()}
                                                    </td>
                                                    <td className="text-xs text-surface-400">
                                                        {new Date(s.last_seen).toLocaleString()}
                                                    </td>
                                                    <td className="text-xs text-surface-400">
                                                        {s.locations?.[0]?.vantage_point || s.slot_id || '—'}
                                                    </td>
                                                    <td>
                                                        <SourceBadge source={s.source || 'ML Detection'} />
                                                    </td>
                                                    <td>
                                                        <span className="font-mono text-xs font-bold text-white">{s.detection_count}</span>
                                                    </td>
                                                    <td className="text-right">
                                                        <button
                                                            onClick={() => handleRowDelete('parking_sessions', s._id)}
                                                            className="text-surface-500 hover:text-red-400 p-1 rounded transition-colors bg-surface-800/50 hover:bg-surface-800"
                                                            title="Delete this session"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {/* ── Raw Scans Table ── */}
                            {tab === 'scans' && (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Agent / Enumerator</th>
                                            <th>Slot / Vantage</th>
                                            <th>Timestamp</th>
                                            <th>Source</th>
                                            <th>Vehicles</th>
                                            <th>Detections</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scans.length === 0 ? (
                                            <tr>
                                                <td colSpan="7" className="text-center py-12 text-surface-500">
                                                    <p className="text-lg mb-1">No scans yet</p>
                                                    <p className="text-xs">Upload images to see processed scan results</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            scans.map((s, i) => {
                                                const src = s.source || (s.agent_id === 'admin-manual' ? 'Manual Entry' : 'ML Detection')
                                                return (
                                                    <tr key={s._id || i} className="animate-fade-in-up" style={{ animationDelay: `${i * 20}ms` }}>
                                                        <td>
                                                            <span className="badge badge-blue text-[0.65rem]">{s.agent_id}</span>
                                                        </td>
                                                        <td className="text-xs text-surface-300">
                                                            {s.time_slot_id ? (
                                                                <><span className="text-brand-400 font-mono">{s.time_slot_id}</span><br /></>
                                                            ) : null}
                                                            {s.vantage_point}
                                                        </td>
                                                        <td className="text-xs text-surface-400">
                                                            {new Date(s.timestamp).toLocaleString()}
                                                        </td>
                                                        <td><SourceBadge source={src} /></td>
                                                        <td className="font-mono text-xs font-bold text-white">
                                                            {s.detections?.length || 0}
                                                        </td>
                                                        <td>
                                                            <div className="flex flex-wrap gap-1 max-w-xs">
                                                                {s.detections?.slice(0, 4).map((d, j) => (
                                                                    <span key={j} className={`badge text-[0.6rem] ${d.vehicle_class === 'Car' ? 'badge-blue' :
                                                                        d.vehicle_class === 'SUV' ? 'badge-green' :
                                                                            d.vehicle_class === 'Truck' ? 'badge-amber' :
                                                                                'badge-purple'
                                                                        }`}>
                                                                        {d.vehicle_class}
                                                                        {d.license_plate ? ` · ${d.license_plate}` : ''}
                                                                    </span>
                                                                ))}
                                                                {(s.detections?.length || 0) > 4 && (
                                                                    <span className="badge badge-blue text-[0.6rem]">+{s.detections.length - 4}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="text-right">
                                                            <button
                                                                onClick={() => handleRowDelete('raw_scans', s._id)}
                                                                className="text-surface-500 hover:text-red-400 p-1 rounded transition-colors bg-surface-800/50 hover:bg-surface-800"
                                                                title="Delete this scan"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {/* ── Detection History Table ── */}
                            {tab === 'history' && (
                                historyLoading ? (
                                    <div className="flex items-center justify-center py-16 text-surface-500">
                                        <span className="animate-pulse text-sm">Loading detection history…</span>
                                    </div>
                                ) : (
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Timestamp</th>
                                                <th>Vehicle Type</th>
                                                <th>Number Plate</th>
                                                <th>Source</th>
                                                <th>Enumerator</th>
                                                <th>Slot</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" className="text-center py-12 text-surface-500">
                                                        <p className="text-lg mb-1">No detection history yet</p>
                                                        <p className="text-xs">Upload images or add manual entries to populate history</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                history.map((h, i) => (
                                                    <tr key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 15}ms` }}>
                                                        <td className="text-xs text-surface-400 whitespace-nowrap">
                                                            {new Date(h.timestamp).toLocaleString()}
                                                        </td>
                                                        <td>
                                                            <span className={`badge text-[0.65rem] ${h.vehicle_type === 'Car' ? 'badge-blue' :
                                                                h.vehicle_type === 'Truck' ? 'badge-amber' :
                                                                    h.vehicle_type === 'Bus' ? 'badge-red' :
                                                                        'badge-purple'
                                                                }`}>
                                                                {h.vehicle_type}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className="font-mono text-xs font-semibold text-brand-400">{h.license_plate}</span>
                                                        </td>
                                                        <td><SourceBadge source={h.source} /></td>
                                                        <td className="text-xs text-surface-400">{h.enumerator_id || '—'}</td>
                                                        <td className="text-xs text-surface-400 font-mono">{h.slot_id || '—'}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-4">
                    {/* Manual Entry Toggle */}
                    <button
                        className={`w-full btn-primary ${showManual ? 'opacity-80' : ''}`}
                        onClick={() => { setShowManual(!showManual); setDuplicateWarning(null); setSubmitMsg(null) }}
                    >
                        {showManual ? '✕ Close Form' : '＋ Manual Entry'}
                    </button>

                    {/* Manual Entry Form */}
                    {showManual && (
                        <form className="glass-card p-4 space-y-3 animate-fade-in-up" onSubmit={handleManualSubmit}>
                            <h3 className="text-xs font-bold text-surface-300 uppercase tracking-wider">Add Vehicle Manually</h3>

                            {/* License Plate — Required, primary field */}
                            <div>
                                <label className="block text-xs font-semibold text-surface-200 mb-1">
                                    Vehicle Number Plate
                                    <span className="text-red-400 ml-1">*</span>
                                </label>
                                <input
                                    className={`input-field font-mono text-sm tracking-widest uppercase ${duplicateWarning ? 'border-amber-500/60' : ''}`}
                                    value={form.license_plate}
                                    onChange={e => handleFormChange('license_plate', e.target.value)}
                                    placeholder="e.g. KL49H6635"
                                    required
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                <p className="text-[0.6rem] text-surface-500 mt-0.5">
                                    Stored exactly as entered · Mandatory field
                                    {liveCheckPending && <span className="ml-2 text-surface-400 animate-pulse">checking…</span>}
                                </p>
                            </div>

                            {/* Duplicate Warning Banner */}
                            {duplicateWarning && (
                                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300 leading-relaxed">
                                    ⚠️ <strong>Duplicate Detected</strong><br />
                                    {duplicateWarning}
                                </div>
                            )}

                            {/* Vehicle Class */}
                            <div>
                                <label className="block text-xs text-surface-400 mb-1">Vehicle Type</label>
                                <select
                                    className="input-field"
                                    value={form.vehicle_class}
                                    onChange={e => handleFormChange('vehicle_class', e.target.value)}
                                >
                                    {VEHICLE_CLASSES.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>

                            {/* Notes — Optional */}
                            <div>
                                <label className="block text-xs text-surface-400 mb-1">
                                    Notes <span className="text-surface-600">(optional)</span>
                                </label>
                                <textarea
                                    className="input-field text-xs resize-none"
                                    rows={2}
                                    value={form.notes}
                                    onChange={e => handleFormChange('notes', e.target.value)}
                                    placeholder="Any additional observations…"
                                />
                            </div>

                            {/* Survey Context (collapsible) */}
                            <div>
                                <button
                                    type="button"
                                    className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 transition-colors w-full"
                                    onClick={() => setShowContext(!showContext)}
                                >
                                    <span className="font-mono">{showContext ? '▾' : '▸'}</span>
                                    Survey Context
                                    {(form.enumerator_id || form.time_slot_id || form.survey_session_id) && (
                                        <span className="ml-1 badge badge-green text-[0.55rem]">filled</span>
                                    )}
                                </button>

                                {showContext && (
                                    <div className="mt-2 space-y-2 pl-1 border-l border-surface-700/50">
                                        <div>
                                            <label className="block text-[0.65rem] text-surface-500 mb-0.5">Enumerator ID</label>
                                            <input
                                                className="input-field text-xs"
                                                value={form.enumerator_id}
                                                onChange={e => handleFormChange('enumerator_id', e.target.value)}
                                                placeholder="e.g. ENU-001"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[0.65rem] text-surface-500 mb-0.5">Survey Session ID</label>
                                            <input
                                                className="input-field text-xs"
                                                value={form.survey_session_id}
                                                onChange={e => handleFormChange('survey_session_id', e.target.value)}
                                                placeholder="e.g. SESS-2026-01"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[0.65rem] text-surface-500 mb-0.5">
                                                Time Slot ID
                                                <span className="ml-1 text-surface-600">(used for dup check)</span>
                                            </label>
                                            <input
                                                className={`input-field text-xs font-mono ${duplicateWarning ? 'border-amber-500/60' : ''}`}
                                                value={form.time_slot_id}
                                                onChange={e => handleFormChange('time_slot_id', e.target.value)}
                                                placeholder="e.g. 10:00-10:15"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[0.65rem] text-surface-500 mb-0.5">Location ID</label>
                                            <input
                                                className="input-field text-xs"
                                                value={form.location_id}
                                                onChange={e => handleFormChange('location_id', e.target.value)}
                                                placeholder="e.g. LOC-A"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[0.65rem] text-surface-500 mb-0.5">Timestamp</label>
                                            <input
                                                className="input-field text-xs"
                                                type="datetime-local"
                                                value={form.timestamp}
                                                onChange={e => handleFormChange('timestamp', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[0.65rem] text-surface-500 mb-0.5">Vantage Point</label>
                                            <select
                                                className="input-field text-xs"
                                                value={form.vantage_point}
                                                onChange={e => handleFormChange('vantage_point', e.target.value)}
                                            >
                                                {VANTAGE_POINTS.map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[0.65rem] text-surface-500 mb-0.5">Lat</label>
                                                <input className="input-field font-mono text-xs" value={form.latitude} onChange={e => handleFormChange('latitude', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="block text-[0.65rem] text-surface-500 mb-0.5">Lng</label>
                                                <input className="input-field font-mono text-xs" value={form.longitude} onChange={e => handleFormChange('longitude', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                className="btn-primary w-full"
                                type="submit"
                                disabled={submitting || !form.license_plate.trim() || !!duplicateWarning}
                                title={duplicateWarning ? 'Resolve duplicate before saving' : ''}
                            >
                                {submitting ? 'Saving…' : 'Save Manual Entry'}
                            </button>

                            {duplicateWarning && (
                                <p className="text-[0.65rem] text-amber-500 text-center">
                                    Save disabled — same vehicle already recorded in this slot
                                </p>
                            )}

                            {submitMsg && (
                                <p className={`text-xs ${submitMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {submitMsg.text}
                                </p>
                            )}
                        </form>
                    )}

                    {/* Contextual Tags */}
                    <button
                        className={`w-full btn-secondary ${showTags ? 'border-brand-500/30' : ''}`}
                        onClick={() => setShowTags(!showTags)}
                    >
                        🏷️ {showTags ? 'Hide Tags' : 'Contextual Tags'}
                    </button>

                    {showTags && (
                        <div className="glass-card p-4 space-y-3 animate-fade-in-up">
                            <h3 className="text-xs font-bold text-surface-300 uppercase tracking-wider">Add Tag</h3>
                            <form onSubmit={handleTagSubmit} className="space-y-2">
                                <input type="date" className="input-field" value={tagForm.date} onChange={e => setTagForm(p => ({ ...p, date: e.target.value }))} />
                                <select className="input-field" value={tagForm.tag_type} onChange={e => setTagForm(p => ({ ...p, tag_type: e.target.value }))}>
                                    {TAG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <input className="input-field" placeholder="e.g., Heavy rain, Local festival..." value={tagForm.description} onChange={e => setTagForm(p => ({ ...p, description: e.target.value }))} required />
                                <button className="btn-secondary w-full" type="submit">Add Tag</button>
                            </form>

                            {tags.length > 0 && (
                                <div className="space-y-1.5 mt-3 max-h-48 overflow-y-auto">
                                    {tags.map((t, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs bg-surface-900/40 rounded-lg p-2 justify-between group">
                                            <div className="flex items-start gap-2">
                                                <span className={`badge text-[0.6rem] shrink-0 ${t.tag_type === 'Weather' ? 'badge-blue' :
                                                    t.tag_type === 'Event' ? 'badge-amber' :
                                                        t.tag_type === 'Holiday' ? 'badge-green' :
                                                            'badge-purple'
                                                    }`}>{t.tag_type}</span>
                                                <div>
                                                    <p className="text-surface-300">{t.description}</p>
                                                    <p className="text-surface-500 text-[0.6rem]">{t.date}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRowDelete('contextual_tags', t._id)}
                                                className="text-surface-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                title="Delete tag"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="glass-card p-4 space-y-3">
                        <h3 className="text-xs font-bold text-surface-300 uppercase tracking-wider">Quick Stats</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-400">Total Sessions</span>
                                <span className="font-bold text-white">{sessions.length}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-400">🤖 ML Detected</span>
                                <span className="font-bold text-blue-400">{mlCount}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-400">✏️ Manual Entries</span>
                                <span className="font-bold text-amber-400">{manualCount}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-400">Total Scans</span>
                                <span className="font-bold text-white">{scans.length}</span>
                            </div>
                            <div className="flex justify-between text-xs border-t border-surface-700/30 pt-2">
                                <span className="text-surface-400">Unique Plates</span>
                                <span className="font-bold text-brand-400">{new Set(sessions.map(s => s.license_plate)).size}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-400">Vehicle Types</span>
                                <span className="font-bold text-emerald-400">{new Set(sessions.map(s => s.vehicle_class)).size}</span>
                            </div>
                        </div>

                        {/* Source breakdown legend */}
                        <div className="pt-2 border-t border-surface-700/30 space-y-1.5">
                            <p className="text-[0.6rem] text-surface-500 uppercase tracking-wide">Unified Dataset</p>
                            <div className="flex gap-2 flex-wrap">
                                <span className="badge badge-blue text-[0.6rem]">🤖 ML Detection</span>
                                <span className="badge badge-amber text-[0.6rem]">✏️ Manual Entry</span>
                            </div>
                            <p className="text-[0.6rem] text-surface-600">Both sources feed the same analytics</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
