import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initDB() {
  // 1. Regional Logistics Hubs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hubs (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      geofence_radius_km DOUBLE PRECISION DEFAULT 2.5
    );
  `);

  // 2. Fleet Vehicles & Live Sensor State
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      plate_number VARCHAR(25) UNIQUE NOT NULL,
      model TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      driver_phone VARCHAR(20) NOT NULL,
      is_cold_chain BOOLEAN DEFAULT FALSE,
      max_capacity_kg INT NOT NULL,
      used_capacity_kg INT DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'IDLE'
        CHECK (status IN ('IDLE', 'EN_ROUTE', 'AT_HUB', 'MAINTENANCE')),
      current_lat DOUBLE PRECISION NOT NULL,
      current_lng DOUBLE PRECISION NOT NULL,
      heading INT DEFAULT 0,
      speed_kmh DOUBLE PRECISION DEFAULT 0,
      fuel_pct DOUBLE PRECISION DEFAULT 85.0,
      cargo_temp_c DOUBLE PRECISION DEFAULT 4.0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Freight Shipments & Finite-State Machine
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      tracking_code VARCHAR(30) UNIQUE NOT NULL,
      cargo_description TEXT NOT NULL,
      weight_kg INT NOT NULL,
      requires_cold_chain BOOLEAN DEFAULT FALSE,
      max_temp_c DOUBLE PRECISION DEFAULT 25.0,
      origin_hub_id INT REFERENCES hubs(id),
      dest_hub_id INT REFERENCES hubs(id),
      assigned_vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
      status VARCHAR(25) NOT NULL DEFAULT 'CREATED'
        CHECK (status IN ('CREATED', 'ASSIGNED', 'IN_TRANSIT', 'AT_HUB', 'DELIVERED', 'SLA_BREACHED')),
      route_waypoints JSONB DEFAULT '[]'::jsonb,
      waypoint_index INT DEFAULT 0,
      sla_deadline TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Time-Series Telemetry History
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_logs (
      id SERIAL PRIMARY KEY,
      vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
      shipment_id INT REFERENCES shipments(id) ON DELETE SET NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      speed_kmh DOUBLE PRECISION NOT NULL,
      heading INT DEFAULT 0,
      cargo_temp_c DOUBLE PRECISION NOT NULL,
      fuel_pct DOUBLE PRECISION NOT NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Real-Time SLA & Cold-Chain Alerts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sla_alerts (
      id SERIAL PRIMARY KEY,
      shipment_id INT REFERENCES shipments(id) ON DELETE CASCADE,
      vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
      alert_type VARCHAR(30) NOT NULL,
      severity VARCHAR(15) NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')),
      message TEXT NOT NULL,
      acknowledged BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. Immutable Shipment State Audit Trail
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_events (
      id SERIAL PRIMARY KEY,
      shipment_id INT REFERENCES shipments(id) ON DELETE CASCADE,
      from_status VARCHAR(25),
      to_status VARCHAR(25) NOT NULL,
      notes TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7. Cryptographic Proof-of-Delivery (POD) Receipts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pod_receipts (
      id SERIAL PRIMARY KEY,
      shipment_id INT UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
      vehicle_id INT REFERENCES vehicles(id),
      receiver_name TEXT NOT NULL,
      hmac_signature TEXT NOT NULL,
      signature_data TEXT,
      delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 8. RBAC Roles
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  // 9. Granular System Permissions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      permission_key VARCHAR(50) UNIQUE NOT NULL,
      module VARCHAR(30) NOT NULL,
      description TEXT NOT NULL
    );
  `);

  // 10. Role-to-Permission Mapping
  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INT REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );
  `);

  // 11. Authenticated Control Tower Operators & Drivers
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email VARCHAR(120) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INT REFERENCES roles(id) ON DELETE RESTRICT,
      assigned_hub_id INT REFERENCES hubs(id) ON DELETE SET NULL,
      assigned_vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 12. Cryptographic Password Reset OTPs & Magic Links
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      otp_code VARCHAR(6) NOT NULL,
      reset_token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Idempotent column migrations for existing databases
  await pool.query(`ALTER TABLE telemetry_logs ADD COLUMN IF NOT EXISTS heading INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE pod_receipts ADD COLUMN IF NOT EXISTS signature_data TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL;`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle ON telemetry_logs(vehicle_id, recorded_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);`);

  await seedInitialFleet();
  await seedRBAC();
  console.log('✅ FleetPulse 12-table RBAC + Live GPS + OSRM highway schema ready');
}

async function seedInitialFleet() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM hubs');
  if (rows[0].count > 0) return;

  const hubRes = await pool.query(`
    INSERT INTO hubs (code, name, city, lat, lng, geofence_radius_km) VALUES
      ('HYD-SEC', 'Secunderabad Central Cold Hub', 'Secunderabad', 17.4399, 78.4983, 3.0),
      ('BLR-EC', 'Bengaluru Electronic City Freight Terminal', 'Bengaluru', 12.8456, 77.6603, 3.0),
      ('VJA-NH16', 'Vijayawada NH-16 Gateway Hub', 'Vijayawada', 16.5062, 80.6480, 2.5),
      ('MUM-BHI', 'Bhiwandi Mega Logistics Park', 'Mumbai', 19.2813, 73.0483, 3.5),
      ('CHN-SRI', 'Sriperumbudur Industrial Corridor Hub', 'Chennai', 12.9675, 79.9419, 3.0)
    RETURNING id, code, lat, lng;
  `);

  const hubMap = Object.fromEntries(hubRes.rows.map((h) => [h.code, h.id]));

  async function getSeedRoute(originCode, destCode) {
    const o = hubRes.rows.find((h) => h.code === originCode);
    const d = hubRes.rows.find((h) => h.code === destCode);
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const data = await r.json();
    const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [
      Number(lat.toFixed(5)),
      Number(lng.toFixed(5)),
    ]);
    const step = Math.max(1, Math.floor(coords.length / 45));
    return coords.filter((_, idx) => idx % step === 0 || idx === coords.length - 1);
  }

  const [hydToBlr, hydToVja, blrToChn, hydToMum] = await Promise.all([
    getSeedRoute('HYD-SEC', 'BLR-EC'),
    getSeedRoute('HYD-SEC', 'VJA-NH16'),
    getSeedRoute('BLR-EC', 'CHN-SRI'),
    getSeedRoute('HYD-SEC', 'MUM-BHI'),
  ]);

  const vehRes = await pool.query(
    `INSERT INTO vehicles (
      plate_number, model, driver_name, driver_phone, is_cold_chain,
      max_capacity_kg, used_capacity_kg, status, current_lat, current_lng,
      heading, speed_kmh, fuel_pct, cargo_temp_c
    ) VALUES
      ('TS-10-FA-5504', 'Eicher Pro 6028 Reefer', 'Venkat Rao', '+91-98490-11205', TRUE, 12000, 0, 'IDLE', 17.4399, 78.4983, 0, 0.0, 94.0, 3.5),
      ('KA-51-MN-9023', 'Tata Signa 2823.K', 'Prashanth K', '+91-98490-11206', FALSE, 18000, 0, 'IDLE', 12.8456, 77.6603, 0, 0.0, 91.0, 23.0)
    RETURNING id, plate_number;`
  );

  const shipRes = await pool.query(
    `INSERT INTO shipments (
      tracking_code, cargo_description, weight_kg, requires_cold_chain, max_temp_c,
      origin_hub_id, dest_hub_id, assigned_vehicle_id, status, route_waypoints, waypoint_index, sla_deadline
    ) VALUES
      ('FP-2026-8805', 'Oncology Temperature-Sensitive Vials', 4200, TRUE, 7.0, $1, $2, NULL, 'CREATED', $3::jsonb, 0, NOW() + INTERVAL '9 hours'),
      ('FP-2026-8806', 'Industrial Lithium Battery Modules', 9500, FALSE, 35.0, $2, $4, NULL, 'CREATED', $5::jsonb, 0, NOW() + INTERVAL '7 hours')
    RETURNING id, tracking_code, status;`,
    [
      hubMap['HYD-SEC'],
      hubMap['BLR-EC'],
      JSON.stringify(hydToBlr),
      hubMap['CHN-SRI'],
      JSON.stringify(blrToChn),
    ]
  );

  for (const s of shipRes.rows) {
    await pool.query(
      `INSERT INTO shipment_events (shipment_id, from_status, to_status, notes)
       VALUES ($1, NULL, $2, 'Initial freight manifest registered with OSRM highway geometry')`,
      [s.id, s.status]
    );
  }
}

async function seedRBAC() {
  // 1. Seed 5 Enterprise Roles (including DRIVER)
  const roleRes = await pool.query(`
    INSERT INTO roles (code, name, description) VALUES
      ('FLEET_ADMIN', 'Fleet Super Admin', 'Unrestricted access to dispatch, telemetry, POD verification, assets, and RBAC.'),
      ('DISPATCHER', 'Dispatch Commander', 'Creates freight orders, runs ACID bin-packing dispatch, and manages SLA alerts.'),
      ('DRIVER', 'Fleet Vehicle Operator', 'Streams live hardware GPS & reefer telemetry from bound vehicles.'),
      ('DOCK_OFFICER', 'Hub Dock Officer', 'Verifies inbound arrivals and executes HMAC-SHA256 Proof-of-Delivery sign-off.'),
      ('AUDITOR', 'Compliance Auditor', 'Read-only access to live geospatial telemetry and SQL operations copilot.')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
    RETURNING id, code;
  `);
  const rMap = Object.fromEntries(roleRes.rows.map((r) => [r.code, r.id]));

  // 2. Seed 10 Granular Permissions (including telemetry:ingest)
  const permRes = await pool.query(`
    INSERT INTO permissions (permission_key, module, description) VALUES
      ('telemetry:view', 'War Room', 'View live geospatial map, truck telemetry, and active alerts'),
      ('telemetry:ingest', 'Driver GPS', 'Stream real device GPS coordinates and cargo probe readings'),
      ('shipment:create', 'Dispatch', 'Register new freight manifests into the dispatch queue'),
      ('dispatch:execute', 'Dispatch', 'Execute ACID auto-dispatch solver to assign trucks'),
      ('pod:verify', 'Shipments & POD', 'Generate cryptographic HMAC-SHA256 Proof-of-Delivery receipts'),
      ('alert:ack', 'War Room', 'Acknowledge cold-chain and route deviation SLA alerts'),
      ('copilot:query', 'SQL Copilot', 'Execute read-only natural-language SQL queries'),
      ('rbac:manage', 'Security', 'Create users, assign user roles, and configure role permissions'),
      ('asset:manage', 'Fleet Assets', 'Register new regional hubs, geofences, and fleet vehicles')
    ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description
    RETURNING id, permission_key;
  `);
  const pMap = Object.fromEntries(permRes.rows.map((p) => [p.permission_key, p.id]));

  // 3. Seed Default Role -> Permission Mappings
  const matrix = {
    FLEET_ADMIN: Object.keys(pMap),
    DISPATCHER: ['telemetry:view', 'shipment:create', 'dispatch:execute', 'alert:ack', 'copilot:query'],
    DRIVER: ['telemetry:view', 'telemetry:ingest'],
    DOCK_OFFICER: ['telemetry:view', 'pod:verify', 'alert:ack'],
    AUDITOR: ['telemetry:view', 'copilot:query'],
  };

  for (const [roleCode, permKeys] of Object.entries(matrix)) {
    for (const key of permKeys) {
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [rMap[roleCode], pMap[key]]
      );
    }
  }

  console.log('✅ FleetPulse RBAC 5 roles & 9 permissions initialized');
}