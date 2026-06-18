import { useState, useRef, useCallback } from 'react'
import { uploadImages } from '../lib/api'

const VANTAGE_POINTS = [
    'Zone A - North Gate',
    'Zone B - East Lot',
    'Zone C - South Field',
    'Zone D - West Entry',
    'Zone E - Central',
    'Zone F - Overflow',
]

function roundTo30Min(date) {
    const d = new Date(date)
    const mins = d.getMinutes()
    d.setMinutes(mins >= 30 ? 30 : 0, 0, 0)
    // Use local time components instead of toISOString() which converts to UTC
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
}

export default function UploadPage() {
    const [files, setFiles] = useState([])
    const [previews, setPreviews] = useState([])
    const [agentId, setAgentId] = useState('agent-001')
    const [vantagePoint, setVantagePoint] = useState(VANTAGE_POINTS[0])
    const [timestamp, setTimestamp] = useState(roundTo30Min(new Date()))
    const [lat, setLat] = useState('28.6139')
    const [lng, setLng] = useState('77.2090')
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef(null)

    const handleFiles = useCallback((newFiles) => {
        const fileArr = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
        if (fileArr.length === 0) return
        setFiles(prev => [...prev, ...fileArr])
        const newPreviews = fileArr.map(f => ({ name: f.name, url: URL.createObjectURL(f), size: f.size }))
        setPreviews(prev => [...prev, ...newPreviews])
        setResult(null)
        setError(null)
    }, [])

    const removeFile = (idx) => {
        URL.revokeObjectURL(previews[idx].url)
        setFiles(prev => prev.filter((_, i) => i !== idx))
        setPreviews(prev => prev.filter((_, i) => i !== idx))
    }

    const handleUpload = async () => {
        if (files.length === 0) return
        setUploading(true)
        setProgress(10)
        setError(null)
        setResult(null)

        try {
            setProgress(30)
            const res = await uploadImages(files, {
                agentId,
                vantagePoint,
                timestamp: new Date(timestamp).toISOString(),
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
            })
            setProgress(100)
            setResult(res)
            // Clear after success
            setTimeout(() => {
                previews.forEach(p => URL.revokeObjectURL(p.url))
                setFiles([])
                setPreviews([])
                setProgress(0)
            }, 3000)
        } catch (e) {
            setError(e.message || 'Upload failed. Make sure the backend is running.')
            setProgress(0)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8 animate-fade-in-up">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                    <span className="gradient-text">Field Agent Upload</span>
                </h1>
                <p className="text-surface-400 mt-2 text-sm sm:text-base">
                    Capture and upload batch images from your vantage point for automated vehicle detection.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
                {/* Left: Upload Area */}
                <div className="lg:col-span-3 space-y-5">
                    {/* Drop Zone */}
                    <div
                        className={`drop-zone p-8 text-center ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                        onClick={() => inputRef.current?.click()}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFiles(e.target.files)}
                        />
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center">
                                <svg width="32" height="32" fill="none" stroke="#3290ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-white font-semibold">Drop images here or click to browse</p>
                                <p className="text-surface-500 text-xs mt-1">Supports JPG, PNG, WebP — Multiple files allowed</p>
                            </div>
                        </div>
                    </div>

                    {/* Previews */}
                    {previews.length > 0 && (
                        <div className="glass-card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-surface-300">
                                    {previews.length} image{previews.length > 1 ? 's' : ''} selected
                                </h3>
                                <button
                                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                    onClick={() => {
                                        previews.forEach(p => URL.revokeObjectURL(p.url))
                                        setFiles([]); setPreviews([])
                                    }}
                                >
                                    Clear all
                                </button>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {previews.map((p, i) => (
                                    <div key={i} className="relative group rounded-lg overflow-hidden aspect-square bg-surface-900">
                                        <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                                                className="w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center text-sm hover:bg-red-500 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-1.5">
                                            <p className="text-[0.6rem] text-white/80 truncate">{p.name}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {uploading && (
                        <div className="glass-card p-4 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-surface-400">Processing images through CV pipeline...</span>
                                <span className="text-brand-400 font-mono">{progress}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="glass-card p-5 border-emerald-500/30 animate-fade-in-up">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-lg">✅</span>
                                <h3 className="text-sm font-bold text-emerald-400">Upload Successful</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-surface-900/50 rounded-lg p-3">
                                    <p className="text-surface-500">Files Processed</p>
                                    <p className="text-xl font-bold text-white mt-1">{result.files_processed}</p>
                                </div>
                                <div className="bg-surface-900/50 rounded-lg p-3">
                                    <p className="text-surface-500">Vehicles Detected</p>
                                    <p className="text-xl font-bold gradient-text mt-1">{result.total_vehicles_detected}</p>
                                </div>
                            </div>
                            {result.results?.map((r, i) => (
                                <div key={i} className="mt-3 border-t border-surface-700/30 pt-3">
                                    <p className="text-xs text-surface-400 mb-2">{r.file} — {r.vehicles_detected} vehicles</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {r.detections?.map((d, j) => (
                                            <span key={j} className={`badge ${d.vehicle_class === 'Car' ? 'badge-blue' :
                                                d.vehicle_class === 'SUV' ? 'badge-green' :
                                                    d.vehicle_class === 'Truck' ? 'badge-amber' :
                                                        'badge-purple'
                                                }`}>
                                                {d.vehicle_class} · {d.license_plate}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="glass-card p-4 border-red-500/30">
                            <div className="flex items-center gap-2">
                                <span>⚠️</span>
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Metadata Form */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="glass-card p-5 space-y-4">
                        <h3 className="text-sm font-bold text-surface-200 tracking-wide uppercase">Capture Metadata</h3>

                        <div>
                            <label className="block text-xs text-surface-400 mb-1.5 font-medium">Agent ID</label>
                            <input
                                type="text"
                                className="input-field"
                                value={agentId}
                                onChange={(e) => setAgentId(e.target.value)}
                                placeholder="agent-001"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-surface-400 mb-1.5 font-medium">Vantage Point</label>
                            <select
                                className="input-field"
                                value={vantagePoint}
                                onChange={(e) => setVantagePoint(e.target.value)}
                            >
                                {VANTAGE_POINTS.map(vp => (
                                    <option key={vp} value={vp}>{vp}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-surface-400 mb-1.5 font-medium">Timestamp (30-min interval)</label>
                            <input
                                type="datetime-local"
                                className="input-field"
                                value={timestamp}
                                onChange={(e) => setTimestamp(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-surface-400 mb-1.5 font-medium">Latitude</label>
                                <input type="text" className="input-field font-mono text-xs" value={lat} onChange={e => setLat(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs text-surface-400 mb-1.5 font-medium">Longitude</label>
                                <input type="text" className="input-field font-mono text-xs" value={lng} onChange={e => setLng(e.target.value)} />
                            </div>
                        </div>

                        <button
                            className="btn-primary w-full mt-2"
                            onClick={handleUpload}
                            disabled={files.length === 0 || uploading}
                        >
                            {uploading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
                                    </svg>
                                    Processing...
                                </span>
                            ) : (
                                `Upload ${files.length || ''} Image${files.length !== 1 ? 's' : ''}`
                            )}
                        </button>
                    </div>

                    {/* Info Card */}
                    <div className="glass-card p-4 text-xs text-surface-400 space-y-2">
                        <h4 className="font-semibold text-surface-300 flex items-center gap-1.5">
                            <span>💡</span> Survey Protocol
                        </h4>
                        <ul className="space-y-1.5 list-disc list-inside">
                            <li>Capture images every <strong className="text-white">30 minutes</strong></li>
                            <li>Use multiple vantage points for coverage</li>
                            <li>Include rear views for plate detection</li>
                            <li>Aim for minimum <strong className="text-white">3 photos per interval</strong></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
