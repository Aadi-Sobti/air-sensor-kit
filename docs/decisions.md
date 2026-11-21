# Decisions

Agent: when the founder decides something, move it from Open to Decided with the date and reason.
Never act on an Open item without asking (the founder makes these calls).

## Decided
| Date | Decision | Why |
|---|---|---|
| 2026-11-20 | Main goal = a better, cheaper, easier kit. Fire Watch + outage features are later phases and must not drive v1 | Founder's priority |
| 2026-11-20 | New firmware from scratch in a new repo; airrohr is reference only | Current setup is too inconvenient; moving to a new nonprofit |
| 2026-11-20 | Setup: **computer + browser over USB is the primary path**; phone QR → captive portal is the backup | Least effort for people with a laptop; nobody is excluded |
| 2026-11-20 | v1 = PMS5003 only; humidity sensor added later with no API break | No DHT22 stock |
| 2026-11-20 | PMS5003 data wires on D1/D2 (not TX/RX) | Frees USB for setup, flashing, and logs |
| 2026-11-20 | Own Firebase backend + forward to Sensor.Community | Control over map and alerts; keeps open data |
| 2026-11-20 | Public location rounded to about a block (H3 cell) | Privacy for home sensors |
| 2026-11-20 | Outage resilience: plan only, nothing built in v1 | Keep v1 cheap and simple |
| 2026-11-20 | Owners check/manage their sensor on the website (installable web app) and can link it to Fire Watch later. Each kit's card carries a private **owner code** issued at packing | No accounts needed; makes later linking possible without recalling kits |
| 2026-11-21 | Name: **ProseFire** as a placeholder (#1 stays provisional). Name lives in `firmware/src/config.h`, `web/src/i18n.ts`, docs | Unblocks M0; easy to rename |
| 2026-11-21 | Code on GitHub: **public** repo `Aadi-Sobti/air-sensor-kit`. No license yet (#15 open) | Founder choice; unlimited free CI minutes |
| 2026-11-21 | Setup page + tools accept USB chips **CH340 (0x1A86), FTDI (0x0403), CP210x (0x10C4)**; kits still buy CH340 boards | Founder's dev board is FTDI FT232R; no cost change |
| 2026-11-21 | Dev tools via Homebrew (platformio, firebase-cli, node@22, python@3.12). Functions run on Node 22 (deprecated by Google 2027-04-30 → move to Node 24 before then) | Founder approved |
| 2026-11-21 | Approved dependencies (none on the device): pyserial (BSD), pytest (MIT), firebase-functions/firebase-admin/firebase/@firebase/rules-unit-testing (Apache-2.0), TypeScript (Apache-2.0), mocha + @types/mocha + @types/node (MIT, type definitions only), Vite + Vitest (MIT) | Build/test/web only; $0 |
| 2026-11-21 | Local dev-assistant config stays out of the public repo; no tool credit lines in commits/PRs | Founder request |
| 2026-11-21 | **Provisional** (founder answered "Yes, all, as provisional" to the agent's question on 2026-11-21, covering #3 #4 #5 #6): #3 RUNNING light = short blip every ~5 s | Shows the sensor is alive |
| 2026-11-21 | **Provisional**: #5 separate Firebase project from Fire Watch | Separate nonprofit |
| 2026-11-21 | **Provisional**: #6 continuous measurement (no duty-cycling), uploads every ~2.5 min | Simple; revisit for sensor lifespan |
| 2026-11-21 | Implementation detail (agent): the PMS is read in passive mode, one request every 2.5 s | Sensor only talks when asked; detects a rebooted sensor |
| 2026-11-21 | **Provisional** #4: readings storage = design B (hourly bucket doc per sensor, 35-day TTL, nightly raw archive to Cloud Storage). ≈ $2 / $37 / $380 per month at 100 / 1k / 10k sensors (docs/COSTS.md) | Cheapest at every size; raw kept forever; idempotent by design |
| 2026-11-21 | Implementation detail (agent): the HMAC key is stored as-is in `device_secrets/{id}` (no client access), not as a hash: verifying an HMAC needs the key itself | backend.md's `secretHash` couldn't work |
| 2026-11-21 | The agent may merge milestone PRs in order once GitHub CI is green | Founder answer (supersedes "founder merges") |
| 2026-11-21 | Setup hotspot fallback (3 min of failing WiFi) **only at startup**, before the saved network has connected; a later router outage never opens it | Founder: matches spec; no setup network appearing during outages |
| 2026-11-21 | LED double blink = **WiFi problems only**. Sensor faults are reported in uploads and shown on the owner page | Founder: keeps the light simple, matches USER_FLOW |
| 2026-11-21 | Setup hotspot **never times out while no WiFi is saved** (SETUP). The 15-min idle timeout applies only to the startup fallback | Founder: a new sensor stays ready for phone setup |
| 2026-11-21 | #7 Setup AP is **WPA2**, password printed in the per-device QR sticker | Founder: an open AP would expose the home WiFi password |
| 2026-11-21 | #9 Map: **MapLibre + self-hosted PMTiles** on Firebase Hosting (re-check prices/usage rules before M7) | Founder: no API key, no per-view fees |
| 2026-11-21 | #10 Geocoder: **US Census Geocoder** (free, no key, US only) | Founder |
| 2026-11-21 | Claim page shows the **EPA-corrected** first reading + AQI (RH 50 % at setup) and links to the sensor page (replaces the M5 provisional ATM value) | M7 corrections exist now |
| 2026-11-21 | Implementation (agent): uploads may carry `readings: []` (health only) | Delivers a pending claim and sensor-fault health even with no reading |
| 2026-11-21 | Implementation (agent): phone-path addresses are geocoded by a backend job, not inside `ingest` (keeps uploads fast). The job must run often enough to keep USER_FLOW's "on the map in about 10 minutes" | Spec: ingest stays lean; promise to recipients stays true |
| 2026-11-21 | New dependencies approved: h3-js (Apache-2.0), maplibre-gl, pmtiles, @protomaps/basemaps (BSD-3), pmtiles CLI; Protomaps/OpenStreetMap basemap (ODbL: "© OpenStreetMap" shown); Noto Sans fonts (OFL), all self-hosted | Founder; no API keys, no third-party requests from the map |
| 2026-11-21 | Public map cells: **H3 resolution 9** (~0.105 km², a few NYC blocks) | Founder: safer while sensors are few |
| 2026-11-21 | RH for the EPA correction: **nearest NWS station** to the public cell center (User-Agent = repo URL), cached fallback ≤ 3 h, then 50 % (per Barkjohn 2021) | Founder |
| 2026-11-21 | Implementation (agent): AQI = EPA NowCast when 2 of the last 3 hours exist, else the current corrected value; offline after 30 min without a reading; indoor sensors have no public location (page by code only) | EPA TAD; privacy |

## Open (ask before building the part that needs it; ordered by when it's needed)
| # | Question | Needed by | Recommendation / notes |
|---|---|---|---|
| 1 | Final project/nonprofit name (ProseFire is a placeholder) | Before M9 labels | Used in AP name, domain, labels |
| 2 | Wire colors in the kit (which jumper wires get bought) | M2/M10 | Red=VIN, black=G, two distinct colors for D1/D2; the guide shows colors |
| 8 | Per-device QR stickers (needs a cheap label printer) vs generic card | M6/M9 | Per-device stickers: zero typing for phone users |
| 11 | Include a USB wall charger in the kit? | M10 | Adds per-kit cost; most homes have a phone charger |
| 12 | Pre-attach jumpers to the adapter at packing time? | M10 | Fewer recipient mistakes, more volunteer time |
| 13 | Languages beyond EN + ES | M10 | NYC: Haitian Creole, Chinese, Bengali, Russian… |
| 14 | Owner notices ("sensor offline", later smoke): email vs web push from the owner page | M7b | Web push: free, and works on Android and on iPhone home-screen web apps (verify current iOS support); email as an option |
| 15 | Open-source license for code; license for published data | M11 | |
| 16 | Phase 2 humidity sensor: DHT22 vs cheaper I2C part | Phase 2 | |
| 17 | Android household alerts (Fire Watch is iOS-only) | Phase 3 | Web push from the owner page may cover this |
| 18 | Optional sign-in (email link) on top of owner codes | M7b | Owner code only in v1; add sign-in when someone has many sensors (schools, groups) |
| 19 | Card layout with two QR codes (setup QR on front, "Manage my sensor" QR on back) | M9 | Test with first-time users in M10 that nobody scans the wrong one |
| 20 | What the owner page shows and allows | M7b | Status, charts, device health, rename, indoor/outdoor, move, offline notices, delete my data; never the full address |
