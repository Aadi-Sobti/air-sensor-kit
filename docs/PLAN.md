# Plan and status

How to use this file (agent): read it at the start of each session. Work the current milestone top to
bottom. Tick a box only with evidence. Keep "Waiting on founder" current. Add one line to the session log
per session. Acceptance checks marked 👤 need the founder (hardware, phone, browser, accounts, approvals).

**Current milestone:** M4 (needs the founder's Firebase dev project) · M0–M3 done; M5/M7 groundwork next
**Waiting on founder:**
- [ ] Keep the board plugged in (USB + iPhone hotspot on with Maximize Compatibility) for the 24 h soak.
- [ ] 👤 M1 smoke check (2 min): blow out a match ~1 m from the sensor while the agent captures (skipped 2026-11-21).
- [ ] Final project/nonprofit name (decisions.md #1). "ProseFire" is a placeholder; needed before M9 labels.
- [ ] Review provisional decisions #3, #4, #5, #6 in docs/decisions.md (and docs/COSTS.md).

---

## Phase 1: v1 kit

### M0 Scaffold and tooling
- [x] Check the toolchain (python3, PlatformIO, Node LTS, Java for emulators, firebase-tools, gcc/clang for
      native tests). List what's missing with install commands; don't install system packages without asking.
      macOS 26.5 arm64. Founder-approved `brew install platformio firebase-cli node@22 python@3.12` →
      PlatformIO 6.2.0, firebase-tools 15.37.0, Node 22.23.5 (keg-only; default Node is 26), Python 3.12.16,
      Java 25, Apple clang 21. `tools/.venv` from `tools/requirements.txt`.
- [x] Repo layout per the component specs (`firmware/`, `backend/`, `web/`, `tools/`, `logs/` gitignored).
- [x] PlatformIO project with envs `release`, `dev`, `native`; blink-and-log firmware builds.
      `pio run -d firmware -e release -e dev` → both SUCCESS. Size (espressif8266@4.2.1, core 3.1.2):
      release RAM 34.6% (28,356 B), Flash 25.7% (268,727 B); dev RAM 34.7%, Flash 25.8%.
      `pio test -d firmware -e native` → 3/3 passed.
- [x] `tools/serial_capture.py` (spec in tools rule) + its tests. `tools/.venv/bin/python -m pytest -q tools/tests`
      → 21 passed (includes `check_release.py` tests).
- [x] Functions skeleton + one emulator test via `firebase emulators:exec`. Web skeleton builds.
      `(cd backend && npm --prefix functions ci && firebase emulators:exec --only functions,firestore "npm --prefix functions test")`
      → 7 passing (health GET/POST + deny-by-default rules). `(cd web && npm ci && npm test && npm run build)` → 5/5, built.
- [x] CI (GitHub Actions): firmware build (both envs), native tests, functions tests on emulator, web build,
      and a release-build guard (fails on `setInsecure`, `http://`, `DEV_`). Green after the founder cleared the
      GitHub billing lock: run 44889781985 on PR #1 (firmware, backend, web all ✓).
      `python3 tools/check_release.py` → OK locally.
- 👤 Hardware: dev firmware flashed to the founder's NodeMCU (FTDI FT232R, `/dev/cu.usbserial-A5069RR4`;
      esptool "Chip is ESP8266EX … Hash of data verified"). `serial_capture.py --seconds 15 --reset` →
      `logs/m0-blink-1795252792.log`: `[boot] ProseFire fw=0.0.1 env=dev id=esp8266-11001626 reset=External System`,
      then `[hb] uptime_s=5 heap=52008`, `[hb] uptime_s=10 heap=52008`. PASS (LED blink not observed by a person).
- Unverified commands: `python3 tools/device_sim.py` (built in M3).
- **Done when:** every documented dev command runs (or is marked unverified with the reason), CI is green,
      and 👤 the blink firmware flashes and a capture shows its log line.

### M1 PMS5003 driver
- [x] Frame parser (checksum, resync after garbage, partial frames), averaging, warm-up discard, error counter.
      `firmware/lib/core/src/pms5003.{h,cpp}`, protocol verified against Plantower manual v2.3 (cited in header).
- [x] Passive-mode/sleep/wake commands per the datasheet. `FAKE_PMS` generator (`fake_pms.{h,cpp}`, env `dev-fake`).
      `pio test -d firmware -e native` → 18/18 (15 PMS tests: good/corrupt/partial/garbage/bad-length/dropped-byte
      resync/ack frames/commands byte-exact/warm-up incl. millis wrap/fake stream). Release guard OK.
      Size: release RAM 35.7% (29,216 B), Flash 26.5% (276,975 B) (+~8 KB flash vs M0).
- 👤 Real sensor (D1/D2): `logs/m1-pms-1795254828.log`: 35 frames, **0 checksum errors**, 0 timeouts, passive-mode ack
      seen; PM2.5 = 0.0 µg/m³ (CF=1 and ATM) with ~110–125 particles >0.3 µm per 0.1 L: plausible for clean indoor air,
      but the sensor's response to smoke is not yet shown (founder smoke check above). Heap steady ~48 KB after
      shrinking the SoftwareSerial buffer (256→64 bytes saved ~8 KB). `dev-fake` on the board:
      `logs/m1-fake-1795254958.log` PM2.5 ≈ 8.2 (6–10).
- Note: opening the FTDI port on macOS resets the board even without `--reset` (seen in captures). Harmless.
- **Done when:** native tests cover good, corrupt, and partial frames; 👤 a 60 s capture with a real sensor shows
      plausible PM values and few or no checksum errors.

### M2 Device core
- [x] Identity + config in LittleFS (atomic writes, schema version), device ID, secret, setup password.
      `lib/core/src/kvstore.*` (key=value + schema + CRC-32; tmp+rename; torn/unrenamed tmp recovery),
      `codes.*` (31-char no-look-alike alphabet, unbiased), `src/identity.cpp` (32-byte secret + 12-char setup
      password from the ESP8266 hardware RNG; never logged), `src/device_config.cpp`.
- [x] State machine + LED patterns, FLASH long-press reset, NTP, saved-WiFi retry rules. (WiFi/NTP: hardware unverified)
      `lib/core/src/device_state.*`; `src/net.cpp` (WiFi.persistent(false), auto-reconnect, NTP pool.ntp.org +
      time.google.com once connected). The setup AP is only tracked/logged until M6.
      `pio test -d firmware -e native` → 46/46 (22 M2 tests: CRC check value, nasty SSIDs, corruption, power loss
      mid-write and before rename, 3-min AP fallback while retrying, router-off → PROBLEM, WiFi never auto-erased,
      15-min AP idle timeout, settings accepted in any state, long-press once/debounce/held-at-boot, millis wrap).
      Size: release RAM 38.6% (31,596 B), Flash 30.7% (320,883 B) (+~44 KB: LittleFS + WiFi stack).
- 👤 Board: `logs/m2-boot1-1795273043.log` + `logs/m2-boot2-1795273113.log`: `[identity] loaded … fs=ok`,
      `[state] SETUP … ap=1` on both boots (identity persisted across reboots; no secret/password in logs),
      heap ~45 KB. WiFi/NTP on hardware **unverified** (no credentials on the device until M5/M6 setup exists).
      Founder 2026-11-21: LED slow blink in SETUP ✓. FLASH button: two physical holds were never seen by the
      board (`logs/founder-checks-1795279921.log`, `logs/founder-flash-1795280992.log`, `[btn]` logging added), but
      pulling GPIO0 low through the FTDI auto-reset circuit (DTR) gave `[btn] flash=down` → 5 s →
      `[reset] FLASH long-press … identity kept` → `up` (`logs/gpio0-dtr-test-*.log`): firmware path ✓; the dev
      board's physical FLASH button is suspect. Re-check the button on a kit (CH340) board in M10.
      CONNECTING/RUNNING/PROBLEM LED states need WiFi credentials (M5/M6).
- M2 review fixes: secret + setup password from a woken radio + 2048 RNG samples condensed with SHA-256
      (`src/entropy.cpp`; core's ESP.random() is pseudo-random with WiFi off); `/identity.bak` + never regenerate a
      damaged identity (`identity_policy`, tested); LittleFS no auto-format (format only on mount failure, logged);
      a new WiFi password for the same network reconnects; device ID always set. Fresh-board proof:
      `logs/m2-fresh-1795282632.log` (`created … fs=ok(formatted)`) → `logs/m2-fresh2-1795282658.log` (`loaded`).
      Founder decisions applied (startup-only AP fallback, LED = WiFi only, SETUP AP never times out). 49/49 native.
- M1 review fixes (landed here): re-init after silence restarts warm-up; unsolicited frames (sensor rebooted into
      active mode) re-assert passive mode + warm-up (seen live at boot: `unsolicited=1`); partial frames dropped by
      the gap reset are counted (`partial=`); driver moved to `lib/core` with 6 mock-sensor tests.
- **Done when:** state-machine tests pass; 👤 LED checklist (hardware-test skill) passes.

### M3 Backend ingest (emulator) 🚦 cost gate
- [x] 🚦 Readings-storage cost table (100 / 1k / 10k sensors) → founder decision (decisions.md #4).
      `docs/COSTS.md` (prices read 2026-11-21 from cloud.google.com/firestore/pricing + /run/pricing). Design B,
      provisional under the founder's 2026-11-21 permission: ≈ $2 / $37 / $380 per month.
- [x] `ingest` (registry, HMAC, timestamp window, rate limit, idempotency), rules, privacy tests, `device_sim.py`.
      `backend/functions/src/ingest.ts` (+ `lib/hmac.ts`, `lib/payload.ts`, `lib/redact.ts`).
      `firebase emulators:exec --only functions,firestore "npm --prefix functions test"` → 21 passing: enroll (TOFU,
      allowlisted only), re-enroll attempt refused, bad + tampered signature, unknown + retired device, ±10 min skew
      (with server_time), replay (old → 401, resend → idempotent duplicate), 60/h rate limit, oversize/malformed/
      invalid, hour buckets, privacy (address only in private_locations; not in devices/hourly docs or responses),
      log redaction at any depth, HTTP end-to-end through the functions emulator.
      `python3 tools/device_sim.py --devices 2 --minutes 120 --scenario all --target emulator` → 14 runs, 0 problems
      (normal, smoke, stuck, bad_signature, replay, skew, burst); also runs in CI.
- **Done when:** emulator tests pass, including bad signature, replay, unknown device, and skew; privacy tests pass.

### M4 Device → backend
- [ ] `dev` firmware posts to the emulator over LAN HTTP. Then 👤 the founder creates the `dev` Firebase project
      (Blaze + budget alert) and the device posts over TLS with pinned roots.
      2026-11-21: founder created `prosefire-dev` (Blaze, $5 budget, Firestore Standard us-east1), ran `firebase
      login`, registered `devices/esp8266-11001626` (status allowlisted). Agent deployed rules, indexes, functions
      (`health`, `ingest`) and the placeholder Hosting site: https://prosefire-dev.web.app. Live checks:
      `/api/v1/health` → ok; `/api/v1/ingest` unsigned → 401 bad_signature for the registered board.
- [x] Device → dev over TLS with pinned roots (GTS Root R1 + R4, GlobalSign Root CA; chain read 2026-11-21 with
      `openssl s_client -showcerts`): `firmware/src/uploader.cpp`, signed with `core::signUpload` (same bytes as
      the backend: native test vs a Python hmac vector). Exponential backoff + jitter, 403/429/clock-skew handling
      (`upload_policy`, tested), ≤ 8 readings kept in RAM on failure. The emulator-over-LAN step was skipped: the
      real dev project was ready, and the emulator path is covered by `device_sim.py` in CI.
      WiFi via Improv over USB (`improv` codec + `src/improv_serial.cpp`; tests new credentials before saving) and
      `tools/wifi_setup.py` (founder typed the password hidden; never seen by the agent).
      `pio test -e native` → 63/63. Release: RAM 41.4%, Flash 45.1% (470,691 B; +146 KB for BearSSL/HTTPClient).
      👤 Real board (founder's iPhone hotspot): `logs/m4-upload-1795286957.log`: enrolled on the first upload, then
      HTTP 200 every 150 s (~3 s each, RSSI −29); after a reboot `enrolled=1`, `readings=1 accepted=1`. Free heap
      dips to ~8 KB during the TLS handshake (Google's front end doesn't support MFLN): watch it in the soak.
      Bugs found on hardware and fixed: credential test timed out instantly (millis wrap-around; also guarded in the
      state machine with a regression test), and the tool now echoes the sensor's status lines.
- [ ] 24 h soak (uptime, heap, ≥ 99% uploads): started after this commit.
- **Done when:** 👤 real-board readings appear in dev; 24 h soak passes (uptime, heap, ≥ 99% uploads).

### M5 Computer setup (USB + browser): primary path
- [x] Improv in firmware (+ codec tests), `/setup` page, `/claim` page + `claim` endpoint, claim token.
      Firmware 0.4.0: a fresh 128-bit claim token per USB setup (only its SHA-256 is kept and sent in the next
      upload, which is requested right away); redirect `https://<site>/claim#d=<id>&t=<token>`. `pio test` 65/65.
      Backend `claim` (+ `lib/geocode.ts`, US Census Geocoder, verified 2026-11-21): single-use, 24 h expiry,
      constant-time hash compare, per-device attempt limit, address/coords only in private_locations, geocoder
      outage → accept + `locationPending`, no match → 422. Emulator: 30 passing (9 claim tests).
      Web: Improv codec + client (tested against a fake sensor), `/setup` (Web Serial, filters CH340/FTDI/CP210x,
      DTR/RTS off + 2 s boot wait, always closes the port, same-origin claim redirect only), `/claim` (token moved to
      sessionStorage and stripped from the URL, polls up to 2 min). EN+ES strings; `npm test` 17/17. Hosting: clean
      URLs + CSP/Referrer-Policy/Permissions-Policy. Deployed to dev 2026-11-21; local preview checked (setup intro,
      claim bad-link + form). Deviation: "or tap your home on the map" waits for the map (M7).
- 👤 Browser checklist (after the soak, once 0.4.0 is flashed): Chrome on macOS · Chrome on Windows · Edge ·
      Safari shows the phone-path message. Per browser: picker shows exactly one device · WiFi list appears ·
      wrong password → friendly retry · right password → claim page → first reading shown · port released
      (`pio device list` / re-flash works afterwards).
- **Done when:** codec/claim tests pass; 👤 computer-setup checklist passes on Chrome (Windows + macOS) and
      Edge; Safari shows the phone-path fallback.

### M6 Phone setup (captive portal): backup path
- [ ] Soft AP + captive portal + in-flash page (EN/ES), credential test with reconnect polling.
- **Done when:** 👤 phone-setup checklist passes on at least one iPhone and one Android.

### M7 Corrections, snapshot, map
- [ ] EPA correction (+ extended) with paper-value tests, RH from weather, AQI, H3 cells, snapshot, map + `/s/<code>`.
- **Done when:** tests pass (incl. "no exact location in snapshot"); 👤 founder approves map look + wording.

### M7b "My sensor": checking and managing your device
- [ ] `/s/<code>` (public): live reading, AQI, 24 h / 7 d chart, online/offline + last seen.
- [ ] `/my` (owner): enter or scan the owner code → device health (WiFi strength, firmware, last restart, upload
      success), rename, indoor/outdoor, update address, offline notices (decision #14), delete my data. Supports several sensors per browser.
- [ ] Installable web app (manifest + service worker) with an "Add to Home Screen" hint on iPhone and Android.
- [ ] Owner-code endpoints + rate limiting + rotation ("new owner code" via computer setup = physical access).
- **Done when:** tests pass (incl. brute-force rate limit, rotated code stops working, owner page never shows
      the full address); 👤 founder checks both pages on a phone and installs the app to the home screen.

### M8 Sensor.Community forwarding (flag OFF by default)
- [ ] Task-queue forwarder + payload tests. 👤 Founder confirms forwarding/bulk registration with Sensor.Community.
- **Done when:** one test sensor shows on maps.sensor.community.

### M9 OTA + factory provisioning
- [ ] Signed OTA (dev key), manifest, staged rollout. `provision.py` + PDF labels (setup label + owner label).
- **Done when:** OTA works on 2 bench boards and an unsigned image is rejected; 👤 a volunteer provisions a fresh
      board in < 2 min from the printed instructions.

### M10 Guides + first-time-user test
- [ ] Build guide + setup card from `docs/USER_FLOW.md` (EN/ES, photos/diagrams).
- **Done when:** 👤 at least 3 people who've never seen the kit build and set it up alone, without scanning the
      wrong QR code, and can find their sensor afterward on `/my`; the top issues are fixed.

### M11 Launch readiness (all 👤)
- [ ] Prod project + budget alerts · privacy policy · production OTA signing key created and backed up offline ·
      deploy approval · label printer · kit cost sheet.

## Phase 2+ (not started; see `docs/FUTURE.md`)
Humidity sensor · offline buffering · more languages · Fire Watch integration · outage resilience.

---

## Session log
<!-- YYYY-MM-DD · what changed · evidence (command/result/log file) · next -->
- 2026-11-21 · M0 scaffold: git + public GitHub repo, toolchain installed, firmware/tools/backend/web skeletons, CI,
  spec review fixes (ELF symbol check, inherited-flag check, partial-log capture, no-JS safety line) · all local
  checks green (see M0 items), board flashed + captured (`logs/m0-blink-1795252792.log`) · next: green CI on PR #1, then M1 PMS5003 driver.
- 2026-11-21 · CI green on PR #1 (run 44889781985). M1 PMS5003 driver + fake sensor · 18/18 native tests, real-sensor capture 0 checksum errors (`logs/m1-pms-1795254828.log`) · next: M2 device core.
- 2026-11-21 · Founder back: decisions (startup-only AP fallback, LED = WiFi only, SETUP AP never times out, agent may merge) · M2 review fixes (secure RNG, identity backup) `logs/m2-fresh-1795282632.log` · PRs #1 #2 merged · M3 cost table + ingest: 21 backend tests, simulator 0 problems · next: M4 needs the dev Firebase project (founder); meanwhile M5/M7 groundwork.
- 2026-11-21 · M2 device core + M1 review fixes · 46/46 native tests, board boots twice with persisted identity (`logs/m2-boot*-*.log`) · next: M3 cost table + ingest on emulator.
