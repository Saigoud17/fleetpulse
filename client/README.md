
# FleetPulse OS v2.6
Real-time geospatial freight, cold-chain telemetry, and RBAC control tower built with React, Leaflet, Node.js/Express, WebSockets, and PostgreSQL.

## Core Capabilities
- **Live Hardware GPS Telemetry:** Streams real smartphone satellite coordinates (`navigator.geolocation`) over WebSockets (`ws://` / `wss://`) with automated geofence detection.
- **Cold-Chain & SLA Watchdogs:** Continuous thermal excursion monitoring and unacknowledged alert management.
- **ACID Algorithmic Dispatch:** Row-locked (`FOR UPDATE SKIP LOCKED`) bin-packing matching payload capacity, cold-chain rating, and OSRM road routing.
- **Cryptographic Proof of Delivery (POD):** Geofence-locked digital signature capture signed with HMAC-SHA256.
- **Granular RBAC & SQL Copilot:** Role-to-permission matrix (`FLEET_ADMIN`, `DISPATCHER`, `DRIVER`, etc.) and read-only natural-language PostgreSQL query console.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `POD_HMAC_SECRET` — Secret key for JWT/HMAC signatures
- `GEMINI_API_KEY` — Google Gemini API key for NL-to-SQL Copilot
- `CLIENT_URL` — Deployed frontend HTTPS origin
