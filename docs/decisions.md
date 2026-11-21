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
| 2026-11-21 | Merging PRs stays with the founder (the agent was not allowed to merge); milestone PRs are stacked | Founder reviews each milestone |

## Open (ask before building the part that needs it; ordered by when it's needed)
| # | Question | Needed by | Recommendation / notes |
|---|---|---|---|
| 1 | Final project/nonprofit name (ProseFire is a placeholder) | Before M9 labels | Used in AP name, domain, labels |
| 2 | Wire colors in the kit (which jumper wires get bought) | M2/M10 | Red=VIN, black=G, two distinct colors for D1/D2; the guide shows colors |
| 4 | Readings storage design (cost table first) | M3 | Decide from the cost table |
| 7 | Setup AP security: WPA2 password in QR vs open network | M6 | WPA2: an open AP would send the home WiFi password unencrypted |
| 8 | Per-device QR stickers (needs a cheap label printer) vs generic card | M6/M9 | Per-device stickers: zero typing for phone users |
| 9 | Map library + tile source | M7 | Compare cost + usage policies first |
| 10 | Geocoder | M7 | US Census Geocoder (free for US addresses) |
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
