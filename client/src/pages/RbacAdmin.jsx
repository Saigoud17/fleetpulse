import { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, Users, Check, X, UserPlus } from 'lucide-react';

const API = 'http://localhost:5000/api';

export default function RbacAdmin({ currentUser, onUserUpdated }) {
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);
    const [togglingKey, setTogglingKey] = useState('');

    // New Operator Creation Form State
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [roleId, setRoleId] = useState('');
    const [assignedVehicleId, setAssignedVehicleId] = useState('');
    const [creating, setCreating] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const loadMatrix = async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/rbac/matrix`);
            setMatrix(data);
            if (!roleId && data.roles?.length) {
                const defaultRole = data.roles.find((r) => r.code === 'DISPATCHER') || data.roles[0];
                setRoleId(String(defaultRole.id));
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMatrix();
    }, []);

    const selectedRoleCode = matrix?.roles?.find((r) => String(r.id) === String(roleId))?.code;

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setFeedback('');
        setCreating(true);
        try {
            await axios.post(`${API}/rbac/users`, {
                full_name: fullName,
                email,
                password,
                role_id: Number(roleId),
                assigned_vehicle_id: assignedVehicleId ? Number(assignedVehicleId) : null,
            });
            setFullName('');
            setEmail('');
            setPassword('');
            setAssignedVehicleId('');
            setFeedback('New operator account provisioned and assigned to role.');
            await loadMatrix();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to create operator');
        } finally {
            setCreating(false);
        }
    };

    const handleRoleChange = async (userId, newRoleId) => {
        setUpdatingId(userId);
        try {
            const { data } = await axios.patch(`${API}/rbac/users/${userId}/role`, {
                role_id: Number(newRoleId),
            });
            await loadMatrix();
            if (data.user.id === currentUser.id) {
                onUserUpdated(data.user);
            }
        } finally {
            setUpdatingId(null);
        }
    };

    const handleVehicleChange = async (userId, newVehicleId) => {
        setUpdatingId(userId);
        try {
            const { data } = await axios.patch(`${API}/rbac/users/${userId}/role`, {
                assigned_vehicle_id: newVehicleId ? Number(newVehicleId) : null,
            });
            await loadMatrix();
            if (data.user.id === currentUser.id) {
                onUserUpdated(data.user);
            }
        } finally {
            setUpdatingId(null);
        }
    };

    const handleToggleStatus = async (userObj) => {
        if (userObj.id === currentUser.id) return;
        setUpdatingId(userObj.id);
        try {
            await axios.patch(`${API}/rbac/users/${userObj.id}/role`, {
                is_active: !userObj.is_active,
            });
            await loadMatrix();
        } finally {
            setUpdatingId(null);
        }
    };

    const handleTogglePermission = async (rId, pId) => {
        const key = `${rId}-${pId}`;
        setTogglingKey(key);
        setErrorMsg('');
        try {
            await axios.post(`${API}/rbac/roles/${rId}/permissions/toggle`, { permission_id: pId });
            await loadMatrix();
            if (rId === currentUser.role_id) {
                const me = await axios.get(`${API}/auth/me`);
                onUserUpdated(me.data.user);
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to toggle permission');
        } finally {
            setTogglingKey('');
        }
    };

    if (loading || !matrix) {
        return (
            <div className="page-container">
                <div className="panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading RBAC security matrix...
                </div>
            </div>
        );
    }

    const hasPerm = (rId, pId) =>
        matrix.mappings.some((m) => m.role_id === rId && m.permission_id === pId);

    return (
        <div className="page-container">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    RBAC User Provisioning &amp; Role-Permission Governance
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    Provision control-tower operators and drivers, bind physical trucks, and configure granular role permissions live in PostgreSQL.
                </p>
            </div>

            {errorMsg && (
                <div className="telemetry-card breached" style={{ marginBottom: '1rem', color: '#fda4af', fontSize: '0.86rem' }}>
                    {errorMsg}
                </div>
            )}

            {feedback && (
                <div
                    style={{
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        background: 'rgba(163, 230, 53, 0.12)',
                        border: '1px solid rgba(163, 230, 53, 0.35)',
                        color: '#bef264',
                        fontSize: '0.86rem',
                    }}
                >
                    {feedback}
                </div>
            )}

            <div className="two-col-grid" style={{ marginBottom: '1.5rem' }}>
                {/* Left: Admin Provision New User */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <UserPlus size={17} color="#f97316" />
                            Provision New Operator Account
                        </div>
                    </div>
                    <form onSubmit={handleCreateUser} style={{ padding: '1.25rem' }}>
                        <div className="form-group">
                            <label className="form-label">Operator Full Name</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g., Naveen Goud"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Corporate Email</label>
                            <input
                                type="email"
                                className="form-input"
                                placeholder="driver@fleetpulse.io"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Initial Password (min 6 chars)</label>
                            <input
                                type="password"
                                className="form-input"
                                placeholder="Set temporary or initial password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Assign Role</label>
                            <select className="form-select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                                {matrix.roles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name} ({r.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                Assigned Fleet Truck {selectedRoleCode === 'DRIVER' ? '(Required for GPS Beacon)' : '(Optional)'}
                            </label>
                            <select
                                className="form-select"
                                value={assignedVehicleId}
                                onChange={(e) => setAssignedVehicleId(e.target.value)}
                                required={selectedRoleCode === 'DRIVER'}
                            >
                                <option value="">— No Truck Bound —</option>
                                {(matrix.vehicles || []).map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.plate_number} — {v.model} ({v.driver_name})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={creating}>
                            <UserPlus size={16} />
                            {creating ? 'Creating Operator...' : 'Create User & Assign Role'}
                        </button>
                    </form>
                </div>

                {/* Right: Managed Users Directory */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Users size={17} color="#a3e635" />
                            Managed Operator Directory ({matrix.users.length})
                        </div>
                        <span className="badge badge-cyan">DB Enforced</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Operator</th>
                                    <th>Assigned Role</th>
                                    <th>Bound Truck</th>
                                    <th>Account State</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrix.users.map((u) => (
                                    <tr key={u.id}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{u.full_name}</div>
                                            <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                                {u.email}
                                            </div>
                                        </td>
                                        <td>
                                            <select
                                                className="form-select"
                                                style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
                                                value={u.role_id}
                                                disabled={updatingId === u.id}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                            >
                                                {matrix.roles.map((r) => (
                                                    <option key={r.id} value={r.id}>
                                                        {r.name} ({r.code})
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                className="form-select mono"
                                                style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem' }}
                                                value={u.assigned_vehicle_id || ''}
                                                disabled={updatingId === u.id}
                                                onChange={(e) => handleVehicleChange(u.id, e.target.value)}
                                            >
                                                <option value="">None</option>
                                                {(matrix.vehicles || []).map((v) => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.plate_number}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className={`badge ${u.is_active ? 'badge-emerald' : 'badge-crimson'}`}
                                                style={{ cursor: u.id === currentUser.id ? 'default' : 'pointer' }}
                                                disabled={u.id === currentUser.id || updatingId === u.id}
                                                onClick={() => handleToggleStatus(u)}
                                                title={u.id === currentUser.id ? 'Cannot suspend active admin' : 'Click to toggle active/suspended'}
                                            >
                                                {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Interactive Role x Permission Matrix */}
            <div className="panel">
                <div className="panel-header">
                    <div className="panel-title">
                        <Shield size={17} color="#a3e635" />
                        Interactive Role-to-Permission Matrix (Click Any Cell to Grant / Revoke)
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Permission Key</th>
                                <th>Module</th>
                                {matrix.roles.map((r) => (
                                    <th key={r.id} style={{ textAlign: 'center' }}>
                                        {r.code}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.permissions.map((p) => (
                                <tr key={p.id}>
                                    <td>
                                        <div className="mono" style={{ fontWeight: 700, color: '#fb923c', fontSize: '0.82rem' }}>
                                            {p.permission_key}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.description}</div>
                                    </td>
                                    <td>
                                        <span className="badge badge-slate">{p.module}</span>
                                    </td>
                                    {matrix.roles.map((r) => {
                                        const granted = hasPerm(r.id, p.id);
                                        const cellKey = `${r.id}-${p.id}`;
                                        return (
                                            <td key={r.id} style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleTogglePermission(r.id, p.id)}
                                                    disabled={togglingKey === cellKey}
                                                    className="btn btn-ghost"
                                                    style={{
                                                        padding: '0.32rem 0.55rem',
                                                        borderColor: granted ? 'rgba(163, 230, 53, 0.45)' : 'var(--border-subtle)',
                                                        background: granted ? 'rgba(163, 230, 53, 0.12)' : 'transparent',
                                                    }}
                                                    title={`Toggle ${p.permission_key} for ${r.code}`}
                                                >
                                                    {granted ? <Check size={16} color="#a3e635" /> : <X size={15} color="#52525b" />}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}