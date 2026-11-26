import { NavLink } from 'react-router-dom';
import {
    Radio,
    Cpu,
    PackageCheck,
    Terminal,
    Radar,
    BellRing,
    Shield,
    LogOut,
    UserCheck,
    Truck,
    Navigation,
} from 'lucide-react';


export default function Navbar({ wsConnected, activeAlertsCount, user, onLogout }) {
    const perms = user?.permissions || [];
    const can = (p) => perms.includes(p);

    return (
        <header className="navbar">
            <NavLink to="/" className="brand-group">
                <div className="brand-logo">
                    <Radar size={22} />
                </div>
                <div>
                    <div className="brand-title">
                        FleetPulse <span className="brand-tag">OS v2.6</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        RBAC Geospatial Freight & Cold-Chain Control
                    </div>
                </div>
            </NavLink>

            <nav className="nav-links">
                <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Radio size={16} />
                    Live War Room
                </NavLink>

                {(can('shipment:create') || can('dispatch:execute')) && (
                    <NavLink to="/dispatch" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Cpu size={16} />
                        Dispatch Engine
                    </NavLink>
                )}

                <NavLink to="/shipments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <PackageCheck size={16} />
                    Shipments & POD
                </NavLink>

                {can('copilot:query') && (
                    <NavLink to="/copilot" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Terminal size={16} />
                        SQL Copilot
                    </NavLink>
                )}

                {can('rbac:manage') && (
                    <NavLink to="/rbac" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Shield size={16} />
                        RBAC Security
                    </NavLink>
                )}
                {
                    can('asset:manage') && (
                        <NavLink to="/assets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                            <Truck size={16} />
                            Fleet &amp; Hubs
                        </NavLink>
                    )
                }
                {can('telemetry:ingest') && (
                    <NavLink to="/driver" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Navigation size={16} />
                        Driver GPS
                    </NavLink>
                )}
            </nav>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {activeAlertsCount > 0 && (
                    <div className="badge badge-crimson" style={{ padding: '0.38rem 0.68rem' }}>
                        <BellRing size={13} />
                        {activeAlertsCount}
                    </div>
                )}

                <div className={`ws-pill ${wsConnected ? '' : 'offline'}`}>
                    <span
                        className="pulse-dot"
                        style={{ background: wsConnected ? '#a3e635' : '#f43f5e' }}
                    />
                    {wsConnected ? 'WS Live' : 'Offline'}
                </div>

                {/* Active Operator & RBAC Role Badge */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem 0.7rem',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    <UserCheck size={15} color="#f97316" />
                    <div style={{ lineHeight: 1.15 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>{user?.full_name}</div>
                        <div className="mono" style={{ fontSize: '0.66rem', color: '#fb923c' }}>
                            {user?.role_code}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        title="Sign Out / Switch Role"
                        className="btn btn-ghost"
                        style={{ padding: '0.3rem 0.45rem', marginLeft: '0.2rem' }}
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </div>
        </header>
    );
}