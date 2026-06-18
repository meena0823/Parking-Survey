import { useState, useEffect, useRef } from 'react'
import { getAnalytics, getTimelapse } from '../lib/api'

/* ───────────────────── Utility: draw donut chart on canvas ───────────────── */
function drawDonut(canvas, data, colors) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h / 2
    const r = Math.min(w, h) / 2 - 20, ir = r * 0.6
    ctx.clearRect(0, 0, w, h)
    const total = data.reduce((s, d) => s + d.value, 0) || 1
    let angle = -Math.PI / 2
    data.forEach((d, i) => {
        const slice = (d.value / total) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(cx, cy, r, angle, angle + slice)
        ctx.arc(cx, cy, ir, angle + slice, angle, true)
        ctx.closePath()
        ctx.fillStyle = colors[i % colors.length]
        ctx.fill()
        // label
        const mid = angle + slice / 2
        const lx = cx + Math.cos(mid) * (r + ir) / 2
        const ly = cy + Math.sin(mid) * (r + ir) / 2
        if (d.value / total > 0.05) {
            ctx.fillStyle = '#fff'
            ctx.font = 'bold 11px Inter, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(`${Math.round(d.value / total * 100)}%`, lx, ly)
        }
        angle += slice
    })
    // Center text
    ctx.fillStyle = '#ebeef3'
    ctx.font = 'bold 22px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(total.toString(), cx, cy - 6)
    ctx.fillStyle = '#627392'
    ctx.font = '10px Inter, sans-serif'
    ctx.fillText('vehicles', cx, cy + 12)
}

/* ───────────────────── Utility: draw bar chart on canvas ─────────────────── */
function drawBars(canvas, data, colors) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const max = Math.max(...data.map(d => d.value), 1)
    const barW = Math.min(60, (w - 40) / data.length - 12)
    const baseY = h - 30
    const chartH = baseY - 20
    data.forEach((d, i) => {
        const barH = (d.value / max) * chartH
        const x = 30 + i * (barW + 12)
        // Bar
        const grad = ctx.createLinearGradient(x, baseY - barH, x, baseY)
        grad.addColorStop(0, colors[i % colors.length])
        grad.addColorStop(1, colors[i % colors.length] + '40')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, baseY - barH, barW, barH, [6, 6, 0, 0])
        ctx.fill()
        // Value
        ctx.fillStyle = '#ebeef3'
        ctx.font = 'bold 12px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(d.value.toString(), x + barW / 2, baseY - barH - 8)
        // Label
        ctx.fillStyle = '#627392'
        ctx.font = '9px Inter, sans-serif'
        ctx.fillText(d.label, x + barW / 2, baseY + 14)
    })
}

/* ───────────────────── KPI Card Component ───────────────────────────────── */
function KpiCard({ title, value, subtitle, icon, color = 'blue' }) {
    const colorMap = {
        blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
        green: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
        amber: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
        purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
        red: 'from-red-500/10 to-red-600/5 border-red-500/20',
    }
    return (
        <div className={`glass-card p-5 bg-gradient-to-br ${colorMap[color]} animate-fade-in-up`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs text-surface-400 font-medium uppercase tracking-wider">{title}</p>
                    <p className="text-2xl font-extrabold text-white mt-1">{value}</p>
                    {subtitle && <p className="text-xs text-surface-500 mt-1">{subtitle}</p>}
                </div>
                <span className="text-2xl">{icon}</span>
            </div>
        </div>
    )
}

/* ───────────────────── Heatmap Component ────────────────────────────────── */
function HeatmapCard({ data }) {
    const getColor = (intensity) => {
        if (intensity > 0.8) return 'bg-red-500/80'
        if (intensity > 0.6) return 'bg-orange-500/70'
        if (intensity > 0.4) return 'bg-amber-500/60'
        if (intensity > 0.2) return 'bg-emerald-500/50'
        return 'bg-blue-500/30'
    }
    return (
        <div className="glass-card p-5 animate-fade-in-up">
            <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                <span>🗺️</span> Occupancy Heatmap
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.map((zone, i) => (
                    <div
                        key={i}
                        className={`heatmap-cell ${getColor(zone.intensity)} p-3 flex flex-col justify-between min-h-[80px]`}
                    >
                        <p className="text-[0.65rem] font-semibold text-white/90">{zone.zone}</p>
                        <div className="mt-auto">
                            <p className="text-lg font-bold text-white">{zone.count}</p>
                            <p className="text-[0.6rem] text-white/60">vehicles</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-2 mt-3 text-[0.6rem] text-surface-500">
                <span>Low</span>
                <div className="flex gap-0.5 flex-1">
                    {['bg-blue-500/30', 'bg-emerald-500/50', 'bg-amber-500/60', 'bg-orange-500/70', 'bg-red-500/80'].map((c, i) => (
                        <div key={i} className={`h-2 flex-1 rounded-sm ${c}`} />
                    ))}
                </div>
                <span>High</span>
            </div>
        </div>
    )
}

/* ───────────────────── Environmental Impact Card ────────────────────────── */
function EnvironmentalCard({ data }) {
    return (
        <div className="glass-card p-5 bg-gradient-to-br from-emerald-500/5 to-teal-600/5 border-emerald-500/20 animate-fade-in-up">
            <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                <span>🌱</span> Environmental Impact
            </h3>
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-900/40 rounded-xl p-3">
                    <p className="text-[0.65rem] text-surface-500 uppercase">Emission Index</p>
                    <p className="text-xl font-bold gradient-text-warm mt-1">{data.emission_index}</p>
                </div>
                <div className="bg-surface-900/40 rounded-xl p-3">
                    <p className="text-[0.65rem] text-surface-500 uppercase">Wear Index</p>
                    <p className="text-xl font-bold text-amber-400 mt-1">{data.wear_index}</p>
                </div>
                <div className="bg-surface-900/40 rounded-xl p-3">
                    <p className="text-[0.65rem] text-surface-500 uppercase">Heavy Vehicles</p>
                    <p className="text-xl font-bold text-red-400 mt-1">{data.heavy_vehicle_percentage}%</p>
                </div>
                <div className="bg-surface-900/40 rounded-xl p-3">
                    <p className="text-[0.65rem] text-surface-500 uppercase">Green Score</p>
                    <p className="text-xl font-bold gradient-text-green mt-1">{data.green_score}</p>
                </div>
            </div>
            <p className="text-[0.65rem] text-surface-500 mt-3">
                ⚖️ HCV weighted 3.2× higher than standard cars. Motorcycles weighted at 0.5×.
            </p>
        </div>
    )
}

/* ───────────────────── Coverage Map Component ───────────────────────────── */
function CoverageMap({ data }) {
    return (
        <div className="glass-card p-5 animate-fade-in-up">
            <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                <span>📡</span> Coverage Mapping
            </h3>
            {/* SVG Map */}
            <div className="relative bg-surface-900/50 rounded-xl p-4 aspect-[4/3] overflow-hidden">
                <svg viewBox="0 0 400 300" className="w-full h-full">
                    {/* Land boundary */}
                    <rect x="30" y="20" width="340" height="260" rx="12" fill="none" stroke="#404b63" strokeWidth="1" strokeDasharray="4 4" />
                    <text x="200" y="15" textAnchor="middle" fill="#627392" fontSize="9">Survey Area Boundary</text>
                    {/* Grid */}
                    {[80, 140, 200, 260, 320].map(x => (
                        <line key={`vl${x}`} x1={x} y1="20" x2={x} y2="280" stroke="#1e2433" strokeWidth="0.5" />
                    ))}
                    {[80, 140, 200].map(y => (
                        <line key={`hl${y}`} x1="30" y1={y} x2="370" y2={y} stroke="#1e2433" strokeWidth="0.5" />
                    ))}
                    {/* Vantage Points */}
                    {data.vantage_points?.map((vp, i) => {
                        const positions = [
                            { x: 100, y: 60 }, { x: 300, y: 80 }, { x: 200, y: 240 },
                            { x: 70, y: 180 }, { x: 200, y: 130 }, { x: 320, y: 200 },
                        ]
                        const pos = positions[i] || { x: 200, y: 150 }
                        return (
                            <g key={i}>
                                {/* Range circle */}
                                <circle cx={pos.x} cy={pos.y} r="45" fill={vp.active ? 'rgba(50,144,255,0.08)' : 'rgba(239,68,68,0.06)'} stroke={vp.active ? '#3290ff' : '#ef4444'} strokeWidth="0.8" strokeDasharray={vp.active ? 'none' : '3 3'} />
                                {/* Dot */}
                                <circle cx={pos.x} cy={pos.y} r="6" fill={vp.active ? '#3290ff' : '#ef4444'} />
                                <circle cx={pos.x} cy={pos.y} r="3" fill="white" />
                                {/* Label */}
                                <text x={pos.x} y={pos.y + 18} textAnchor="middle" fill={vp.active ? '#8eccff' : '#f87171'} fontSize="7.5" fontWeight="600">
                                    {vp.name.replace('Zone ', '').split(' - ')[0]}
                                </text>
                            </g>
                        )
                    })}
                </svg>
            </div>
            {/* Stats */}
            <div className="flex items-center justify-between mt-3 text-xs">
                <span className="badge badge-blue">Coverage: {data.coverage_percentage}%</span>
                {data.blind_spots?.length > 0 && (
                    <span className="badge badge-red">{data.blind_spots.length} blind spot{data.blind_spots.length > 1 ? 's' : ''}</span>
                )}
            </div>
            {data.blind_spots?.length > 0 && (
                <div className="mt-2 text-[0.65rem] text-surface-500">
                    <span className="font-semibold text-red-400">Blind spots: </span>
                    {data.blind_spots.join(', ')}
                </div>
            )}
        </div>
    )
}

/* ───────────────────── Time-Lapse Viewer ────────────────────────────────── */
function TimeLapseViewer() {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [frames, setFrames] = useState([])
    const [currentFrame, setCurrentFrame] = useState(0)
    const [playing, setPlaying] = useState(false)
    const intervalRef = useRef(null)

    const loadFrames = async () => {
        try {
            const data = await getTimelapse(date)
            setFrames(data.frames || [])
            setCurrentFrame(0)
            setPlaying(false)
        } catch { setFrames([]) }
    }

    useEffect(() => {
        if (playing && frames.length > 1) {
            intervalRef.current = setInterval(() => {
                setCurrentFrame(prev => (prev + 1) % frames.length)
            }, 800)
        }
        return () => clearInterval(intervalRef.current)
    }, [playing, frames.length])

    return (
        <div className="glass-card p-5 animate-fade-in-up">
            <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                <span>🎬</span> Daily Time-Lapse
            </h3>
            <div className="flex gap-2 mb-3">
                <input type="date" className="input-field flex-1" value={date} onChange={e => setDate(e.target.value)} />
                <button className="btn-secondary" onClick={loadFrames}>Load</button>
            </div>
            {frames.length > 0 ? (
                <div>
                    <div className="bg-surface-900/60 rounded-xl overflow-hidden aspect-video flex items-center justify-center mb-3">
                        <img
                            src={frames[currentFrame]?.image_url}
                            alt={`Frame ${currentFrame + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none' }}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="btn-secondary text-sm px-3" onClick={() => setPlaying(!playing)}>
                            {playing ? '⏸' : '▶️'}
                        </button>
                        <input
                            type="range" min="0" max={frames.length - 1} value={currentFrame}
                            onChange={e => setCurrentFrame(parseInt(e.target.value))}
                            className="flex-1 accent-brand-500"
                        />
                        <span className="text-xs text-surface-400 font-mono">{currentFrame + 1}/{frames.length}</span>
                    </div>
                    <p className="text-[0.65rem] text-surface-500 mt-2">
                        {frames[currentFrame]?.timestamp} · {frames[currentFrame]?.vantage_point} · {frames[currentFrame]?.vehicle_count} vehicles
                    </p>
                </div>
            ) : (
                <div className="text-center py-8 text-surface-500 text-sm">
                    <p>Select a date and press Load to view captured frames</p>
                    <p className="text-xs mt-1">Frames are collected every 30 minutes by field agents</p>
                </div>
            )}
        </div>
    )
}

/* ───────────────────── Main Dashboard Page ──────────────────────────────── */
export default function DashboardPage() {
    const [analytics, setAnalytics] = useState(null)
    const [loading, setLoading] = useState(true)
    const donutRef = useRef(null)
    const barRef = useRef(null)

    const donutColors = ['#3290ff', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4']
    const barColors = ['#10b981', '#3290ff', '#f59e0b']

    const fetchData = async () => {
        try {
            const data = await getAnalytics()
            setAnalytics(data)
        } catch (err) {
            console.error('Analytics fetch failed:', err)
            // Use demo data
            setAnalytics({
                total_sessions: 142,
                total_scans: 38,
                vehicle_mix: [
                    { type: 'Car', count: 68, percentage: 47.9 },
                    { type: 'SUV', count: 35, percentage: 24.6 },
                    { type: 'Motorcycle', count: 24, percentage: 16.9 },
                    { type: 'Truck', count: 15, percentage: 10.6 },
                ],
                duration_profile: { short_term_under_1h: 45, medium_1h_to_4h: 62, long_term_over_4h: 35, average_hours: 2.4 },
                turnover_rate: 2.8,
                heatmap: [
                    { zone: 'Zone A - North Gate', count: 42, intensity: 0.92 },
                    { zone: 'Zone B - East Lot', count: 35, intensity: 0.76 },
                    { zone: 'Zone C - South Field', count: 28, intensity: 0.61 },
                    { zone: 'Zone D - West Entry', count: 18, intensity: 0.39 },
                    { zone: 'Zone E - Central', count: 12, intensity: 0.26 },
                    { zone: 'Zone F - Overflow', count: 7, intensity: 0.15 },
                ],
                environmental: { emission_index: 112.4, wear_index: 138.6, heavy_vehicle_percentage: 10.6, green_score: 72.1 },
                coverage: {
                    vantage_points: [
                        { name: 'Zone A - North Gate', active: true },
                        { name: 'Zone B - East Lot', active: true },
                        { name: 'Zone C - South Field', active: true },
                        { name: 'Zone D - West Entry', active: false },
                        { name: 'Zone E - Central', active: true },
                        { name: 'Zone F - Overflow', active: false },
                    ],
                    coverage_percentage: 66.7,
                    blind_spots: ['Zone D - West Entry', 'Zone F - Overflow'],
                },
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    // Draw charts when data is ready
    useEffect(() => {
        if (!analytics) return
        if (donutRef.current) {
            const data = analytics.vehicle_mix.map(v => ({ label: v.type, value: v.count }))
            drawDonut(donutRef.current, data, donutColors)
        }
        if (barRef.current) {
            const dp = analytics.duration_profile
            drawBars(barRef.current, [
                { label: '< 1h', value: dp.short_term_under_1h },
                { label: '1–4h', value: dp.medium_1h_to_4h },
                { label: '> 4h', value: dp.long_term_over_4h },
            ], barColors)
        }
    }, [analytics])

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass-card p-5 h-28 shimmer-loading" />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                        <span className="gradient-text">Analytics Dashboard</span>
                    </h1>
                    <p className="text-surface-400 mt-1 text-sm">Real-time parking survey insights and urban planning metrics</p>
                </div>
                <button className="btn-secondary mt-3 sm:mt-0" onClick={fetchData}>🔄 Refresh</button>
            </div>

            {/* KPI Row */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
                <KpiCard title="Total Sessions" value={analytics.total_sessions} subtitle="Unique vehicles" icon="🚗" color="blue" />
                <KpiCard title="Total Scans" value={analytics.total_scans} subtitle="Images processed" icon="📷" color="green" />
                <KpiCard title="Turnover Rate" value={`${analytics.turnover_rate}×`} subtitle="Avg reuse per spot" icon="🔄" color="amber" />
                <KpiCard title="Avg Duration" value={`${analytics.duration_profile.average_hours}h`} subtitle="Parking time" icon="⏱️" color="purple" />
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2 mb-6">
                {/* Vehicle Mix Donut */}
                <div className="glass-card p-5 animate-fade-in-up">
                    <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                        <span>🚘</span> Vehicle Mix
                    </h3>
                    <div className="flex items-center gap-6">
                        <canvas ref={donutRef} width={180} height={180} className="flex-shrink-0" />
                        <div className="space-y-2 flex-1">
                            {analytics.vehicle_mix.map((v, i) => (
                                <div key={v.type} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm" style={{ background: donutColors[i] }} />
                                    <span className="text-xs text-surface-300 flex-1">{v.type}</span>
                                    <span className="text-xs font-semibold text-white">{v.count}</span>
                                    <span className="text-[0.65rem] text-surface-500">{v.percentage}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Duration Bar Chart */}
                <div className="glass-card p-5 animate-fade-in-up">
                    <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                        <span>⏱️</span> Duration Profiling
                    </h3>
                    <canvas ref={barRef} width={300} height={180} className="w-full" />
                    <div className="flex gap-4 mt-3 text-[0.65rem] text-surface-500 justify-center">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Short-term</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Medium</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Long-term</span>
                    </div>
                </div>
            </div>

            {/* Heatmap + Environmental */}
            <div className="grid gap-6 lg:grid-cols-2 mb-6">
                <HeatmapCard data={analytics.heatmap} />
                <EnvironmentalCard data={analytics.environmental} />
            </div>

            {/* Data Sources Breakdown */}
            {analytics.source_breakdown && (
                <div className="glass-card p-5 mb-6 animate-fade-in-up bg-gradient-to-br from-cyan-500/5 to-blue-600/5 border-cyan-500/20">
                    <h3 className="text-sm font-bold text-surface-200 mb-4 flex items-center gap-2">
                        <span>📊</span> Data Sources — Unified Dataset
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-surface-900/40 rounded-xl p-4 text-center">
                            <p className="text-[0.65rem] text-surface-500 uppercase mb-1">ML Detections</p>
                            <p className="text-2xl font-extrabold text-blue-400">{analytics.source_breakdown.ml_detection}</p>
                            <span className="badge badge-blue text-[0.6rem] mt-1">🤖 Auto</span>
                        </div>
                        <div className="bg-surface-900/40 rounded-xl p-4 text-center">
                            <p className="text-[0.65rem] text-surface-500 uppercase mb-1">Manual Entries</p>
                            <p className="text-2xl font-extrabold text-amber-400">{analytics.source_breakdown.manual_entry}</p>
                            <span className="badge badge-amber text-[0.6rem] mt-1">✏️ Manual</span>
                        </div>
                        <div className="bg-surface-900/40 rounded-xl p-4 text-center">
                            <p className="text-[0.65rem] text-surface-500 uppercase mb-1">Total (Deduped)</p>
                            <p className="text-2xl font-extrabold text-white">{analytics.total_sessions}</p>
                            <span className="text-[0.6rem] text-surface-500 mt-1 block">unique vehicles</span>
                        </div>
                        <div className="bg-surface-900/40 rounded-xl p-4 text-center">
                            <p className="text-[0.65rem] text-surface-500 uppercase mb-1">Manual %</p>
                            <p className="text-2xl font-extrabold text-emerald-400">
                                {analytics.total_sessions > 0
                                    ? Math.round(analytics.source_breakdown.manual_entry / analytics.total_sessions * 100)
                                    : 0}%
                            </p>
                            <span className="text-[0.6rem] text-surface-500 mt-1 block">of total</span>
                        </div>
                    </div>
                    <p className="text-[0.65rem] text-surface-500 mt-3">
                        ⓘ Both ML Detection and Manual Entry feed the same deduplicated <code className="text-brand-400">parking_sessions</code> dataset.
                        Duplicate plates within a slot are blocked at entry.
                    </p>
                </div>
            )}

            {/* Coverage + Time-Lapse */}
            <div className="grid gap-6 lg:grid-cols-2 mb-6">
                <CoverageMap data={analytics.coverage} />
                <TimeLapseViewer />
            </div>
        </div>
    )
}
