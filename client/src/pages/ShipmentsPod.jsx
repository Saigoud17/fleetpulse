import { useState, useRef } from 'react';
import axios from 'axios';
import {
    PackageCheck,
    ShieldCheck,
    Clock,
    ArrowRight,
    KeyRound,
    Activity,
    CheckCircle2,
    Lock,
    RotateCcw,
    AlertTriangle,
} from 'lucide-react';

const API = 'http://localhost:5000/api';

export default function ShipmentsPod({ shipments, onRefresh, user }) {
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [details, setDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [receiverName, setReceiverName] = useState(user?.full_name || 'Warehouse Dock Supervisor');
    const [signing, setSigning] = useState(false);
    const [podError, setPodError] = useState('');
    const [hasSigned, setHasSigned] = useState(false);

    const canvasRef = useRef(null);
    const isDrawingRef = useRef(false);

    const canVerifyPod = (user?.permissions || []).includes('pod:verify');

    const inspectShipment = async (shipment) => {
        setSelectedShipment(shipment);
        setPodError('');
        setHasSigned(false);
        setLoadingDetails(true);
        try {
            const { data } = await axios.get(`${API}/shipments/${shipment.id}/details`);
            setDetails(data);
        } finally {
            setLoadingDetails(false);
        }
    };

    const getCoords = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: ((clientX - rect.left) / rect.width) * canvas.width,
            y: ((clientY - rect.top) / rect.height) * canvas.height,
        };
    };

    const startDraw = (e) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        isDrawingRef.current = true;
        const { x, y } = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawingRef.current) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const { x, y } = getCoords(e);
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#a3e635';
        ctx.lineTo(x, y);
        ctx.stroke();
        setHasSigned(true);
    };

    const endDraw = () => {
        isDrawingRef.current = false;
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSigned(false);
    };

    const handleCompleteDelivery = async (e) => {
        e.preventDefault();
        if (!selectedShipment || !canVerifyPod) return;
        if (!hasSigned) {
            setPodError('Please draw the receiver signature on the pad before signing off.');
            return;
        }
        setPodError('');
        setSigning(true);
        try {
            const signatureData = canvasRef.current.toDataURL('image/png');
            await axios.post(`${API}/shipments/${selectedShipment.id}/deliver`, {
                receiver_name: receiverName,
                signature_data: signatureData,
            });
            await onRefresh();
            await inspectShipment({ ...selectedShipment, status: 'DELIVERED' });
        } catch (err) {
            setPodError(err.response?.data?.error || 'POD verification failed');
        } finally {
            setSigning(false);
        }
    };

    const exportManifestsCsv = () => {
        if (!shipments.length) return;
        const headers = [
            'Tracking Code',
            'Status',
            'Origin Hub',
            'Destination Hub',
            'Cargo Description',
            'Weight (kg)',
            'Cold Chain',
            'Max Temp (C)',
            'Assigned Vehicle',
            'Driver',
        ];
        const rows = shipments.map((s) => [
            s.tracking_code,
            s.status,
            `${s.origin_code} (${s.origin_city})`,
            `${s.dest_code} (${s.dest_city})`,
            `"${String(s.cargo_description || '').replace(/"/g, '""')}"`,
            s.weight_kg,
            s.requires_cold_chain ? 'YES' : 'NO',
            s.max_temp_c,
            s.plate_number || 'UNASSIGNED',
            s.driver_name || 'N/A',
        ]);
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fleetpulse-manifests-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const printPodCertificate = () => {
        if (!selectedShipment || !details?.pod) return;
        const win = window.open('', '_blank', 'width=760,height=860');
        if (!win) return;
        const eventsHtml = (details.events || [])
            .map(
                (ev) =>
                    `<tr><td style="padding:6px 10px;border:1px solid #ddd;">${ev.to_status}</td><td style="padding:6px 10px;border:1px solid #ddd;">${ev.notes}</td><td style="padding:6px 10px;border:1px solid #ddd;">${new Date(ev.created_at).toLocaleString()}</td></tr>`
            )
            .join('');

        const sigImgHtml = details.pod.signature_data
            ? `<div style="margin-top:8px;background:#111;padding:8px;border-radius:6px;display:inline-block;"><img src="${details.pod.signature_data}" alt="Receiver Signature" style="height:64px;"/></div>`
            : '';

        win.document.write(`
      <html>
        <head><title>POD Certificate — ${selectedShipment.tracking_code}</title></head>
        <body style="font-family:Arial,sans-serif;padding:32px;color:#111;max-width:700px;margin:auto;">
          <div style="border-bottom:3px solid #f97316;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h1 style="margin:0;font-size:22px;">FleetPulse OS — Cryptographic Proof of Delivery</h1>
              <div style="font-size:12px;color:#555;margin-top:4px;">Geofence-Verified HMAC-SHA256 Freight Custody Receipt</div>
            </div>
            <div style="font-family:monospace;font-weight:bold;font-size:15px;background:#fef3c7;padding:6px 10px;border-radius:6px;">
              ${selectedShipment.tracking_code}
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Cargo Manifest</td><td style="padding:8px;border:1px solid #ddd;">${selectedShipment.cargo_description} (${selectedShipment.weight_kg} kg)</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Corridor</td><td style="padding:8px;border:1px solid #ddd;">${selectedShipment.origin_city} (${selectedShipment.origin_code}) → ${selectedShipment.dest_city} (${selectedShipment.dest_code})</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Carrier Vehicle</td><td style="padding:8px;border:1px solid #ddd;">${selectedShipment.plate_number || 'N/A'} (Driver: ${selectedShipment.driver_name || 'N/A'})</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Verified Receiver</td><td style="padding:8px;border:1px solid #ddd;">${details.pod.receiver_name}<br/>${sigImgHtml}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Delivery Timestamp</td><td style="padding:8px;border:1px solid #ddd;">${new Date(details.pod.delivered_at).toLocaleString()}</td></tr>
          </table>
          <div style="background:#f4f4f5;border:1px solid #d4d4d8;padding:12px;border-radius:8px;margin-bottom:20px;">
            <div style="font-size:11px;font-weight:bold;color:#52525b;margin-bottom:4px;">HMAC-SHA256 CRYPTOGRAPHIC SIGNATURE</div>
            <div style="font-family:monospace;font-size:12px;word-break:break-all;color:#09090b;">${details.pod.hmac_signature}</div>
          </div>
          <h3 style="font-size:14px;margin-bottom:8px;">Immutable Custody Audit Trail</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#f4f4f5;"><th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">State</th><th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Audit Event</th><th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Timestamp</th></tr></thead>
            <tbody>${eventsHtml}</tbody>
          </table>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
        win.document.close();
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'DELIVERED':
                return 'badge-emerald';
            case 'SLA_BREACHED':
                return 'badge-crimson';
            case 'AT_HUB':
                return 'badge-amber';
            case 'IN_TRANSIT':
            case 'ASSIGNED':
                return 'badge-cyan';
            default:
                return 'badge-slate';
        }
    };

    return (
        <div className="page-container">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Shipment State Machine &amp; Cryptographic POD Verifier
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    Inspect immutable state transitions, historical thermal telemetry, and capture geofence-verified SHA-256 HMAC Proof-of-Delivery signatures.
                </p>
            </div>

            <div className="two-col-grid" style={{ gridTemplateColumns: '1.45fr 1fr' }}>
                {/* Left: Master Shipment Manifest Table */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <PackageCheck size={17} color="#f97316" />
                            Active &amp; Historical Freight Manifests ({shipments.length})
                        </div>
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={exportManifestsCsv}>
                            Export CSV
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tracking ID</th>
                                    <th>Corridor</th>
                                    <th>Cargo &amp; Payload</th>
                                    <th>Assigned Unit</th>
                                    <th>Lifecycle State</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shipments.map((s) => (
                                    <tr
                                        key={s.id}
                                        onClick={() => inspectShipment(s)}
                                        style={{
                                            cursor: 'pointer',
                                            background: selectedShipment?.id === s.id ? 'rgba(249, 115, 22, 0.12)' : undefined,
                                        }}
                                    >
                                        <td className="mono" style={{ fontWeight: 700, color: '#fb923c' }}>
                                            {s.tracking_code}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                                                <span>{s.origin_code}</span>
                                                <ArrowRight size={12} color="#71717a" />
                                                <span>{s.dest_code}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {s.origin_city} to {s.dest_city}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{s.cargo_description}</div>
                                            <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {s.weight_kg.toLocaleString()} kg {s.requires_cold_chain ? `• ≤${s.max_temp_c}°C` : ''}
                                            </div>
                                        </td>
                                        <td className="mono" style={{ fontSize: '0.82rem' }}>
                                            {s.plate_number || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
                                        </td>
                                        <td>
                                            <span className={`badge ${getStatusBadge(s.status)}`}>{s.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Inspector Drawer */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <ShieldCheck size={17} color="#a3e635" />
                            {selectedShipment ? `Audit & POD: ${selectedShipment.tracking_code}` : 'Select a Shipment to Inspect'}
                        </div>
                    </div>

                    <div style={{ padding: '1.25rem' }}>
                        {!selectedShipment ? (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                Click any manifest row on the left to inspect its state transition log, sensor readings, and cryptographic Proof-of-Delivery.
                            </div>
                        ) : loadingDetails ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                Loading audit trail...
                            </div>
                        ) : (
                            <>
                                {details?.pod ? (
                                    <div
                                        style={{
                                            padding: '1rem',
                                            borderRadius: '12px',
                                            background: 'rgba(163, 230, 53, 0.1)',
                                            border: '1px solid rgba(163, 230, 53, 0.35)',
                                            marginBottom: '1.25rem',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#bef264', fontWeight: 700, fontSize: '0.88rem' }}>
                                            <CheckCircle2 size={16} /> Geofence &amp; Cryptographic POD Verified
                                        </div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '0.45rem', color: 'var(--text-primary)' }}>
                                            Signed By: <b>{details.pod.receiver_name}</b>
                                        </div>
                                        {details.pod.signature_data && (
                                            <div
                                                style={{
                                                    marginTop: '0.5rem',
                                                    padding: '0.4rem',
                                                    borderRadius: '8px',
                                                    background: '#050507',
                                                    border: '1px solid var(--border-subtle)',
                                                }}
                                            >
                                                <img
                                                    src={details.pod.signature_data}
                                                    alt="Captured Receiver Signature"
                                                    style={{ maxHeight: '64px', display: 'block' }}
                                                />
                                            </div>
                                        )}
                                        <div
                                            className="mono"
                                            style={{
                                                fontSize: '0.72rem',
                                                marginTop: '0.5rem',
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                background: '#050507',
                                                color: '#fb923c',
                                                wordBreak: 'break-all',
                                            }}
                                        >
                                            HMAC-SHA256: {details.pod.hmac_signature}
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem' }}
                                            onClick={printPodCertificate}
                                        >
                                            Print / Save PDF POD Certificate
                                        </button>
                                    </div>
                                ) : (
                                    selectedShipment.status !== 'CREATED' &&
                                    (canVerifyPod ? (
                                        <form
                                            onSubmit={handleCompleteDelivery}
                                            style={{
                                                padding: '1rem',
                                                borderRadius: '12px',
                                                background: 'rgba(249, 115, 22, 0.08)',
                                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                                marginBottom: '1.25rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.86rem', marginBottom: '0.6rem' }}>
                                                <KeyRound size={15} color="#f97316" /> Execute Geofence-Locked POD Sign-Off
                                            </div>

                                            {podError && (
                                                <div
                                                    className="telemetry-card breached"
                                                    style={{ marginBottom: '0.75rem', color: '#fda4af', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                                                >
                                                    <AlertTriangle size={15} />
                                                    <span>{podError}</span>
                                                </div>
                                            )}

                                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                                <label className="form-label">Receiving Hub Officer / Consignee Name</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={receiverName}
                                                    onChange={(e) => setReceiverName(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <label className="form-label">Consignee Digital Signature (Draw Below)</label>
                                                    <button
                                                        type="button"
                                                        onClick={clearSignature}
                                                        style={{ background: 'none', border: 'none', color: '#fb923c', fontSize: '0.74rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                    >
                                                        <RotateCcw size={12} /> Clear
                                                    </button>
                                                </div>
                                                <canvas
                                                    ref={canvasRef}
                                                    width={340}
                                                    height={96}
                                                    onMouseDown={startDraw}
                                                    onMouseMove={draw}
                                                    onMouseUp={endDraw}
                                                    onMouseLeave={endDraw}
                                                    onTouchStart={startDraw}
                                                    onTouchMove={draw}
                                                    onTouchEnd={endDraw}
                                                    style={{
                                                        width: '100%',
                                                        height: '96px',
                                                        background: '#050507',
                                                        border: '1px dashed rgba(249, 115, 22, 0.5)',
                                                        borderRadius: '8px',
                                                        cursor: 'crosshair',
                                                        touchAction: 'none',
                                                    }}
                                                />
                                            </div>

                                            <button type="submit" className="btn btn-emerald" style={{ width: '100%' }} disabled={signing}>
                                                {signing ? 'Verifying Geofence & Signing...' : 'Verify Arrival & Release Vehicle'}
                                            </button>
                                        </form>
                                    ) : (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.75rem 0.9rem',
                                                borderRadius: '10px',
                                                background: 'rgba(161, 161, 170, 0.08)',
                                                border: '1px solid var(--border-subtle)',
                                                color: 'var(--text-secondary)',
                                                fontSize: '0.8rem',
                                                marginBottom: '1.25rem',
                                            }}
                                        >
                                            <Lock size={14} color="#fb923c" />
                                            <span>
                                                Read-Only Audit: Role <strong>{user?.role_code}</strong> lacks <span className="mono">pod:verify</span> permission.
                                            </span>
                                        </div>
                                    ))
                                )}

                                {/* Immutable State Audit Events */}
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Clock size={14} /> IMMUTABLE STATE AUDIT TRAIL
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.25rem' }}>
                                    {details?.events?.map((ev) => (
                                        <div
                                            key={ev.id}
                                            style={{
                                                padding: '0.65rem 0.85rem',
                                                borderRadius: '10px',
                                                background: 'rgba(9, 9, 11, 0.7)',
                                                border: '1px solid var(--border-subtle)',
                                                fontSize: '0.8rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="badge badge-cyan">{ev.to_status}</span>
                                                <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    {new Date(ev.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)' }}>{ev.notes}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Recent Telemetry Sensor Samples */}
                                {details?.telemetry?.length > 0 && (
                                    <>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Activity size={14} /> RECENT TELEMETRY STREAM SAMPLES
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            {details.telemetry.slice(-6).map((t) => (
                                                <div
                                                    key={t.id}
                                                    className="mono"
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.35rem 0.6rem',
                                                        borderRadius: '8px',
                                                        background: 'rgba(24, 24, 29, 0.9)',
                                                        border: '1px solid var(--border-subtle)',
                                                    }}
                                                >
                                                    {t.speed_kmh}km/h • {t.cargo_temp_c}°C
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}