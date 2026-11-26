import { useState, useMemo } from 'react';
import axios from 'axios';
import {
    Cpu,
    PlusCircle,
    Snowflake,
    Truck,
    CheckCircle2,
    ArrowRight,
    Package,
    Scale,
    Lock,
} from 'lucide-react';

const API = '/api';

export default function DispatchConsole({ hubs, vehicles, shipments, onRefresh, user }) {
    const [cargoDescription, setCargoDescription] = useState('');
    const [weightKg, setWeightKg] = useState(4500);
    const [requiresColdChain, setRequiresColdChain] = useState(true);
    const [maxTempC, setMaxTempC] = useState(8.0);
    const [originHubId, setOriginHubId] = useState(hubs[0]?.id || 1);
    const [destHubId, setDestHubId] = useState(hubs[1]?.id || 2);
    const [slaHours, setSlaHours] = useState(8);

    const [creating, setCreating] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [dispatchLog, setDispatchLog] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const perms = user?.permissions || [];
    const canCreate = perms.includes('shipment:create');
    const canDispatch = perms.includes('dispatch:execute');

    const pendingShipments = useMemo(
        () => shipments.filter((s) => s.status === 'CREATED'),
        [shipments]
    );

    const idleVehicles = useMemo(
        () => vehicles.filter((v) => v.status === 'IDLE'),
        [vehicles]
    );

    const handleCreateOrder = async (e) => {
        e.preventDefault();
        if (!canCreate) return;
        setErrorMsg('');
        setCreating(true);
        try {
            await axios.post(`${API}/shipments`, {
                cargo_description: cargoDescription,
                weight_kg: Number(weightKg),
                requires_cold_chain: requiresColdChain,
                max_temp_c: requiresColdChain ? Number(maxTempC) : 35.0,
                origin_hub_id: Number(originHubId),
                dest_hub_id: Number(destHubId),
                sla_hours: Number(slaHours),
            });
            setCargoDescription('');
            await onRefresh();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to create freight order');
        } finally {
            setCreating(false);
        }
    };

    const handleAutoDispatch = async () => {
        if (!canDispatch) return;
        setErrorMsg('');
        setOptimizing(true);
        try {
            const { data } = await axios.post(`${API}/dispatch/optimize`);
            setDispatchLog(data);
            await onRefresh();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Auto-dispatch optimization failed');
        } finally {
            setOptimizing(false);
        }
    };

    return (
        <div className="page-container">
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                }}
            >
                <div>
                    <h1 style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        Algorithmic Freight Dispatch Engine
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        ACID row-locked bin-packing matching cold-chain constraints, payload capacity, and Haversine deadhead distance.
                    </p>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handleAutoDispatch}
                    disabled={optimizing || pendingShipments.length === 0 || !canDispatch}
                    style={{ padding: '0.75rem 1.35rem', fontSize: '0.92rem' }}
                    title={!canDispatch ? `Role ${user?.role_code} lacks 'dispatch:execute'` : undefined}
                >
                    {canDispatch ? <Cpu size={18} /> : <Lock size={16} />}
                    {optimizing
                        ? 'Running Bin-Packing Solver...'
                        : `Run Auto-Dispatch (${pendingShipments.length} Unassigned)`}
                </button>
            </div>

            {errorMsg && (
                <div
                    className="telemetry-card breached"
                    style={{ marginBottom: '1.25rem', color: '#fda4af', fontSize: '0.88rem' }}
                >
                    {errorMsg}
                </div>
            )}

            {dispatchLog && (
                <div
                    className="panel"
                    style={{
                        marginBottom: '1.5rem',
                        borderColor: 'rgba(163, 230, 53, 0.45)',
                        background: 'rgba(163, 230, 53, 0.06)',
                    }}
                >
                    <div className="panel-header">
                        <div className="panel-title" style={{ color: '#bef264' }}>
                            <CheckCircle2 size={18} />
                            ACID Dispatch Transaction Committed — {dispatchLog.dispatchedCount} Order(s) Assigned
                        </div>
                    </div>
                    <div style={{ padding: '1rem 1.3rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        {dispatchLog.assignments.length === 0 ? (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                                No compatible IDLE vehicles had sufficient payload or cold-chain rating for pending orders.
                            </span>
                        ) : (
                            dispatchLog.assignments.map((a, idx) => (
                                <div
                                    key={idx}
                                    className="telemetry-card"
                                    style={{ flex: '1 1 280px', borderColor: 'rgba(163, 230, 53, 0.35)' }}
                                >
                                    <div className="mono" style={{ fontWeight: 700, color: '#fb923c' }}>
                                        {a.tracking_code} → {a.vehicle_plate}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                                        Driver: <b>{a.driver_name}</b> • Deadhead: <b>{a.deadhead_km} km</b>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <div className="two-col-grid">
                {/* Left: Create New Freight Manifest */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <PlusCircle size={17} color="#f97316" />
                            Register New Freight Manifest
                        </div>
                        {!canCreate && <span className="badge badge-slate">Locked ({user?.role_code})</span>}
                    </div>
                    <form onSubmit={handleCreateOrder} style={{ padding: '1.3rem' }}>
                        <div className="form-group">
                            <label className="form-label">Cargo Description</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g., mRNA Cold-Chain Vaccine Crates"
                                value={cargoDescription}
                                onChange={(e) => setCargoDescription(e.target.value)}
                                disabled={!canCreate}
                                required
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Origin Hub</label>
                                <select
                                    className="form-select"
                                    value={originHubId}
                                    onChange={(e) => setOriginHubId(e.target.value)}
                                    disabled={!canCreate}
                                >
                                    {hubs.map((h) => (
                                        <option key={h.id} value={h.id}>
                                            {h.code} — {h.city}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Destination Hub</label>
                                <select
                                    className="form-select"
                                    value={destHubId}
                                    onChange={(e) => setDestHubId(e.target.value)}
                                    disabled={!canCreate}
                                >
                                    {hubs.map((h) => (
                                        <option key={h.id} value={h.id}>
                                            {h.code} — {h.city}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                            <div className="form-group">
                                <label className="form-label">Payload Weight (kg)</label>
                                <input
                                    type="number"
                                    className="form-input mono"
                                    min={100}
                                    max={22000}
                                    value={weightKg}
                                    onChange={(e) => setWeightKg(e.target.value)}
                                    disabled={!canCreate}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">SLA Window (Hours)</label>
                                <input
                                    type="number"
                                    className="form-input mono"
                                    min={2}
                                    max={48}
                                    value={slaHours}
                                    onChange={(e) => setSlaHours(e.target.value)}
                                    disabled={!canCreate}
                                    required
                                />
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.85rem 1rem',
                                borderRadius: '12px',
                                background: 'rgba(249, 115, 22, 0.08)',
                                border: '1px solid rgba(249, 115, 22, 0.25)',
                                marginBottom: '1.15rem',
                            }}
                        >
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.55rem',
                                    cursor: canCreate ? 'pointer' : 'not-allowed',
                                    fontSize: '0.86rem',
                                    fontWeight: 600,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={requiresColdChain}
                                    onChange={(e) => setRequiresColdChain(e.target.checked)}
                                    disabled={!canCreate}
                                />
                                <Snowflake size={16} color="#f97316" />
                                Requires Refrigerated Reefer
                            </label>

                            {requiresColdChain && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Max °C:</span>
                                    <input
                                        type="number"
                                        step="0.5"
                                        className="form-input mono"
                                        style={{ width: '74px', padding: '0.35rem 0.5rem' }}
                                        value={maxTempC}
                                        onChange={(e) => setMaxTempC(e.target.value)}
                                        disabled={!canCreate}
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="btn btn-emerald"
                            style={{ width: '100%' }}
                            disabled={creating || !canCreate}
                        >
                            {!canCreate
                                ? `Role ${user?.role_code} Lacks 'shipment:create'`
                                : creating
                                    ? 'Registering Manifest...'
                                    : 'Queue Freight Order for Dispatch'}
                        </button>
                    </form>
                </div>

                {/* Right: Unassigned Queue & Available Fleet Pool */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Package size={17} color="#fbbf24" />
                                Unassigned Freight Queue ({pendingShipments.length})
                            </div>
                            <span className="badge badge-amber">Awaiting Solver</span>
                        </div>
                        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {pendingShipments.length === 0 ? (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', padding: '1rem', textAlign: 'center' }}>
                                    All queued freight orders have been assigned to fleet units.
                                </div>
                            ) : (
                                pendingShipments.map((s) => (
                                    <div key={s.id} className="telemetry-card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="mono" style={{ fontWeight: 700, color: '#fb923c' }}>
                                                {s.tracking_code}
                                            </span>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                {s.requires_cold_chain && (
                                                    <span className="badge badge-cyan">
                                                        <Snowflake size={11} /> ≤ {s.max_temp_c}°C
                                                    </span>
                                                )}
                                                <span className="badge badge-slate mono">
                                                    <Scale size={11} /> {s.weight_kg} kg
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '0.45rem' }}>
                                            {s.cargo_description}
                                        </div>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                fontSize: '0.8rem',
                                                color: 'var(--text-secondary)',
                                                marginTop: '0.4rem',
                                            }}
                                        >
                                            <span>{s.origin_city}</span>
                                            <ArrowRight size={13} color="#f97316" />
                                            <span>{s.dest_city}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Truck size={17} color="#a3e635" />
                                Standby Fleet Capacity Pool ({idleVehicles.length} IDLE)
                            </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Unit Plate</th>
                                        <th>Driver</th>
                                        <th>Type</th>
                                        <th>Free Capacity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {idleVehicles.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                All fleet units are currently deployed on corridors.
                                            </td>
                                        </tr>
                                    ) : (
                                        idleVehicles.map((v) => (
                                            <tr key={v.id}>
                                                <td className="mono" style={{ fontWeight: 700 }}>
                                                    {v.plate_number}
                                                </td>
                                                <td>{v.driver_name}</td>
                                                <td>
                                                    {v.is_cold_chain ? (
                                                        <span className="badge badge-cyan">Reefer</span>
                                                    ) : (
                                                        <span className="badge badge-slate">Dry Freight</span>
                                                    )}
                                                </td>
                                                <td className="mono">
                                                    {(v.max_capacity_kg - v.used_capacity_kg).toLocaleString()} kg
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}