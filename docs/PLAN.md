# Plan and status

How to use this file (agent): read it at the start of each session. Work the current milestone top to
bottom. Tick a box only with evidence. Keep "Waiting on founder" current. Add one line to the session log
per session. Acceptance checks marked 👤 need the founder (hardware, phone, browser, accounts, approvals).

**Current milestone:** M0
**Waiting on founder:**
- [ ] **GitHub Actions is blocked:** every CI job fails with "The job was not started because your account is locked
      due to a billing issue" (run 44889722682). Fix at https://github.com/settings/billing (public repos are free;
      this is an account payment/lock problem). Then re-run CI on PR #1 (`gh run rerun --failed` or push again).
- [ ] Review and merge PR #1 (M0) on GitHub once CI is green: https://github.com/Aadi-Sobti/air-sensor-kit/pull/1
- [ ] Final project/nonprofit name (decisions.md #1). "ProseFire" is a placeholder; needed before M9 labels.
- [ ] Optional: glance at the board. The onboard blue LED should blink once a second with the M0 firmware.

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
- [ ] CI (GitHub Actions): firmware build (both envs), native tests, functions tests on emulator, web build,
      and a release-build guard (fails on `setInsecure`, `http://`, `DEV_`). Workflow written; **unverified**: GitHub refused to start the jobs (account billing lock, founder action).
      `python3 tools/check_release.py` → OK locally.
- 👤 Hardware: dev firmware flashed to the founder's NodeMCU (FTDI FT232R, `/dev/cu.usbserial-A5069RR4`;
      esptool "Chip is ESP8266EX … Hash of data verified"). `serial_capture.py --seconds 15 --reset` →
      `logs/m0-blink-1795252792.log`: `[boot] ProseFire fw=0.0.1 env=dev id=esp8266-11001626 reset=External System`,
      then `[hb] uptime_s=5 heap=52008`, `[hb] uptime_s=10 heap=52008`. PASS (LED blink not observed by a person).
- Unverified commands: `python3 tools/device_sim.py` (built in M3).
- **Done when:** every documented dev command runs (or is marked unverified with the reason), CI is green,
      and 👤 the blink firmware flashes and a capture shows its log line.

### M1 PMS5003 driver
- [ ] Frame parser (checksum, resync after garbage, partial frames), averaging, warm-up discard, error counter.
- [ ] Passive-mode/sleep/wake commands per the datasheet. `FAKE_PMS` generator.
- **Done when:** native tests cover good, corrupt, and partial frames; 👤 a 60 s capture with a real sensor shows
      plausible PM values and few or no checksum errors.

### M2 Device core
- [ ] Identity + config in LittleFS (atomic writes, schema version), device ID, secret, setup password.
- [ ] State machine + LED patterns, FLASH long-press reset, NTP, saved-WiFi retry rules.
- **Done when:** state-machine tests pass; 👤 LED checklist (hardware-test skill) passes.

### M3 Backend ingest (emulator) 🚦 cost gate
- [ ] 🚦 Readings-storage cost table (100 / 1k / 10k sensors) → founder decision (decisions.md #4).
- [ ] `ingest` (registry, HMAC, timestamp window, rate limit, idempotency), rules, privacy tests, `device_sim.py`.
- **Done when:** emulator tests pass, including bad signature, replay, unknown device, and skew; privacy tests pass.

### M4 Device → backend
- [ ] `dev` firmware posts to the emulator over LAN HTTP. Then 👤 the founder creates the `dev` Firebase project
      (Blaze + budget alert) and the device posts over TLS with pinned roots.
- **Done when:** 👤 real-board readings appear in dev; 24 h soak passes (uptime, heap, ≥ 99% uploads).

### M5 Computer setup (USB + browser): primary path
- [ ] Improv in firmware (+ codec tests), `/setup` page, `/claim` page + `claim` endpoint, claim token.
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
