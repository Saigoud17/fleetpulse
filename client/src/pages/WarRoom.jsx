import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import {
    Activity,
    Thermometer,
    Fuel,
    Gauge,
    AlertTriangle,
    CheckCircle2,
    Navigation,
    ShieldAlert,
    Radio,
} from 'lucide-react';

const API = '/api';

function createHubIcon(code) {
    return L.divIcon({
        className: '',
        html: `<div style="
      background: rgba(249, 115, 22, 0.24);
      border: 2px solid #f97316;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 6px;
      white-space: nowrap;
      box-shadow: 0 0 14px rgba(249, 115, 22, 0.6);
      transform: translate(-35%, -50%);
    ">${code}</div>`,
    });
}

function createTruckIcon(plate, isBreached, isSelected) {
    const color = isBreached ? '#f43f5e' : isSelected ? '#f97316' : '#a3e635';
    const label = String(plate || 'UNIT').slice(-4);
    return L.divIcon({
        className: '',
        html: `<div style="
      display: flex;
      align-items: center;
      gap: 4px;
      background: #09090b;
      border: 2px solid ${color};
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 7px;
      border-radius: 99px;
      white-space: nowrap;
      box-shadow: 0 0 16px ${color};
      transform: translate(-40%, -50%);
    ">
      <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;"></span>
      ${label}
    </div>`,
    });
}

export default function WarRoom({ hubs, vehicles, shipments, alerts, onRefresh, user }) {
    const [selectedVehicleId, setSelectedVehicleId] = useState(null);

    const perms = user?.permissions || [];
    const canAckAlert = perms.includes('alert:ack');

    const activeShipments = useMemo(
        () => shipments.filter((s) => ['ASSIGNED', 'IN_TRANSIT', 'SLA_BREACHED', 'AT_HUB'].includes(s.status)),
        [shipments]
    );
    const unackAlerts = useMemo(() => alerts.filter((a) => !a.acknowledged), [alerts]);
    const coldChainCount = vehicles.filter((v) => v.is_cold_chain).length;
    const avgUtilization = vehicles.length
        ? Math.round(
            (vehicles.reduce((acc, v) => acc + v.used_capacity_kg / v.max_capacity_kg, 0) / vehicles.length) *
            100
        )
        : 0;

    async function acknowledgeAlert(id) {
        await axios.patch(`${API}/alerts/${id}/ack`);
        await onRefresh();
    }

    return (
        <div className="page-container">
            {/* Visual Command Hero Banner */}
            <div className="hero-banner">
                <div>
                    <div className="hero-eyebrow">
                        <Activity size={14} /> Real-Time Interstate Corridor Telemetry
                    </div>
                    <h1 className="hero-title">National Freight &amp; Cold-Chain War Room</h1>
                    <p className="hero-subtitle">
                        Live hardware GPS telemetry streaming over bidirectional WebSockets with automated geofence detection
                        and cold-chain thermal excursion watchdogs across regional freight corridors.
                    </p>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        padding: '0.55rem 0.95rem',
                        borderRadius: '10px',
                        background: 'rgba(163, 230, 53, 0.1)',
                        border: '1px solid rgba(163, 230, 53, 0.35)',
                        color: '#bef264',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                    }}
                >
                    <Radio size={15} color="#a3e635" />
                    Live Hardware GPS Telemetry Active
                </div>
            </div>

            {/* KPI Telemetry Strip */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-top">
                        <span>Active Corridor Shipments</span>
                        <Navigation size={16} color="#f97316" />
                    </div>
                    <div className="kpi-value">{activeShipments.length}</div>
                    <div className="kpi-sub">
                        {shipments.filter((s) => s.status === 'CREATED').length} awaiting auto-dispatch
                    </div>
                </div>

                <div className="kpi-card emerald">
                    <div className="kpi-top">
                        <span>Fleet Payload Utilization</span>
                        <Gauge size={16} color="#a3e635" />
                    </div>
                    <div className="kpi-value">{avgUtilization}%</div>
                    <div className="kpi-sub">{vehicles.length} heavy &amp; reefer trucks registered</div>
                </div>

                <div className="kpi-card amber">
                    <div className="kpi-top">
                        <span>Cold-Chain Reefer Units</span>
                        <Thermometer size={16} color="#2dd4bf" />
                    </div>
                    <div className="kpi-value">{coldChainCount}</div>
                    <div className="kpi-sub">Continuous thermal threshold monitoring (&lt;8°C)</div>
                </div>

                <div className="kpi-card crimson">
                    <div className="kpi-top">
                        <span>Unacknowledged SLA Alerts</span>
                        <ShieldAlert size={16} color="#f43f5e" />
                    </div>
                    <div className="kpi-value" style={{ color: unackAlerts.length ? '#fda4af' : '#fafafa' }}>
                        {unackAlerts.length}
                    </div>
                    <div className="kpi-sub">Geofence &amp; thermal watchdog rules active</div>
                </div>
            </div>

            {/* Main Split: Live Leaflet Map + Telemetry/Alerts Feed */}
            <div className="warroom-grid">
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Navigation size={17} color="#f97316" /> Live Geospatial Corridor Map
                        </div>
                        <span className="badge badge-cyan">
                            {vehicles.filter((v) => v.status === 'EN_ROUTE').length} Vehicles En Route
                        </span>
                    </div>

                    <div className="map-wrapper">
                        <MapContainer center={[16.2, 77.8]} zoom={6} scrollWheelZoom={true}>
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            {/* Hub Geofence Circles & Markers */}
                            {hubs.map((hub) => (
                                <div key={hub.id}>
                                    <Circle
                                        center={[hub.lat, hub.lng]}
                                        radius={(hub.geofence_radius_km || 3) * 1000}
                                        pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.14, weight: 1.5 }}
                                    />
                                    <Marker position={[hub.lat, hub.lng]} icon={createHubIcon(hub.code)}>
                                        <Popup>
                                            <div style={{ color: '#09090b' }}>
                                                <strong>{hub.name}</strong>
                                                <br />
                                                City: {hub.city} ({hub.code})
                                                <br />
                                                Geofence Radius: {hub.geofence_radius_km} km
                                            </div>
                                        </Popup>
                                    </Marker>
                                </div>
                            ))}

                            {/* Active Route Polylines */}
                            {activeShipments.map((s) =>
                                Array.isArray(s.route_waypoints) && s.route_waypoints.length > 1 ? (
                                    <Polyline
                                        key={s.id}
                                        positions={s.route_waypoints}
                                        pathOptions={{
                                            color: s.status === 'SLA_BREACHED' ? '#f43f5e' : '#f97316',
                                            weight: 3,
                                            opacity: 0.72,
                                            dashArray: '8, 8',
                                        }}
                                    />
                                ) : null
                            )}

                            {/* Live Moving Vehicle Markers */}
                            {vehicles.map((v) => {
                                const linkedShip = activeShipments.find((s) => s.assigned_vehicle_id === v.id);
                                const isBreached =
                                    linkedShip?.status === 'SLA_BREACHED' || (v.is_cold_chain && v.cargo_temp_c > 8.0);
                                return (
                                    <Marker
                                        key={v.id}
                                        position={[v.current_lat, v.current_lng]}
                                        icon={createTruckIcon(v.plate_number, isBreached, selectedVehicleId === v.id)}
                                        eventHandlers={{ click: () => setSelectedVehicleId(v.id) }}
                                    >
                                        <Popup>
                                            <div style={{ minWidth: '185px', color: '#09090b' }}>
                                                <strong>{v.plate_number}</strong> ({v.model})
                                                <br />
                                                Driver: {v.driver_name}
                                                <br />
                                                Speed: <b>{v.speed_kmh} km/h</b> | Fuel: <b>{v.fuel_pct}%</b>
                                                <br />
                                                Cargo Temp: <b>{v.cargo_temp_c}°C</b>
                                                {linkedShip && (
                                                    <>
                                                        <br />
                                                        Manifest: <b>{linkedShip.tracking_code}</b>
                                                    </>
                                                )}
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>

                {/* Right Column: Live Vehicle Telemetry & Watchdog Alerts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* SLA Watchdog Alert Stream */}
                    <div className="panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <AlertTriangle size={17} color="#fbbf24" /> Watchdog SLA &amp; Thermal Alerts
                            </div>
                            <span className="badge badge-slate">{alerts.length} Total</span>
                        </div>

                        <div className="scroll-list" style={{ maxHeight: '215px' }}>
                            {alerts.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem' }}>
                                    All cold-chain &amp; route corridors operating within nominal SLA thresholds.
                                </div>
                            ) : (
                                alerts.map((a) => (
                                    <div
                                        key={a.id}
                                        className={`telemetry-card ${!a.acknowledged ? 'breached' : ''}`}
                                        style={{ cursor: 'default' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                                            <span className={`badge ${a.severity === 'CRITICAL' ? 'badge-crimson' : 'badge-amber'}`}>
                                                {a.alert_type}
                                            </span>
                                            {!a.acknowledged ? (
                                                canAckAlert && (
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                                                        onClick={() => acknowledgeAlert(a.id)}
                                                    >
                                                        Acknowledge
                                                    </button>
                                                )
                                            ) : (
                                                <span
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        color: '#bef264',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '3px',
                                                    }}
                                                >
                                                    <CheckCircle2 size={12} /> Acked
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.81rem', marginTop: '0.45rem', lineHeight: 1.4 }}>{a.message}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Live Vehicle Telemetry Feed */}
                    <div className="panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Activity size={17} color="#a3e635" /> Live Fleet Sensor Stream
                            </div>
                            <span className="badge badge-emerald">Hardware GPS</span>
                        </div>

                        <div className="scroll-list" style={{ maxHeight: '265px' }}>
                            {vehicles.map((v) => {
                                const isBreached = v.is_cold_chain && v.cargo_temp_c > 8.0;
                                return (
                                    <div
                                        key={v.id}
                                        className={`telemetry-card ${selectedVehicleId === v.id ? 'selected' : ''} ${isBreached ? 'breached' : ''
                                            }`}
                                        onClick={() => setSelectedVehicleId(v.id)}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <span className="mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                                                    {v.plate_number}
                                                </span>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: '0.5rem' }}>
                                                    {v.driver_name}
                                                </span>
                                            </div>
                                            <span
                                                className={`badge ${v.status === 'EN_ROUTE'
                                                    ? 'badge-emerald'
                                                    : v.status === 'AT_HUB'
                                                        ? 'badge-cyan'
                                                        : 'badge-slate'
                                                    }`}
                                            >
                                                {v.status}
                                            </span>
                                        </div>

                                        <div className="sensor-strip mono">
                                            <div>
                                                <Gauge size={12} style={{ marginRight: '4px', color: '#fb923c' }} />
                                                {v.speed_kmh} km/h
                                            </div>
                                            <div style={{ color: isBreached ? '#fda4af' : '#bef264', fontWeight: 700 }}>
                                                <Thermometer size={12} style={{ marginRight: '4px' }} />
                                                {v.cargo_temp_c}°C
                                            </div>
                                            <div>
                                                <Fuel size={12} style={{ marginRight: '4px', color: '#fbbf24' }} />
                                                {v.fuel_pct}%
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}