import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Radar,
    Lock,
    Mail,
    ShieldPlus,
    KeyRound,
    ShieldCheck,
    ArrowLeft,
    CheckCircle2,
    AlertCircle,
    Sparkles,
} from 'lucide-react';

const API = '/api';

export default function AuthPage({ onAuthSuccess }) {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const urlToken = searchParams.get('token') || '';
    const urlEmail = searchParams.get('email') || '';

    const [needsBootstrap, setNeedsBootstrap] = useState(false);
    const [checkingBootstrap, setCheckingBootstrap] = useState(true);
    const [mode, setMode] = useState(urlToken ? 'reset' : 'login'); // login | bootstrap | forgot | reset

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState(urlEmail);
    const [password, setPassword] = useState('');

    const [otpCode, setOtpCode] = useState('');
    const [resetToken, setResetToken] = useState(urlToken);
    const [newPassword, setNewPassword] = useState('');
    const [resetPreview, setResetPreview] = useState(null);

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        axios
            .get(`${API}/auth/bootstrap-status`)
            .then(({ data }) => {
                setNeedsBootstrap(Boolean(data.needsBootstrap));
                if (data.needsBootstrap && !urlToken) {
                    setMode('bootstrap');
                }
            })
            .catch(() => { })
            .finally(() => setCheckingBootstrap(false));
    }, [urlToken]);

    useEffect(() => {
        if (urlToken) {
            setMode('reset');
            setResetToken(urlToken);
            if (urlEmail) setEmail(urlEmail);
        }
    }, [urlToken, urlEmail]);

    const clearBanners = () => {
        setErrorMsg('');
        setSuccessMsg('');
    };

    const handleBootstrapAdmin = async (e) => {
        e.preventDefault();
        clearBanners();
        setLoading(true);
        try {
            const { data } = await axios.post(`${API}/auth/bootstrap-admin`, {
                full_name: fullName,
                email,
                password,
            });
            onAuthSuccess(data.token, data.user);
            navigate('/');
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Admin initialization failed');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        clearBanners();
        setLoading(true);
        try {
            const { data } = await axios.post(`${API}/auth/login`, { email, password });
            onAuthSuccess(data.token, data.user);
            navigate(data.user?.role_code === 'DRIVER' ? '/driver' : '/');
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Sign-in failed');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        clearBanners();
        setLoading(true);
        try {
            const { data } = await axios.post(`${API}/auth/forgot-password`, { email });
            setResetPreview(data);
            setSuccessMsg(data.message);
            setMode('reset');
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to dispatch reset credentials');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        clearBanners();
        setLoading(true);
        try {
            const payload = resetToken
                ? { token: resetToken, new_password: newPassword }
                : { email, otp_code: otpCode, new_password: newPassword };

            const { data } = await axios.post(`${API}/auth/reset-password`, payload);
            setSuccessMsg(data.message);
            setResetPreview(null);
            setResetToken('');
            setOtpCode('');
            setPassword('');
            setNewPassword('');
            setMode('login');
            navigate('/login');
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Password reset failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem 1rem',
            }}
        >
            <div
                className="panel"
                style={{
                    width: '100%',
                    maxWidth: '470px',
                    borderColor: 'rgba(249, 115, 22, 0.35)',
                    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
                }}
            >
                <div
                    style={{
                        padding: '1.6rem 1.8rem 1.35rem',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(163,230,53,0.06))',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div className="brand-logo">
                            <Radar size={22} />
                        </div>
                        <div>
                            <div className="brand-title">
                                FleetPulse <span className="brand-tag">RBAC Gate</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {needsBootstrap
                                    ? 'First-Time Fleet Super Admin Provisioning'
                                    : 'Admin-Provisioned Operator Access Control'}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '1.6rem 1.8rem' }}>
                    {checkingBootstrap ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>
                            Verifying RBAC directory status...
                        </div>
                    ) : (
                        <>
                            {errorMsg && (
                                <div
                                    className="telemetry-card breached"
                                    style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fda4af', fontSize: '0.84rem' }}
                                >
                                    <AlertCircle size={16} />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            {successMsg && (
                                <div
                                    style={{
                                        marginBottom: '1rem',
                                        padding: '0.8rem 1rem',
                                        borderRadius: '10px',
                                        background: 'rgba(163, 230, 53, 0.12)',
                                        border: '1px solid rgba(163, 230, 53, 0.35)',
                                        color: '#bef264',
                                        fontSize: '0.84rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                >
                                    <CheckCircle2 size={16} />
                                    <span>{successMsg}</span>
                                </div>
                            )}

                            {resetPreview?.devOtp && (
                                <div
                                    style={{
                                        marginBottom: '1.1rem',
                                        padding: '0.9rem 1rem',
                                        borderRadius: '12px',
                                        background: '#050507',
                                        border: '1px solid rgba(249, 115, 22, 0.45)',
                                        fontSize: '0.8rem',
                                    }}
                                >
                                    <div style={{ fontWeight: 700, color: '#fb923c', marginBottom: '0.35rem' }}>
                                        Dispatched Verification Credentials
                                    </div>
                                    <div className="mono" style={{ color: '#a3e635', fontSize: '0.92rem', marginBottom: '0.45rem' }}>
                                        6-Digit OTP: <strong>{resetPreview.devOtp}</strong>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        style={{ width: '100%', fontSize: '0.76rem', padding: '0.4rem' }}
                                        onClick={() => {
                                            const tokenParam = new URL(resetPreview.devResetLink).searchParams.get('token');
                                            setResetToken(tokenParam || '');
                                            setOtpCode(resetPreview.devOtp);
                                        }}
                                    >
                                        <Sparkles size={13} color="#f97316" /> Auto-Fill OTP &amp; Reset Token
                                    </button>
                                </div>
                            )}

                            {/* INITIAL SUPER ADMIN BOOTSTRAP (ONLY WHEN USERS TABLE IS EMPTY) */}
                            {mode === 'bootstrap' && (
                                <form onSubmit={handleBootstrapAdmin}>
                                    <div
                                        style={{
                                            fontSize: '0.82rem',
                                            color: 'var(--text-secondary)',
                                            marginBottom: '1rem',
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        No users exist in the database yet. Create the root <strong>FLEET_ADMIN</strong> account. Once created, all additional operator accounts and role assignments are managed inside the RBAC Security Console.
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Super Admin Full Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Enter your full name"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Admin Email Address</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="admin@yourdomain.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Master Password (min 6 characters)</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            minLength={6}
                                            required
                                        />
                                    </div>

                                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                                        <ShieldPlus size={16} />
                                        {loading ? 'Provisioning Fleet Super Admin...' : 'Initialize Fleet Super Admin'}
                                    </button>
                                </form>
                            )}

                            {/* SIGN IN FORM */}
                            {mode === 'login' && (
                                <form onSubmit={handleLogin}>
                                    <div className="form-group">
                                        <label className="form-label">Assigned Operator Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="operator@yourdomain.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label className="form-label">Password</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    clearBanners();
                                                    setMode('forgot');
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#fb923c',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Forgot password?
                                            </button>
                                        </div>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="Enter your password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.4rem' }} disabled={loading}>
                                        <Lock size={16} />
                                        {loading ? 'Authenticating...' : 'Sign In to FleetPulse'}
                                    </button>

                                    <div style={{ marginTop: '1.15rem', fontSize: '0.76rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        Operator accounts, roles, and permissions are provisioned by your <span className="mono">FLEET_ADMIN</span>.
                                    </div>
                                </form>
                            )}

                            {/* FORGOT PASSWORD FORM */}
                            {mode === 'forgot' && (
                                <form onSubmit={handleForgotPassword}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                                        Enter your registered operator email to receive a <strong>6-digit verification OTP</strong> and a <strong>one-click cryptographic reset link</strong>.
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Registered Email Address</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                                        <Mail size={16} />
                                        {loading ? 'Dispatching Reset Code...' : 'Send Email OTP & Reset Link'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        style={{ width: '100%', marginTop: '0.65rem' }}
                                        onClick={() => {
                                            clearBanners();
                                            setMode('login');
                                        }}
                                    >
                                        <ArrowLeft size={15} /> Back to Sign In
                                    </button>
                                </form>
                            )}

                            {/* RESET PASSWORD FORM */}
                            {mode === 'reset' && (
                                <form onSubmit={handleResetPassword}>
                                    {!resetToken ? (
                                        <>
                                            <div className="form-group">
                                                <label className="form-label">Operator Email</label>
                                                <input
                                                    type="email"
                                                    className="form-input"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">6-Digit Email OTP Code</label>
                                                <input
                                                    type="text"
                                                    maxLength={6}
                                                    className="form-input mono"
                                                    placeholder="123456"
                                                    value={otpCode}
                                                    onChange={(e) => setOtpCode(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            style={{
                                                marginBottom: '1rem',
                                                padding: '0.65rem 0.85rem',
                                                borderRadius: '10px',
                                                background: 'rgba(249, 115, 22, 0.1)',
                                                border: '1px solid rgba(249, 115, 22, 0.35)',
                                                fontSize: '0.78rem',
                                                color: '#fb923c',
                                            }}
                                        >
                                            <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                                            Verified cryptographic reset link token attached.
                                        </div>
                                    )}

                                    <div className="form-group">
                                        <label className="form-label">New Password (min 6 characters)</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            minLength={6}
                                            required
                                        />
                                    </div>

                                    <button type="submit" className="btn btn-emerald" style={{ width: '100%' }} disabled={loading}>
                                        <KeyRound size={16} />
                                        {loading ? 'Updating Credentials...' : 'Confirm Password Reset'}
                                    </button>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}