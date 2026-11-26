import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from './components/Navbar';
import WarRoom from './pages/WarRoom';
import DispatchConsole from './pages/DispatchConsole';
import ShipmentsPod from './pages/ShipmentsPod';
import SqlCopilot from './pages/SqlCopilot';
import RbacAdmin from './pages/RbacAdmin';
import AuthPage from './pages/AuthPage';
import FleetAssets from './pages/FleetAssets';
import DriverTerminal from './pages/DriverTerminal';
import './App.css';

const API = '/api';
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('fp_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fp_user') || 'null');
    } catch {
      return null;
    }
  });

  const [hubs, setHubs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [simState, setSimState] = useState({ running: true, speed: 1 });
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  // Attach Bearer token to every Axios request
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const handleAuthSuccess = (newToken, newUser) => {
    localStorage.setItem('fp_token', newToken);
    localStorage.setItem('fp_user', JSON.stringify(newUser));
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('fp_token');
    localStorage.removeItem('fp_user');
    delete axios.defaults.headers.common['Authorization'];
    setToken('');
    setUser(null);
  }, []);

  const handleUserUpdated = (updatedUser) => {
    localStorage.setItem('fp_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const fetchOverview = useCallback(async () => {
    if (!token) return;
    try {
      const [meRes, ovRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/overview`),
      ]);
      if (meRes.data?.user) {
        handleUserUpdated(meRes.data.user);
      }
      const data = ovRes.data;
      setHubs(data.hubs || []);
      setVehicles(data.vehicles || []);
      setShipments(data.shipments || []);
      setAlerts(data.alerts || []);
      setSimState({
        running: data.simulationRunning ?? true,
        speed: data.simSpeedMultiplier ?? 1,
      });
    } catch (err) {
      if (err.response?.status === 401) {
        handleLogout();
      }
    }
  }, [token, handleLogout]);

  useEffect(() => {
    if (token) {
      fetchOverview();
    }
  }, [token, fetchOverview]);

  useEffect(() => {
    if (!token) return;
    let reconnectTimer;

    function connectWs() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'CONNECTED' || msg.type === 'SIM_STATE') {
            setSimState({
              running: msg.simulationRunning,
              speed: msg.simSpeedMultiplier,
            });
          }

          if (msg.type === 'TELEMETRY_TICK' && Array.isArray(msg.vehicles)) {
            const updatesById = Object.fromEntries(msg.vehicles.map((v) => [v.id, v]));

            setVehicles((prev) =>
              prev.map((v) =>
                updatesById[v.id]
                  ? {
                    ...v,
                    current_lat: updatesById[v.id].current_lat,
                    current_lng: updatesById[v.id].current_lng,
                    heading: updatesById[v.id].heading,
                    speed_kmh: updatesById[v.id].speed_kmh,
                    fuel_pct: updatesById[v.id].fuel_pct,
                    cargo_temp_c: updatesById[v.id].cargo_temp_c,
                    status: updatesById[v.id].status,
                  }
                  : v
              )
            );

            const shipUpdates = Object.fromEntries(
              msg.vehicles.map((v) => [v.shipment_id, v.shipment_status])
            );
            setShipments((prev) =>
              prev.map((s) =>
                shipUpdates[s.id] ? { ...s, status: shipUpdates[s.id] } : s
              )
            );
          }

          if (msg.type === 'ALERT_TRIGGERED' && msg.alert) {
            setAlerts((prev) => [msg.alert, ...prev]);
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 2500);
      };
    }

    connectWs();
    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [token]);

  const perms = user?.permissions || [];
  const hasPerm = (p) => perms.includes(p);
  const activeAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <BrowserRouter>
      {!token || !user ? (
        <Routes>
          <Route path="/reset-password" element={<AuthPage onAuthSuccess={handleAuthSuccess} />} />
          <Route path="*" element={<AuthPage onAuthSuccess={handleAuthSuccess} />} />
        </Routes>
      ) : (
        <>
          <Navbar
            wsConnected={wsConnected}
            activeAlertsCount={activeAlertsCount}
            user={user}
            onLogout={handleLogout}
          />
          <Routes>
            <Route
              path="/"
              element={
                <WarRoom
                  hubs={hubs}
                  vehicles={vehicles}
                  shipments={shipments}
                  alerts={alerts}
                  simState={simState}
                  onRefresh={fetchOverview}
                  user={user}
                />
              }
            />
            <Route
              path="/dispatch"
              element={
                hasPerm('shipment:create') || hasPerm('dispatch:execute') ? (
                  <DispatchConsole
                    hubs={hubs}
                    vehicles={vehicles}
                    shipments={shipments}
                    onRefresh={fetchOverview}
                    user={user}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/shipments"
              element={<ShipmentsPod shipments={shipments} onRefresh={fetchOverview} user={user} />}
            />
            <Route
              path="/copilot"
              element={hasPerm('copilot:query') ? <SqlCopilot /> : <Navigate to="/" replace />}
            />
            <Route
              path="/rbac"
              element={
                hasPerm('rbac:manage') ? (
                  <RbacAdmin currentUser={user} onUserUpdated={handleUserUpdated} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/driver"
              element={
                hasPerm('telemetry:ingest') ? (
                  <DriverTerminal user={user} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/assets"
              element={
                hasPerm('asset:manage') ? (
                  <FleetAssets hubs={hubs} vehicles={vehicles} onRefresh={fetchOverview} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      )}
    </BrowserRouter>
  );
}