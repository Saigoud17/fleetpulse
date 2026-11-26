import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    Navigation,
    Radio,
    Square,
    Truck,
    MapPin,
    Thermometer,
    AlertTriangle,
    CheckCircle2,
    Compass,
} from 'lucide-react';

const API = 'http://localhost:5000/api';

export default function DriverTerminal({ user }) {
    const [assignment, setAssignment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [broadcasting, setBroadcasting] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('Standby — Ready to stream device GPS');
    const [lastFix, setLastFix] = useState(null);
    const [probeTemp, setProbeTemp] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [packetsSent, setPacketsSent] = useState(0);

    const watchIdRef = useRef(null);

    const loadAssignment = async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/driver/my-assignment`);
            setAssignment(data);
            if (data.vehicle && probeTemp === '') {
                setProbeTemp(String(data.vehicle.cargo_temp_c));
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to load vehicle assignment');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAssignment();
        return () => {
            if (watchIdRef.current !== null && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    const transmitPosition = async (pos) => {
        const { latitude, longitude, speed, heading, accuracy } = pos.coords;
        const speedKmh = speed !== null && !Number.isNaN(speed) ? Number((speed * 3.6).toFixed(1)) : 0;

        setLastFix({
            lat: latitude,
            lng: longitude,
            speedKmh,
            accuracy: Math.round(accuracy || 0),
            timestamp: new Date().toLocaleTimeString(),
        });

        try {
            const { data } = await axios.post(`${API}/telemetry/ingest`, {
                vehicle_id: assignment?.vehicle?.id,
                lat: latitude,
                lng: longitude,
                speed_kmh: speedKmh,
                heading: heading || 0,
                accuracy_m: accuracy || 10,
                cargo_temp_c: probeTemp !== '' ? Number(probeTemp) : undefined,
            });

            setPacketsSent((c) => c + 1);
            setErrorMsg('');
            setGpsStatus(
                data.distance_to_dest_km !== null
                    ? `Live GPS Locked • ${data.distance_to_dest_km} km to ${assignment?.shipment?.dest_code}`
                    : 'Live GPS Locked • Streaming to Control Tower'
            );
            if (data.shipment_status === 'AT_HUB') {
                loadAssignment();
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Telemetry packet rejected');
        }
    };

    const startLiveGps = () => {
        if (!navigator.geolocation) {
            setErrorMsg('Your browser or device does not support hardware GPS Geolocation.');
            return;
        }
        setErrorMsg('');
        setBroadcasting(true);
        setGpsStatus('Acquiring satellite GPS lock...');

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => transmitPosition(pos),
            (err) => {
                setErrorMsg(`GPS Error (${err.code}): ${err.message}. Ensure Location Permission & HTTPS/localhost are enabled.`);
                setBroadcasting(false);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 15000,
            }
        );
    };

    const stopLiveGps = () => {
        if (watchIdRef.current !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setBroadcasting(false);
        setGpsStatus('GPS Beacon Paused');
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading driver vehicle &amp; manifest assignment...
                </div>
            </div>
        );
    }

    const veh = assignment?.vehicle;
    const ship = assignment?.shipment;

    return (
        <div className="page-container" style={{ maxWidth: '760px' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Driver Live GPS &amp; Telemetry Beacon
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.2rem' }}>
                    Streams real hardware satellite coordinates from your device directly to the FleetPulse War Room.
                </p>
            </div>

            {!veh ? (
                <div className="panel" style={{ padding: '1.75rem', textAlign: 'center' }}>
                    <Truck size={32} color="#f97316" style={{ marginBottom: '0.6rem' }} />
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>No Truck Assigned to {user?.full_name}</div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                        Ask your <span className="mono">FLEET_ADMIN</span> to bind a vehicle plate to your operator profile in <strong>RBAC Security</strong>.
                    </p>
                </div>
            ) : (
                <>
                    {/* Assigned Vehicle & Active Shipment Card */}
                    <div className="panel" style={{ marginBottom: '1.25rem' }}>
                        <div className="panel-header">
                            <div className="panel-title">
                                <Truck size={17} color="#f97316" />
                                Assigned Unit: <span className="mono">{veh.plate_number}</span>
                            </div>
                            <span className={`badge ${broadcasting ? 'badge-emerald' : 'badge-slate'}`}>
                                {broadcasting ? 'LIVE BEACON ON' : veh.status}
                            </span>
                        </div>

                        <div style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                                Vehicle: <strong style={{ color: 'var(--text-primary)' }}>{veh.model}</strong> • Capacity:{' '}
                                <span className="mono">{veh.max_capacity_kg.toLocaleString()} kg</span>
                            </div>

                            {ship ? (
                                <div
                                    style={{
                                        padding: '1rem',
                                        borderRadius: '12px',
                                        background: 'rgba(249, 115, 22, 0.08)',
                                        border: '1px solid rgba(249, 115, 22, 0.3)',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="mono" style={{ fontWeight: 800, color: '#fb923c' }}>
                                            {ship.tracking_code}
                                        </span>
                                        <span className="badge badge-cyan">{ship.status}</span>
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.4rem' }}>
                                        {ship.cargo_description} ({ship.weight_kg.toLocaleString()} kg)
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                        <MapPin size={14} color="#a3e635" />
                                        <span>
                                            {ship.origin_city} ({ship.origin_code}) → <strong>{ship.dest_city} ({ship.dest_code})</strong>
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                    No active dispatch manifest right now. You can still test live GPS position updates below.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Hardware GPS Transmitter Controls */}
                    <div className="panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Compass size={17} color="#a3e635" />
                                Satellite GPS Transmitter
                            </div>
                            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                Packets Sent: {packetsSent}
                            </span>
                        </div>

                        <div style={{ padding: '1.25rem' }}>
                            {errorMsg && (
                                <div
                                    className="telemetry-card breached"
                                    style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fda4af', fontSize: '0.83rem' }}
                                >
                                    <AlertTriangle size={16} />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            <div
                                style={{
                                    padding: '0.8rem 1rem',
                                    borderRadius: '10px',
                                    background: 'rgba(163, 230, 53, 0.08)',
                                    border: '1px solid rgba(163, 230, 53, 0.28)',
                                    color: '#bef264',
                                    fontSize: '0.83rem',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <CheckCircle2 size={15} />
                                <span>{gpsStatus}</span>
                            </div>

                            {veh.is_cold_chain && (
                                <div className="form-group">
                                    <label className="form-label">
                                        <Thermometer size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                        Reefer Cargo Probe Temperature (°C)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-input mono"
                                        value={probeTemp}
                                        onChange={(e) => setProbeTemp(e.target.value)}
                                    />
                                </div>
                            )}

                            {!broadcasting ? (
                                <button type="button" className="btn btn-emerald" style={{ width: '100%', padding: '0.85rem' }} onClick={startLiveGps}>
                                    <Radio size={17} /> Start Trip &amp; Broadcast Real Device GPS
                                </button>
                            ) : (
                                <button type="button" className="btn btn-danger" style={{ width: '100%', padding: '0.85rem' }} onClick={stopLiveGps}>
                                    <Square size={16} /> Stop GPS Transmission
                                </button>
                            )}

                            {lastFix && (
                                <div
                                    className="mono"
                                    style={{
                                        marginTop: '1rem',
                                        padding: '0.85rem',
                                        borderRadius: '10px',
                                        background: '#050507',
                                        border: '1px solid var(--border-subtle)',
                                        fontSize: '0.78rem',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '0.5rem',
                                    }}
                                >
                                    <div>LAT: <strong>{lastFix.lat.toFixed(6)}</strong></div>
                                    <div>LNG: <strong>{lastFix.lng.toFixed(6)}</strong></div>
                                    <div>SPEED: <strong>{lastFix.speedKmh} km/h</strong></div>
                                    <div>ACCURACY: <strong>±{lastFix.accuracy} m</strong></div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}