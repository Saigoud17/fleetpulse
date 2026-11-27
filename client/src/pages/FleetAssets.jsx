import { useState } from 'react';
import axios from 'axios';
import { MapPin, Truck, PlusCircle, Snowflake, Wrench, CheckCircle2 } from 'lucide-react';

const API = '/api';

export default function FleetAssets({ hubs, vehicles, onRefresh }) {
    // Hub Form State
    const [hubCode, setHubCode] = useState('');
    const [hubName, setHubName] = useState('');
    const [hubCity, setHubCity] = useState('');
    const [hubLat, setHubLat] = useState('');
    const [hubLng, setHubLng] = useState('');
    const [geofenceKm, setGeofenceKm] = useState(3.0);
    const [savingHub, setSavingHub] = useState(false);

    // Vehicle Form State
    const [plate, setPlate] = useState('');
    const [model, setModel] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [isColdChain, setIsColdChain] = useState(true);
    const [maxCapacity, setMaxCapacity] = useState(12000);
    const [homeHubId, setHomeHubId] = useState(hubs[0]?.id || 1);
    const [savingVeh, setSavingVeh] = useState(false);

    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleCreateHub = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setSavingHub(true);
        try {
            await axios.post(`${API}/hubs`, {
                code: hubCode,
                name: hubName,
                city: hubCity,
                lat: Number(hubLat),
                lng: Number(hubLng),
                geofence_radius_km: Number(geofenceKm),
            });
            setHubCode('');
            setHubName('');
            setHubCity('');
            setHubLat('');
            setHubLng('');
            setSuccessMsg('Regional logistics hub and geofence registered.');
            await onRefresh();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to register hub');
        } finally {
            setSavingHub(false);
        }
    };

    const handleCreateVehicle = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setSavingVeh(true);
        try {
            await axios.post(`${API}/vehicles`, {
                plate_number: plate,
                model,
                driver_name: driverName,
                driver_phone: driverPhone,
                is_cold_chain: isColdChain,
                max_capacity_kg: Number(maxCapacity),
                home_hub_id: Number(homeHubId),
            });
            setPlate('');
            setModel('');
            setDriverName('');
            setDriverPhone('');
            setSuccessMsg('Fleet vehicle onboarded to standby dispatch pool.');
            await onRefresh();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to onboard vehicle');
        } finally {
            setSavingVeh(false);
        }
    };

    const toggleMaintenance = async (v) => {
        const nextStatus = v.status === 'MAINTENANCE' ? 'IDLE' : 'MAINTENANCE';
        setErrorMsg('');
        try {
            await axios.patch(`${API}/vehicles/${v.id}/status`, { status: nextStatus });
            await onRefresh();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to update vehicle status');
        }
    };

    return (
        <div className="page-container">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Regional Hubs &amp; Fleet Asset Registry
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    Onboard physical distribution hubs with GPS geofences and register heavy freight or refrigerated trucks into the dispatch pool.
                </p>
            </div>

            {errorMsg && (
                <div className="telemetry-card breached" style={{ marginBottom: '1rem', color: '#fda4af', fontSize: '0.86rem' }}>
                    {errorMsg}
                </div>
            )}

            {successMsg && (
                <div
                    style={{
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        background: 'rgba(163, 230, 53, 0.12)',
                        border: '1px solid rgba(163, 230, 53, 0.35)',
                        color: '#bef264',
                        fontSize: '0.86rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}
                >
                    <CheckCircle2 size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Forms Row */}
            <div className="two-col-grid" style={{ marginBottom: '1.5rem' }}>
                {/* Register Regional Hub */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <MapPin size={17} color="#f97316" />
                            Register Regional Logistics Hub
                        </div>
                    </div>
                    <form onSubmit={handleCreateHub} style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Hub Code</label>
                                <input
                                    type="text"
                                    className="form-input mono"
                                    placeholder="PUN-CHK"
                                    value={hubCode}
                                    onChange={(e) => setHubCode(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">City</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Pune"
                                    value={hubCity}
                                    onChange={(e) => setHubCity(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Facility Name</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Chakan MIDC Cold & Freight Terminal"
                                value={hubName}
                                onChange={(e) => setHubName(e.target.value)}
                                required
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Latitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    className="form-input mono"
                                    placeholder="18.7606"
                                    value={hubLat}
                                    onChange={(e) => setHubLat(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Longitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    className="form-input mono"
                                    placeholder="73.8636"
                                    value={hubLng}
                                    onChange={(e) => setHubLng(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Geofence (km)</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="15"
                                    className="form-input mono"
                                    value={geofenceKm}
                                    onChange={(e) => setGeofenceKm(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={savingHub}>
                            <PlusCircle size={16} />
                            {savingHub ? 'Registering Hub...' : 'Add Hub & Activate Geofence'}
                        </button>
                    </form>
                </div>

                {/* Onboard Fleet Truck */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Truck size={17} color="#a3e635" />
                            Onboard Fleet Vehicle
                        </div>
                    </div>
                    <form onSubmit={handleCreateVehicle} style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Registration Plate</label>
                                <input
                                    type="text"
                                    className="form-input mono"
                                    placeholder="MH-12-PQ-5410"
                                    value={plate}
                                    onChange={(e) => setPlate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Truck Chassis / Model</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="BharatBenz 3523R Reefer"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Assigned Driver Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Vikram Desai"
                                    value={driverName}
                                    onChange={(e) => setDriverName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Driver Contact</label>
                                <input
                                    type="text"
                                    className="form-input mono"
                                    placeholder="+91-98220-44109"
                                    value={driverPhone}
                                    onChange={(e) => setDriverPhone(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Max Payload (kg)</label>
                                <input
                                    type="number"
                                    min={1000}
                                    max={35000}
                                    className="form-input mono"
                                    value={maxCapacity}
                                    onChange={(e) => setMaxCapacity(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Stationed Home Hub</label>
                                <select className="form-select" value={homeHubId} onChange={(e) => setHomeHubId(e.target.value)}>
                                    {hubs.map((h) => (
                                        <option key={h.id} value={h.id}>
                                            {h.code} — {h.city}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.72rem 0.95rem',
                                borderRadius: '10px',
                                background: 'rgba(249, 115, 22, 0.08)',
                                border: '1px solid rgba(249, 115, 22, 0.25)',
                                marginBottom: '1rem',
                            }}
                        >
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                <input
                                    type="checkbox"
                                    checked={isColdChain}
                                    onChange={(e) => setIsColdChain(e.target.checked)}
                                />
                                <Snowflake size={16} color="#f97316" />
                                Equipped with Active Reefer Cold-Chain Unit
                            </label>
                        </div>

                        <button type="submit" className="btn btn-emerald" style={{ width: '100%' }} disabled={savingVeh}>
                            <Truck size={16} />
                            {savingVeh ? 'Onboarding Vehicle...' : 'Register Vehicle into Fleet'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Live Fleet & Hub Tables */}
            <div className="two-col-grid">
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <MapPin size={17} color="#f97316" />
                            Active Network Hubs ({hubs.length})
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Facility &amp; City</th>
                                    <th>Coordinates</th>
                                    <th>Geofence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hubs.map((h) => (
                                    <tr key={h.id}>
                                        <td className="mono" style={{ fontWeight: 700, color: '#fb923c' }}>{h.code}</td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{h.name}</div>
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{h.city}</div>
                                        </td>
                                        <td className="mono" style={{ fontSize: '0.78rem' }}>
                                            {Number(h.lat).toFixed(4)}, {Number(h.lng).toFixed(4)}
                                        </td>
                                        <td className="mono">{h.geofence_radius_km} km</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Truck size={17} color="#a3e635" />
                            Registered Fleet Roster ({vehicles.length})
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Plate &amp; Model</th>
                                    <th>Driver</th>
                                    <th>Capacity</th>
                                    <th>Operational State</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vehicles.map((v) => (
                                    <tr key={v.id}>
                                        <td>
                                            <div className="mono" style={{ fontWeight: 700 }}>{v.plate_number}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.model}</div>
                                        </td>
                                        <td>
                                            <div>{v.driver_name}</div>
                                            <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{v.driver_phone}</div>
                                        </td>
                                        <td className="mono" style={{ fontSize: '0.8rem' }}>
                                            {v.used_capacity_kg.toLocaleString()} / {v.max_capacity_kg.toLocaleString()} kg
                                        </td>
                                        <td>
                                            {v.status === 'EN_ROUTE' ? (
                                                <span className="badge badge-emerald">EN_ROUTE</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={`badge ${v.status === 'MAINTENANCE' ? 'badge-crimson' : 'badge-cyan'}`}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => toggleMaintenance(v)}
                                                    title="Click to toggle IDLE / MAINTENANCE"
                                                >
                                                    <Wrench size={11} /> {v.status}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
} 