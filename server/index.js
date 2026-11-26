import http from 'http';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { WebSocketServer } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { pool, initDB } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HMAC_SECRET = process.env.POD_HMAC_SECRET || 'fleetpulse_secret_key_2026';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Cryptographic Password & Token Helpers ---
function hashPassword(password) {
    return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function signAuthToken(userId, roleCode) {
    const payloadObj = {
        uid: userId,
        role: roleCode,
        exp: Date.now() + 24 * 60 * 60 * 1000, // 24h expiry
    };
    const encoded = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const sig = crypto.createHmac('sha256', HMAC_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

function verifyAuthToken(token) {
    if (!token || !token.includes('.')) return null;
    const [encoded, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(encoded).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
}

async function getUserWithPermissions(userId) {
    const userRes = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.is_active, u.assigned_hub_id, u.assigned_vehicle_id,
            r.id AS role_id, r.code AS role_code, r.name AS role_name,
            h.code AS hub_code, h.city AS hub_city,
            v.plate_number AS assigned_vehicle_plate
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN hubs h ON u.assigned_hub_id = h.id
     LEFT JOIN vehicles v ON u.assigned_vehicle_id = v.id
     WHERE u.id = $1`,
        [userId]
    );
    if (userRes.rows.length === 0) return null;
    const user = userRes.rows[0];

    const permsRes = await pool.query(
        `SELECT p.permission_key
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.id ASC`,
        [user.role_id]
    );

    return {
        ...user,
        permissions: permsRes.rows.map((r) => r.permission_key),
    };
}

// --- Express RBAC Auth & Permission Middlewares ---
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const decoded = verifyAuthToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Authentication required. Please sign in.' });
        }
        const user = await getUserWithPermissions(decoded.uid);
        if (!user || !user.is_active) {
            return res.status(403).json({ error: 'Account inactive or not found.' });
        }
        req.user = user;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid session token.' });
    }
}

function requirePermission(permissionKey) {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions.includes(permissionKey)) {
            return res.status(403).json({
                error: `Access Denied: Role '${req.user?.role_code || 'UNKNOWN'}' lacks '${permissionKey}' permission.`,
                requiredPermission: permissionKey,
            });
        }
        next();
    };
}

// --- Email Transport (Real SMTP if configured, Dev Preview fallback) ---
async function sendPasswordResetEmail({ toEmail, fullName, otpCode, resetLink }) {
    const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#09090b;color:#fafafa;padding:24px;border-radius:12px;border:1px solid #f97316;">
      <h2 style="color:#f97316;margin-top:0;">FleetPulse OS — Security Credential Reset</h2>
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>Use either your 6-digit one-time verification code or the direct cryptographic reset link below (valid for 15 minutes):</p>
      <div style="background:#18181b;border:1px solid #3f3f46;padding:14px;border-radius:8px;text-align:center;font-size:26px;font-weight:bold;letter-spacing:6px;color:#a3e635;margin:16px 0;">
        ${otpCode}
      </div>
      <p style="text-align:center;margin:20px 0;">
        <a href="${resetLink}" style="background:#f97316;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Reset Password via One-Click Link
        </a>
      </p>
      <p style="font-size:12px;color:#a1a1aa;">If you did not request this reset, ignore this message.</p>
    </div>
  `;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
            from: `"FleetPulse Security" <${process.env.SMTP_USER}>`,
            to: toEmail,
            subject: `FleetPulse Password Reset Code: ${otpCode}`,
            html: htmlBody,
        });
        return { deliveryMode: 'SMTP_EMAIL_SENT' };
    }

    console.log(`\n📧 [DEV PASSWORD RESET] To: ${toEmail} | OTP: ${otpCode} | Link: ${resetLink}\n`);
    return { deliveryMode: 'DEV_PREVIEW', devOtp: otpCode, devResetLink: resetLink };
}

// --- WebSocket Real-Time Telemetry Stream ---
function broadcast(payload) {
    const message = JSON.stringify(payload);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

wss.on('connection', (ws) => {
    ws.send(
        JSON.stringify({
            type: 'CONNECTED',
            mode: 'LIVE_GPS_INGESTION',
            timestamp: new Date().toISOString(),
        })
    );
});

// --- Geospatial Math & OSRM Helpers ---
function toRad(deg) {
    return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchRealRoadRoute(origin, dest) {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM routing HTTP ${res.status}`);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error('No road route found');

    const route = data.routes[0];
    const rawCoords = route.geometry.coordinates.map(([lng, lat]) => [
        Number(lat.toFixed(5)),
        Number(lng.toFixed(5)),
    ]);
    const step = Math.max(1, Math.floor(rawCoords.length / 60));
    const waypoints = rawCoords.filter((_, idx) => idx % step === 0 || idx === rawCoords.length - 1);

    return {
        waypoints,
        distanceKm: Number((route.distance / 1000).toFixed(1)),
        durationHours: Number((route.duration / 3600).toFixed(2)),
    };
}

// ============================================================================
// REAL-WORLD DRIVER GPS TELEMETRY INGESTION (Zero Simulation)
// ============================================================================

app.get('/api/driver/my-assignment', authenticate, async (req, res) => {
    try {
        const vehicleId = req.user.assigned_vehicle_id;
        if (!vehicleId) {
            return res.json({ vehicle: null, shipment: null, remainingKm: null });
        }

        const vRes = await pool.query(`SELECT * FROM vehicles WHERE id = $1`, [vehicleId]);
        const vehicle = vRes.rows[0] || null;

        const sRes = await pool.query(
            `SELECT s.*,
              oh.code AS origin_code, oh.name AS origin_name, oh.city AS origin_city, oh.lat AS origin_lat, oh.lng AS origin_lng,
              dh.code AS dest_code, dh.name AS dest_name, dh.city AS dest_city, dh.lat AS dest_lat, dh.lng AS dest_lng, dh.geofence_radius_km
       FROM shipments s
       JOIN hubs oh ON oh.id = s.origin_hub_id
       JOIN hubs dh ON dh.id = s.dest_hub_id
       WHERE s.assigned_vehicle_id = $1
         AND s.status IN ('ASSIGNED', 'IN_TRANSIT', 'AT_HUB', 'SLA_BREACHED')
       ORDER BY s.created_at DESC
       LIMIT 1`,
            [vehicleId]
        );

        const shipment = sRes.rows[0] || null;
        let remainingKm = null;
        if (vehicle && shipment) {
            remainingKm = Number(
                haversineKm(vehicle.current_lat, vehicle.current_lng, shipment.dest_lat, shipment.dest_lng).toFixed(2)
            );
        }

        res.json({ vehicle, shipment, remainingKm });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/telemetry/ingest', authenticate, requirePermission('telemetry:ingest'), async (req, res) => {
    try {
        const {
            vehicle_id,
            lat,
            lng,
            speed_kmh = 0,
            heading = 0,
            accuracy_m = 10,
            cargo_temp_c,
            fuel_pct,
        } = req.body;

        const targetVehicleId =
            req.user.role_code === 'DRIVER'
                ? req.user.assigned_vehicle_id
                : Number(vehicle_id || req.user.assigned_vehicle_id);

        if (!targetVehicleId || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Assigned vehicle and valid GPS coordinates (lat, lng) are required.' });
        }

        const acc = Number(accuracy_m);
        if (acc > 1000) {
            return res.status(422).json({
                error: `GPS accuracy too low (${Math.round(acc)}m). Move to open sky for satellite lock.`,
            });
        }

        const vRes = await pool.query(`SELECT * FROM vehicles WHERE id = $1`, [targetVehicleId]);
        if (vRes.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found.' });
        const veh = vRes.rows[0];

        const realLat = Number(lat);
        const realLng = Number(lng);
        const realSpeed = Math.max(0, Number(speed_kmh) || 0);
        const realHeading = Number(heading) || 0;
        const realTemp = cargo_temp_c !== undefined && cargo_temp_c !== '' ? Number(cargo_temp_c) : veh.cargo_temp_c;
        const realFuel = fuel_pct !== undefined && fuel_pct !== '' ? Number(fuel_pct) : veh.fuel_pct;

        const sRes = await pool.query(
            `SELECT s.*, dh.lat AS dest_lat, dh.lng AS dest_lng, dh.geofence_radius_km, dh.code AS dest_code
       FROM shipments s
       JOIN hubs dh ON dh.id = s.dest_hub_id
       WHERE s.assigned_vehicle_id = $1
         AND s.status IN ('ASSIGNED', 'IN_TRANSIT', 'AT_HUB', 'SLA_BREACHED')
       ORDER BY s.created_at DESC
       LIMIT 1`,
            [targetVehicleId]
        );

        const activeShip = sRes.rows[0] || null;
        let nextVehicleStatus = activeShip ? 'EN_ROUTE' : veh.status;
        let nextShipmentStatus = activeShip ? activeShip.status : null;
        let distanceToDestKm = null;

        if (activeShip) {
            distanceToDestKm = haversineKm(realLat, realLng, activeShip.dest_lat, activeShip.dest_lng);
            const geofenceKm = Number(activeShip.geofence_radius_km || 3.0);
            const isHighConfidenceFix = acc <= Math.max(200, geofenceKm * 1000);

            if (distanceToDestKm <= geofenceKm && isHighConfidenceFix) {
                nextVehicleStatus = 'AT_HUB';
                if (activeShip.status !== 'AT_HUB') {
                    nextShipmentStatus = 'AT_HUB';
                    await pool.query(`UPDATE shipments SET status = 'AT_HUB' WHERE id = $1`, [activeShip.id]);
                    await pool.query(
                        `INSERT INTO shipment_events (shipment_id, from_status, to_status, notes)
             VALUES ($1, $2, 'AT_HUB', $3)`,
                        [
                            activeShip.id,
                            activeShip.status,
                            `Real GPS arrival detected inside ${activeShip.dest_code} geofence (${distanceToDestKm.toFixed(2)} km from hub).`,
                        ]
                    );
                }
            } else if (activeShip.status === 'ASSIGNED') {
                nextShipmentStatus = 'IN_TRANSIT';
                await pool.query(`UPDATE shipments SET status = 'IN_TRANSIT' WHERE id = $1`, [activeShip.id]);
                await pool.query(
                    `INSERT INTO shipment_events (shipment_id, from_status, to_status, notes)
           VALUES ($1, 'ASSIGNED', 'IN_TRANSIT', 'Driver initiated live GPS trip telemetry.')`,
                    [activeShip.id]
                );
            }

            if (activeShip.requires_cold_chain && realTemp > Number(activeShip.max_temp_c)) {
                nextShipmentStatus = 'SLA_BREACHED';
                await pool.query(`UPDATE shipments SET status = 'SLA_BREACHED' WHERE id = $1`, [activeShip.id]);

                const recentAlert = await pool.query(
                    `SELECT id FROM sla_alerts WHERE shipment_id = $1 AND alert_type = 'TEMP_EXCURSION' AND acknowledged = FALSE`,
                    [activeShip.id]
                );
                if (recentAlert.rows.length === 0) {
                    const alertMsg = `REAL SENSOR EXCURSION: ${veh.plate_number} reported ${realTemp}°C (limit ${activeShip.max_temp_c}°C) on ${activeShip.tracking_code}.`;
                    const alertIns = await pool.query(
                        `INSERT INTO sla_alerts (shipment_id, vehicle_id, alert_type, severity, message)
             VALUES ($1, $2, 'TEMP_EXCURSION', 'CRITICAL', $3)
             RETURNING *`,
                        [activeShip.id, veh.id, alertMsg]
                    );
                    broadcast({ type: 'ALERT_TRIGGERED', alert: alertIns.rows[0] });
                }
            }
        }

        const updatedVehRes = await pool.query(
            `UPDATE vehicles
       SET current_lat = $1, current_lng = $2, speed_kmh = $3, heading = $4,
           cargo_temp_c = $5, fuel_pct = $6, status = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
            [realLat, realLng, realSpeed, realHeading, realTemp, realFuel, nextVehicleStatus, targetVehicleId]
        );

        await pool.query(
            `INSERT INTO telemetry_logs (vehicle_id, shipment_id, lat, lng, speed_kmh, heading, fuel_pct, cargo_temp_c)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                targetVehicleId,
                activeShip ? activeShip.id : null,
                realLat,
                realLng,
                realSpeed,
                realHeading,
                realFuel,
                realTemp,
            ]
        );

        const updatedVeh = updatedVehRes.rows[0];
        broadcast({
            type: 'TELEMETRY_TICK',
            vehicles: [
                {
                    id: updatedVeh.id,
                    current_lat: updatedVeh.current_lat,
                    current_lng: updatedVeh.current_lng,
                    heading: updatedVeh.heading,
                    speed_kmh: updatedVeh.speed_kmh,
                    fuel_pct: updatedVeh.fuel_pct,
                    cargo_temp_c: updatedVeh.cargo_temp_c,
                    status: updatedVeh.status,
                    shipment_id: activeShip?.id || null,
                    shipment_status: nextShipmentStatus,
                },
            ],
        });

        res.json({
            vehicle: updatedVeh,
            shipment_status: nextShipmentStatus,
            distance_to_dest_km: distanceToDestKm !== null ? Number(distanceToDestKm.toFixed(2)) : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// PUBLIC AUTHENTICATION & PASSWORD RECOVERY ENDPOINTS
// ============================================================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'FleetPulse Live Production Engine', mode: 'REAL_GPS_INGESTION' });
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

        const { rows } = await pool.query(`SELECT id, password_hash, is_active FROM users WHERE LOWER(email) = LOWER($1)`, [
            email.trim(),
        ]);
        if (rows.length === 0 || rows[0].password_hash !== hashPassword(password)) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (!rows[0].is_active) {
            return res.status(403).json({ error: 'Operator account is deactivated.' });
        }

        const user = await getUserWithPermissions(rows[0].id);
        const token = signAuthToken(user.id, user.role_code);
        res.json({ token, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/bootstrap-status', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS user_count FROM users`);
        res.json({ needsBootstrap: rows[0].user_count === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/bootstrap-admin', async (req, res) => {
    try {
        const countRes = await pool.query(`SELECT COUNT(*)::int AS user_count FROM users`);
        if (countRes.rows[0].user_count > 0) {
            return res.status(403).json({
                error: 'System already initialized. Only a Fleet Super Admin can provision new operator accounts.',
            });
        }

        const { full_name, email, password } = req.body;
        if (!full_name || !email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Full name, valid email, and password (min 6 chars) are required.' });
        }

        const roleRes = await pool.query(`SELECT id FROM roles WHERE code = 'FLEET_ADMIN'`);
        const adminRoleId = roleRes.rows[0]?.id;
        if (!adminRoleId) return res.status(500).json({ error: 'FLEET_ADMIN role missing in database.' });

        const ins = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role_id)
       VALUES ($1, LOWER($2), $3, $4) RETURNING id`,
            [full_name.trim(), email.trim(), hashPassword(password), adminRoleId]
        );

        const user = await getUserWithPermissions(ins.rows[0].id);
        const token = signAuthToken(user.id, user.role_code);
        res.status(201).json({ token, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const { rows } = await pool.query(`SELECT id, full_name, email FROM users WHERE LOWER(email) = LOWER($1)`, [
            email.trim(),
        ]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No operator account registered with that email address.' });
        }

        const user = rows[0];
        const otpCode = String(crypto.randomInt(100000, 999999));
        const rawToken = crypto.randomBytes(24).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        await pool.query(`UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [user.id]);
        await pool.query(
            `INSERT INTO password_resets (user_id, otp_code, reset_token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
            [user.id, otpCode, tokenHash]
        );

        const resetLink = `${CLIENT_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
        const delivery = await sendPasswordResetEmail({
            toEmail: user.email,
            fullName: user.full_name,
            otpCode,
            resetLink,
        });

        res.json({
            message: 'Password reset instructions (6-digit OTP + reset link) dispatched.',
            email: user.email,
            ...delivery,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp_code, token, new_password } = req.body;
        if (!new_password || new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }

        let resetRecord = null;

        if (token) {
            const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
            const r = await pool.query(
                `SELECT * FROM password_resets
         WHERE reset_token_hash = $1 AND used = FALSE AND expires_at > NOW()`,
                [tokenHash]
            );
            resetRecord = r.rows[0];
        } else if (email && otp_code) {
            const r = await pool.query(
                `SELECT pr.* FROM password_resets pr
         JOIN users u ON pr.user_id = u.id
         WHERE LOWER(u.email) = LOWER($1) AND pr.otp_code = $2 AND pr.used = FALSE AND pr.expires_at > NOW()`,
                [email.trim(), String(otp_code).trim()]
            );
            resetRecord = r.rows[0];
        } else {
            return res.status(400).json({ error: 'Provide either a valid reset token link or email + 6-digit OTP.' });
        }

        if (!resetRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP / reset link.' });
        }

        await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
            hashPassword(new_password),
            resetRecord.user_id,
        ]);
        await pool.query(`UPDATE password_resets SET used = TRUE WHERE id = $1`, [resetRecord.id]);

        res.json({ message: 'Password updated successfully. You may now sign in with your new credentials.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// PERMISSION-PROTECTED FLEET OPERATIONS & ASSET PROVISIONING
// ============================================================================

app.get('/api/overview', authenticate, requirePermission('telemetry:view'), async (req, res) => {
    try {
        const [hubs, vehicles, shipments, alerts] = await Promise.all([
            pool.query('SELECT * FROM hubs ORDER BY id ASC'),
            pool.query('SELECT * FROM vehicles ORDER BY id ASC'),
            pool.query(`
        SELECT s.*,
               oh.code AS origin_code, oh.city AS origin_city,
               dh.code AS dest_code, dh.city AS dest_city,
               v.plate_number, v.driver_name, v.cargo_temp_c
        FROM shipments s
        LEFT JOIN hubs oh ON s.origin_hub_id = oh.id
        LEFT JOIN hubs dh ON s.dest_hub_id = dh.id
        LEFT JOIN vehicles v ON s.assigned_vehicle_id = v.id
        ORDER BY s.id DESC
      `),
            pool.query(`
        SELECT a.*, s.tracking_code, v.plate_number
        FROM sla_alerts a
        LEFT JOIN shipments s ON a.shipment_id = s.id
        LEFT JOIN vehicles v ON a.vehicle_id = v.id
        ORDER BY a.created_at DESC LIMIT 30
      `),
        ]);

        res.json({
            hubs: hubs.rows,
            vehicles: vehicles.rows,
            shipments: shipments.rows,
            alerts: alerts.rows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hubs', authenticate, requirePermission('asset:manage'), async (req, res) => {
    try {
        const { code, name, city, lat, lng, geofence_radius_km = 3.0 } = req.body;
        if (!code || !name || !city || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Hub code, name, city, latitude, and longitude are required.' });
        }

        const { rows } = await pool.query(
            `INSERT INTO hubs (code, name, city, lat, lng, geofence_radius_km)
       VALUES (UPPER($1), $2, $3, $4, $5, $6)
       RETURNING *`,
            [code.trim(), name.trim(), city.trim(), Number(lat), Number(lng), Number(geofence_radius_km)]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'A hub with this code already exists.' });
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vehicles', authenticate, requirePermission('asset:manage'), async (req, res) => {
    try {
        const {
            plate_number,
            model,
            driver_name,
            driver_phone,
            is_cold_chain = false,
            max_capacity_kg,
            home_hub_id,
        } = req.body;

        if (!plate_number || !model || !driver_name || !driver_phone || !max_capacity_kg || !home_hub_id) {
            return res.status(400).json({ error: 'All vehicle specifications, driver details, and home hub are required.' });
        }

        const hubRes = await pool.query(`SELECT lat, lng FROM hubs WHERE id = $1`, [Number(home_hub_id)]);
        if (hubRes.rows.length === 0) return res.status(404).json({ error: 'Selected home hub not found.' });

        const { lat, lng } = hubRes.rows[0];
        const initialTemp = is_cold_chain ? 3.8 : 24.0;

        const { rows } = await pool.query(
            `INSERT INTO vehicles (
        plate_number, model, driver_name, driver_phone, is_cold_chain,
        max_capacity_kg, used_capacity_kg, status, current_lat, current_lng,
        heading, speed_kmh, fuel_pct, cargo_temp_c
      ) VALUES (UPPER($1), $2, $3, $4, $5, $6, 0, 'IDLE', $7, $8, 0, 0, 100.0, $9)
      RETURNING *`,
            [
                plate_number.trim(),
                model.trim(),
                driver_name.trim(),
                driver_phone.trim(),
                Boolean(is_cold_chain),
                Number(max_capacity_kg),
                lat,
                lng,
                initialTemp,
            ]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Vehicle plate number is already registered.' });
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/vehicles/:id/status', authenticate, requirePermission('asset:manage'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['IDLE', 'MAINTENANCE'].includes(status)) {
            return res.status(400).json({ error: 'Manual status toggle only allowed between IDLE and MAINTENANCE.' });
        }
        const { rows } = await pool.query(
            `UPDATE vehicles SET status = $1, speed_kmh = 0, updated_at = NOW()
       WHERE id = $2 AND status IN ('IDLE', 'MAINTENANCE', 'AT_HUB')
       RETURNING *`,
            [status, req.params.id]
        );
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Cannot change status while vehicle is actively EN_ROUTE.' });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shipments', authenticate, requirePermission('shipment:create'), async (req, res) => {
    try {
        const {
            cargo_description,
            weight_kg,
            requires_cold_chain = false,
            max_temp_c = 25,
            origin_hub_id,
            dest_hub_id,
            sla_hours = 8,
        } = req.body;

        if (!cargo_description || !weight_kg || !origin_hub_id || !dest_hub_id || origin_hub_id === dest_hub_id) {
            return res.status(400).json({ error: 'Valid cargo description, weight, and distinct origin/destination hubs required.' });
        }

        const hubsRes = await pool.query('SELECT * FROM hubs WHERE id IN ($1, $2)', [origin_hub_id, dest_hub_id]);
        const origin = hubsRes.rows.find((h) => h.id === Number(origin_hub_id));
        const dest = hubsRes.rows.find((h) => h.id === Number(dest_hub_id));
        if (!origin || !dest) return res.status(404).json({ error: 'Hub not found' });

        const roadRoute = await fetchRealRoadRoute(origin, dest);
        const trackingCode = `FP-2026-${crypto.randomInt(1000, 9999)}`;

        const { rows } = await pool.query(
            `INSERT INTO shipments (
        tracking_code, cargo_description, weight_kg, requires_cold_chain, max_temp_c,
        origin_hub_id, dest_hub_id, status, route_waypoints, sla_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATED', $8::jsonb, NOW() + ($9 || ' hours')::interval)
      RETURNING *`,
            [
                trackingCode,
                cargo_description,
                Number(weight_kg),
                Boolean(requires_cold_chain),
                Number(max_temp_c),
                origin.id,
                dest.id,
                JSON.stringify(roadRoute.waypoints),
                Number(sla_hours),
            ]
        );

        await pool.query(
            `INSERT INTO shipment_events (shipment_id, from_status, to_status, notes)
       VALUES ($1, NULL, 'CREATED', $2)`,
            [
                rows[0].id,
                `Created by ${req.user.full_name} (${req.user.role_code}): ${origin.city} -> ${dest.city} (${roadRoute.distanceKm} km)`,
            ]
        );

        res.status(201).json({ ...rows[0], road_distance_km: roadRoute.distanceKm });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dispatch/optimize', authenticate, requirePermission('dispatch:execute'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const unassigned = await client.query(`
      SELECT s.*, h.lat AS origin_lat, h.lng AS origin_lng, h.city AS origin_city
      FROM shipments s
      JOIN hubs h ON s.origin_hub_id = h.id
      WHERE s.status = 'CREATED'
      ORDER BY s.sla_deadline ASC
      FOR UPDATE OF s SKIP LOCKED
    `);

        const idleVehicles = await client.query(`
      SELECT * FROM vehicles
      WHERE status = 'IDLE'
      FOR UPDATE SKIP LOCKED
    `);

        const assignments = [];
        const available = [...idleVehicles.rows];

        for (const shipment of unassigned.rows) {
            const candidates = available
                .filter((v) => {
                    if (shipment.requires_cold_chain && !v.is_cold_chain) return false;
                    const freeCap = v.max_capacity_kg - v.used_capacity_kg;
                    return freeCap >= shipment.weight_kg;
                })
                .map((v) => ({
                    vehicle: v,
                    distanceKm: haversineKm(v.current_lat, v.current_lng, shipment.origin_lat, shipment.origin_lng),
                }))
                .sort((a, b) => a.distanceKm - b.distanceKm);

            if (candidates.length === 0) continue;

            const best = candidates[0].vehicle;
            const idx = available.findIndex((v) => v.id === best.id);
            if (idx !== -1) available.splice(idx, 1);

            await client.query(
                `UPDATE vehicles
         SET status = 'EN_ROUTE', used_capacity_kg = used_capacity_kg + $1,
             updated_at = NOW()
         WHERE id = $2`,
                [shipment.weight_kg, best.id]
            );

            await client.query(
                `UPDATE shipments
         SET assigned_vehicle_id = $1, status = 'ASSIGNED', waypoint_index = 0
         WHERE id = $2`,
                [best.id, shipment.id]
            );

            await client.query(
                `INSERT INTO shipment_events (shipment_id, from_status, to_status, notes)
         VALUES ($1, 'CREATED', 'ASSIGNED', $2)`,
                [
                    shipment.id,
                    `Dispatched by ${req.user.full_name} to ${best.plate_number} (deadhead ${candidates[0].distanceKm.toFixed(1)} km)`,
                ]
            );

            assignments.push({
                tracking_code: shipment.tracking_code,
                vehicle_plate: best.plate_number,
                driver_name: best.driver_name,
                deadhead_km: Number(candidates[0].distanceKm.toFixed(1)),
            });
        }

        await client.query('COMMIT');
        res.json({ dispatchedCount: assignments.length, assignments });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/shipments/:id/deliver', authenticate, requirePermission('pod:verify'), async (req, res) => {
    const client = await pool.connect();
    try {
        const { receiver_name = req.user.full_name, signature_data = '' } = req.body;
        await client.query('BEGIN');

        const sRes = await client.query(
            `SELECT s.*, dh.code AS dest_code, dh.lat AS dest_lat, dh.lng AS dest_lng, dh.geofence_radius_km,
              v.current_lat AS veh_lat, v.current_lng AS veh_lng, v.plate_number
       FROM shipments s
       JOIN hubs dh ON s.dest_hub_id = dh.id
       LEFT JOIN vehicles v ON s.assigned_vehicle_id = v.id
       WHERE s.id = $1 FOR UPDATE OF s`,
            [req.params.id]
        );
        if (sRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Shipment not found' });
        }

        const shipment = sRes.rows[0];
        if (shipment.status === 'DELIVERED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Shipment already delivered' });
        }

        // Physical GPS Geofence Check
        if (shipment.veh_lat !== null && shipment.veh_lng !== null) {
            const distKm = haversineKm(shipment.veh_lat, shipment.veh_lng, shipment.dest_lat, shipment.dest_lng);
            const allowedRadius = Number(shipment.geofence_radius_km || 3.0);
            if (distKm > allowedRadius) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: `Geofence Lock: Vehicle ${shipment.plate_number} is currently ${distKm.toFixed(2)} km away from ${shipment.dest_code} (must be within ${allowedRadius} km to sign POD).`,
                });
            }
        }

        const sigDigest = crypto.createHash('sha256').update(String(signature_data)).digest('hex').slice(0, 16);
        const payload = `${shipment.id}:${shipment.tracking_code}:${shipment.assigned_vehicle_id}:${receiver_name}:${req.user.email}:${sigDigest}`;
        const hmacSignature = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

        await client.query(`UPDATE shipments SET status = 'DELIVERED' WHERE id = $1`, [shipment.id]);

        if (shipment.assigned_vehicle_id) {
            await client.query(
                `UPDATE vehicles
         SET status = 'IDLE', used_capacity_kg = GREATEST(0, used_capacity_kg - $1), speed_kmh = 0
         WHERE id = $2`,
                [shipment.weight_kg, shipment.assigned_vehicle_id]
            );
        }

        const podRes = await client.query(
            `INSERT INTO pod_receipts (shipment_id, vehicle_id, receiver_name, hmac_signature, signature_data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [shipment.id, shipment.assigned_vehicle_id, receiver_name, hmacSignature, signature_data || null]
        );

        await client.query(
            `INSERT INTO shipment_events (shipment_id, from_status, to_status, notes)
       VALUES ($1, $2, 'DELIVERED', $3)`,
            [
                shipment.id,
                shipment.status,
                `Geofence-verified POD signed by ${receiver_name} [${req.user.role_code}] (SHA256: ${hmacSignature.slice(0, 14)}...)`,
            ]
        );

        await client.query('COMMIT');
        res.json({ shipment_id: shipment.id, tracking_code: shipment.tracking_code, pod: podRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/shipments/:id/details', authenticate, requirePermission('telemetry:view'), async (req, res) => {
    try {
        const [events, logs, pod] = await Promise.all([
            pool.query('SELECT * FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at ASC', [req.params.id]),
            pool.query('SELECT * FROM telemetry_logs WHERE shipment_id = $1 ORDER BY recorded_at DESC LIMIT 20', [req.params.id]),
            pool.query('SELECT * FROM pod_receipts WHERE shipment_id = $1', [req.params.id]),
        ]);
        res.json({ events: events.rows, telemetry: logs.rows.reverse(), pod: pod.rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/alerts/:id/ack', authenticate, requirePermission('alert:ack'), async (req, res) => {
    try {
        const { rows } = await pool.query(`UPDATE sla_alerts SET acknowledged = TRUE WHERE id = $1 RETURNING *`, [
            req.params.id,
        ]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/copilot/query', authenticate, requirePermission('copilot:query'), async (req, res) => {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });

    let sqlQuery = '';
    let explanation = '';

    const schemaContext = `
Tables in PostgreSQL:
- hubs(id, code, name, city, lat, lng)
- vehicles(id, plate_number, model, driver_name, is_cold_chain, max_capacity_kg, used_capacity_kg, status, speed_kmh, fuel_pct, cargo_temp_c)
- shipments(id, tracking_code, cargo_description, weight_kg, requires_cold_chain, max_temp_c, origin_hub_id, dest_hub_id, assigned_vehicle_id, status, sla_deadline)
- sla_alerts(id, shipment_id, vehicle_id, alert_type, severity, message, acknowledged, created_at)
Write ONLY a valid PostgreSQL SELECT query (no markdown fences, no semicolon needed, read-only).`;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await Promise.race([
            ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${schemaContext}\nUser question: "${question}"\nReturn strictly the SQL SELECT query.`,
                config: { temperature: 0.1 },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 5500)),
        ]);
        sqlQuery = response.text.replace(/```sql|```/gi, '').trim().replace(/;+$/, '');
        explanation = 'Generated dynamically via Gemini NL-to-SQL engine.';
    } catch {
        const q = question.toLowerCase();
        if (q.includes('alert') || q.includes('breach') || q.includes('temp')) {
            sqlQuery = `SELECT a.id, a.severity, a.alert_type, s.tracking_code, v.plate_number, v.cargo_temp_c, a.message FROM sla_alerts a LEFT JOIN shipments s ON a.shipment_id = s.id LEFT JOIN vehicles v ON a.vehicle_id = v.id ORDER BY a.created_at DESC LIMIT 15`;
            explanation = 'Matched cold-chain & SLA breach telemetry query.';
        } else if (q.includes('vehicle') || q.includes('truck') || q.includes('capacity')) {
            sqlQuery = `SELECT plate_number, model, driver_name, is_cold_chain, status, used_capacity_kg, max_capacity_kg, ROUND((used_capacity_kg::numeric / max_capacity_kg) * 100, 1) AS utilization_pct, cargo_temp_c, fuel_pct FROM vehicles ORDER BY utilization_pct DESC`;
            explanation = 'Matched fleet utilization & sensor status query.';
        } else {
            sqlQuery = `SELECT s.tracking_code, s.cargo_description, s.status, s.weight_kg, s.requires_cold_chain, oh.city AS origin, dh.city AS destination, v.plate_number, v.cargo_temp_c FROM shipments s LEFT JOIN hubs oh ON s.origin_hub_id = oh.id LEFT JOIN hubs dh ON s.dest_hub_id = dh.id LEFT JOIN vehicles v ON s.assigned_vehicle_id = v.id ORDER BY s.id DESC`;
            explanation = 'Matched active shipment manifest & route status query.';
        }
    }

    const normalized = sqlQuery.toUpperCase();
    if (!normalized.startsWith('SELECT') || /(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|GRANT|EXEC)/.test(normalized)) {
        return res.status(400).json({ error: 'Blocked unsafe SQL query. Only read-only SELECT statements are permitted.' });
    }

    try {
        const result = await pool.query(sqlQuery);
        res.json({ question, sql: sqlQuery, explanation, rowCount: result.rows.length, rows: result.rows });
    } catch (sqlErr) {
        res.status(400).json({ error: `SQL execution error: ${sqlErr.message}`, sql: sqlQuery });
    }
});

// ============================================================================
// RBAC ADMIN MANAGEMENT ENDPOINTS (Requires 'rbac:manage')
// ============================================================================

app.get('/api/rbac/matrix', authenticate, requirePermission('rbac:manage'), async (req, res) => {
    try {
        const [roles, permissions, mappings, users, vehicles] = await Promise.all([
            pool.query('SELECT * FROM roles ORDER BY id ASC'),
            pool.query('SELECT * FROM permissions ORDER BY id ASC'),
            pool.query('SELECT role_id, permission_id FROM role_permissions'),
            pool.query(`
        SELECT u.id, u.full_name, u.email, u.is_active, u.assigned_vehicle_id,
               r.id AS role_id, r.code AS role_code, r.name AS role_name,
               v.plate_number AS assigned_vehicle_plate
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN vehicles v ON u.assigned_vehicle_id = v.id
        ORDER BY u.id ASC
      `),
            pool.query('SELECT id, plate_number, model, driver_name FROM vehicles ORDER BY id ASC'),
        ]);
        res.json({
            roles: roles.rows,
            permissions: permissions.rows,
            mappings: mappings.rows,
            users: users.rows,
            vehicles: vehicles.rows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rbac/users', authenticate, requirePermission('rbac:manage'), async (req, res) => {
    try {
        const { full_name, email, password, role_id, assigned_hub_id, assigned_vehicle_id } = req.body;
        if (!full_name || !email || !password || password.length < 6 || !role_id) {
            return res.status(400).json({
                error: 'Full name, email, password (min 6 chars), and assigned role are required.',
            });
        }

        const ins = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role_id, assigned_hub_id, assigned_vehicle_id)
       VALUES ($1, LOWER($2), $3, $4, $5, $6) RETURNING id`,
            [
                full_name.trim(),
                email.trim(),
                hashPassword(password),
                Number(role_id),
                assigned_hub_id ? Number(assigned_hub_id) : null,
                assigned_vehicle_id ? Number(assigned_vehicle_id) : null,
            ]
        );

        const createdUser = await getUserWithPermissions(ins.rows[0].id);
        res.status(201).json({ user: createdUser });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'An operator with this email already exists.' });
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/rbac/users/:id/role', authenticate, requirePermission('rbac:manage'), async (req, res) => {
    try {
        const { role_id, is_active, assigned_vehicle_id } = req.body;
        await pool.query(
            `UPDATE users
       SET role_id = COALESCE($1, role_id),
           is_active = COALESCE($2, is_active),
           assigned_vehicle_id = CASE WHEN $3::boolean THEN $4::int ELSE assigned_vehicle_id END
       WHERE id = $5`,
            [
                role_id || null,
                typeof is_active === 'boolean' ? is_active : null,
                assigned_vehicle_id !== undefined,
                assigned_vehicle_id ? Number(assigned_vehicle_id) : null,
                req.params.id,
            ]
        );
        const updated = await getUserWithPermissions(req.params.id);
        res.json({ user: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rbac/roles/:roleId/permissions/toggle', authenticate, requirePermission('rbac:manage'), async (req, res) => {
    try {
        const roleId = Number(req.params.roleId);
        const permissionId = Number(req.body.permission_id);

        const roleCheck = await pool.query(`SELECT code FROM roles WHERE id = $1`, [roleId]);
        const permCheck = await pool.query(`SELECT permission_key FROM permissions WHERE id = $1`, [permissionId]);
        if (roleCheck.rows[0]?.code === 'FLEET_ADMIN' && permCheck.rows[0]?.permission_key === 'rbac:manage') {
            return res.status(400).json({ error: "Cannot revoke 'rbac:manage' from FLEET_ADMIN." });
        }

        const existing = await pool.query(
            `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
            [roleId, permissionId]
        );

        if (existing.rows.length > 0) {
            await pool.query(`DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`, [
                roleId,
                permissionId,
            ]);
            res.json({ granted: false });
        } else {
            await pool.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`, [
                roleId,
                permissionId,
            ]);
            res.json({ granted: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');

app.use(express.static(clientDistPath));

app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

initDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`🚀 FleetPulse Live Production Engine (HTTP + WebSocket + Real GPS) running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Database init failed:', err);
        process.exit(1);
    });