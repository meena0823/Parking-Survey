import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const links = [
    { to: '/', label: 'Upload', icon: '📷' },
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/database', label: 'Database', icon: '🗄️' },
]

export default function Navbar() {
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-surface-950/80 border-b border-surface-700/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <NavLink to="/" className="flex items-center gap-2.5 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
                            PS
                        </div>
                        <div>
                            <span className="text-base font-bold gradient-text tracking-tight">ParkSense</span>
                            <p className="text-[0.6rem] text-surface-400 -mt-0.5 leading-tight">Spatio-Temporal Survey</p>
                        </div>
                    </NavLink>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-1">
                        {links.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                end={link.to === '/'}
                                className={({ isActive }) =>
                                    `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                        ? 'bg-brand-600/15 text-brand-400 shadow-inner'
                                        : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                    }`
                                }
                            >
                                <span className="text-base">{link.icon}</span>
                                {link.label}
                            </NavLink>
                        ))}
                    </div>

                    {/* Status Dot */}
                    <div className="hidden md:flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow" />
                        <span className="text-xs text-surface-400">System Active</span>
                    </div>

                    {/* Mobile Hamburger */}
                    <button
                        className="md:hidden p-2 text-surface-400 hover:text-white transition-colors"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            {mobileOpen ? (
                                <>
                                    <line x1="4" y1="4" x2="18" y2="18" />
                                    <line x1="18" y1="4" x2="4" y2="18" />
                                </>
                            ) : (
                                <>
                                    <line x1="3" y1="6" x2="19" y2="6" />
                                    <line x1="3" y1="11" x2="19" y2="11" />
                                    <line x1="3" y1="16" x2="19" y2="16" />
                                </>
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <div className="md:hidden border-t border-surface-700/40 bg-surface-950/95 backdrop-blur-xl">
                    <div className="px-4 py-3 space-y-1">
                        {links.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                end={link.to === '/'}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                                        ? 'bg-brand-600/15 text-brand-400'
                                        : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                    }`
                                }
                            >
                                <span className="text-lg">{link.icon}</span>
                                {link.label}
                            </NavLink>
                        ))}
                    </div>
                </div>
            )}
        </nav>
    )
}
