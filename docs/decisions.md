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
| 2026-11-21 | #14 Owner notices: **web push** from /my (no email, no account); offline notice once per online → offline change | Founder |
| 2026-11-21 | #20 Owner page shows status, 24 h / 7 d chart, WiFi signal, firmware, uploads received; allows rename, inside/outside, address update (masked display), offline notices, delete my data. Never the full address | Founder |
| 2026-11-21 | "Delete my data" also deletes archived raw readings (archive files rewritten by the nightly job) | Founder |
| 2026-11-21 | Owner codes stored as a keyed hash; key (OWNER_PEPPER) + VAPID keys in Google Secret Manager | Founder; leaked DB can't be brute-forced offline |
| 2026-11-21 | Dependency: web-push (**MPL-2.0**, backend only, unmodified). I first called it MIT by mistake; founder approved MPL-2.0 | Founder |
| 2026-11-21 | Implementation (agent): owner API paths are session-scoped (`/owner/sensor`, `/owner/sensor/data`) instead of `/owner/sensors/{id}` (the session names the sensor). Sessions: 7-day sliding, **90-day absolute** limit. No per-sensor guess limit (a wrong code names no sensor); per-IP limit + global alert instead | M7b review |
| 2026-11-21 | **Residual risk (agent, for founder awareness):** the per-IP guess limit relies on Firebase Hosting's headers; someone calling the function URL directly and forging CDN headers can rotate IPs. Owner codes have ~49.5 bits, so even a month of non-stop guessing at the function's capped rate has ≈ 0.3 % chance of hitting any of 10K codes; a guessing surge logs an alert. Stronger option later: Cloud Armor / App Check | Verified the header behavior on dev 2026-11-21 |
| 2026-11-21 | Offline push notices include the safety line ("This is not a smoke alarm.") like every alert | Project safety rule |
| 2026-11-22 | Sensor.Community: share readings **after the founder confirms their data license**; forwarding stays off until then | Founder |
| 2026-11-22 | Recipients are told during setup (computer + phone, EN/ES): "Your sensor's readings (never your address) appear on our public map and are shared as open data with Sensor.Community." | Founder |
| 2026-11-22 | Only **outdoor** sensors are forwarded to Sensor.Community | Founder |
| 2026-11-22 | Sensor.Community registrations use the **public map cell center**, never the address | Founder |
| 2026-11-22 | (Agent, within spec) While a phone is on the setup WiFi and used the page in the last 5 min, the sensor **pauses retrying an unreachable saved WiFi**; retries resume when the phone leaves or goes idle. The setup WiFi opens on the home network's channel (saved one if nearby, else strongest; US channels 1–11 only) | Founder's iPhone dropped off the setup WiFi after a wrong password and couldn't rejoin: the one radio kept leaving the setup channel to search. A working connection is never paused; spec's "keep retrying" still holds whenever nobody is using setup |
| 2026-11-22 | #8 **Per-device stickers**: each kit card gets its own setup WiFi QR + owner QR (letter-size sticker sheets now, label printer later) | Founder; phone users type nothing |
| 2026-11-22 | Labels: **segno** (BSD-3, pure Python, packing-laptop tool only) for QR codes; PDF layout written in-house (no PDF library) | Founder |
| 2026-11-22 | Packing-laptop flasher: **esptool** via pip (GPL-2.0, Espressif's official tool; laptop only, nothing on the sensor). Recipients never flash anything | Founder |
| 2026-11-22 | `factory/register` auth: **per-station keys** (long random key file per packing laptop, stored hashed in the backend, revocable one by one). No accounts | Founder |
| 2026-11-22 | (Agent, within spec) OTA signatures are **RSA-2048** (the ESP8266 core's own signing format); OTA checks 2 min after first connecting, then daily + a per-device 0–59 min offset; stages bench → canary (stable per-device slice) → all; never downgrade | EC keys hit a length check bug in the core; offsets spread load |
| 2026-11-22 | (Agent) **Release builds have OTA off** until the founder creates the production key (M11); the release guard fails if the dev key ever lands in a release build | Production key is founder-only and must be backed up offline |
| 2026-11-22 | (Agent) Re-registering a board: unused (never uploaded) → same short code, new owner code (covers failed prints); in use → always refused; owner used "Delete my data" → only with `reprovision`, after the nightly archive purge finished, with every per-owner field reset (name, inside/outside, Sensor.Community registration, map entry). The tool never deletes data, and never erases a board that has a code or has uploaded | Privacy: a returned kit must never carry the previous owner's data to a new home; spec review |
| 2026-11-22 | (Agent) Label layout: one kit per row of a letter sheet of 4"×2" stickers (10 per sheet), SETUP left, OWNER right; setup password also printed as text under the QR. **Wording is a draft** for founder approval | Rows keep a kit's two labels together; text fallback if a camera can't scan |
| 2026-11-22 | (Agent) Corrected: the OTA size limit is the 1 MB max program size (not ~520 KB as I first wrote) | Read the core's Updater.cpp |
| 2026-11-22 | #2 Wire colors: **red VCC → VIN, black GND → G, blue TXD → D1, yellow RXD → D2** | Founder; blue/yellow are easy to tell apart, including for color-blind people |
| 2026-11-22 | #13 Languages for v1 guides and card: **English + Spanish**; more after the first-user tests, with native-speaker reviewers | Founder |
| 2026-11-22 | Soak test: **4 days** on home WiFi (instead of 7) | Founder; more than the 24 h acceptance check |
| 2026-11-22 | Guides cover three kit versions until #12 is decided: all 8 connections, wires pre-attached to the adapter (4), fully assembled (skip the build) | Founder: "design for both versions; some might come fully assembled" |
| 2026-11-25 | **Sensor and Fire Watch stay two products that link together.** No sensor features in the app stores: owners use the website (`/s/<code>`, `/my`). Fire Watch adds sensor features for its users (smoke layer → "Add my air sensor" via the owner code → sensors as silent-first evidence → Home Beacon). No separate sensor app. Confirms #5 (separate Firebase projects). Nothing starts before v1 ships | Founder. Keeps the kit app-free; nonprofit vs LLC ownership stays clean; a sensor problem can't slow Fire Watch alerts; no second store app to maintain |
| 2026-11-25 | **Setup always works without an app**; an optional app may come later. Owners get ways to manage a sensor after setup (replacement notices, "indoor air higher than your usual" notices). Long-term: sell a **finished product**, not only kits; link "I need help" to first responders in the Home Beacon phase. Plan and sources: `docs/PRODUCT_PLAN.md` | Founder direction; updates the same-day "no sensor app" line: still no app *required*. No v1 change; items needing a call are #20–#26 |

## Open (ask before building the part that needs it; ordered by when it's needed)
| # | Question | Needed by | Recommendation / notes |
|---|---|---|---|
| 1 | Final project/nonprofit name (ProseFire is a placeholder) | Before M9 labels | Used in AP name, domain, labels |
| 11 | Include a USB wall charger in the kit? **And a long enough cable:** the sensor should sit ~6 ft (2 m) above ground (founder 2026-11-22), so the kit's cable may not reach an outlet | M10 | Options to price: long USB cable (10 ft) vs charger + extension; decide after pricing and the first-user tests |
| 12 | Pre-attach jumpers to the adapter at packing time, or ship fully assembled? | M10 | Founder 2026-11-22: likely all 8 by the recipient; some kits may come fully assembled. Guides support all three |
| 15 | Open-source license for code; license for published data | M11 | |
| 16 | Phase 2 humidity sensor: DHT22 vs cheaper I2C part | Phase 2 | |
| 17 | Android household alerts | Phase 3 | Corrected 2026-11-25: Fire Watch is also on Android (`com.aadisobti.firewatch`, seen in the app source), so linked Android owners get alerts through Fire Watch. Web push from `/my` would only be for owners without Fire Watch |
| 18 | Optional sign-in (email link) on top of owner codes | M7b | Owner code only in v1; add sign-in when someone has many sensors (schools, groups) |
| 19 | Card layout with two QR codes (setup QR on front, "Manage my sensor" QR on back) | M9 | Test with first-time users in M10 that nobody scans the wrong one |
| 20 | Replace the kit's box + tubing with the printed case (`hardware/enclosure/`)? Changes recipient steps/wording | M10 | Print one, run its test list (fit, side-by-side readings vs bare sensor *and* vs box + tubing, hose test, sun, 2–4 week soak) first. ≈ $1.50–2.00 plastic + 3–5 h print per case |
| 21 | Indoor "higher than your usual" notice: on or off by default? | When built (`/my`) | On for indoor sensors, with quiet hours and once per event |
| 22 | Optional phone app for setup + manage | After M10 user tests | Build only if testers struggle with setup; `/my` already manages |
| 23 | FCC status of giving the public assembled kits (47 CFR 15.3(p), 15.23) | Before scaling kit distribution | Ask an FCC test lab/TCB or communications lawyer (founder-only contact) |
| 24 | Retail price of a finished sensor | v2 | Target ≈ $60–90; every public-map competitor is $209+ |
| 25 | One or two PMS sensors in the finished outdoor unit | v2 | Two (≈ +$10–20) if we want the EPA Fire and Smoke Map's A/B check |
| 26 | Family / "loved ones" alerts: inside Fire Watch first, or a separate nonprofit app | Phase 3 | Fire Watch first; a nonprofit app later with the Home Beacon if the nonprofit should own it |
| 27 | Build the Home Beacon pilot, and when | After v1 ships | Yes, after v1: start with 2 bench units, then 5 prototypes (`docs/HOME_BEACON.md`). ≈ $83 per pilot unit at verified US prices |
| 28 | Beacon: two boxes (sensor outside + beacon inside) or one box with the PMS | Before pilot | Two boxes; one box adds ≈ $18–30 and only reads indoor air |
| 29 | Beacon firmware: Meshtastic (GPL-3.0) or our own minimal firmware | Before pilot | Meshtastic for the pilot (our changes published under GPL-3.0; beacons stay reflashable over USB) |
| 30 | Beacon radio board: Heltec V3 or V4 | Before ordering | V3 (proven, $17.90–19.90); V4 has a stronger radio (28 dBm) and solar input |
| 31 | Alarm for deaf / hard-of-hearing residents: certified strobe or bed shaker | Before partner pilot | Add one for households that need it; the LED light is not a certified visual alarm |
| 32 | "I need help" sharing in the pilot: household circle only, or also a partner view | Before 5-prototype pilot | Household circle only; partner view with a fire-department partner later |
| 33 | Beacon battery: 4400 mAh ($19.95) or 6600 mAh ($24.50) | Before ordering | 4400 mAh for bench units; decide after measuring real current |
| 34 | Who builds pilot beacons (soldering required) | Before 5-prototype pilot | Founder + volunteers with a test sheet per unit, or a maker partner |
