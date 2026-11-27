# Plan and status

How to use this file (agent): read it at the start of each session. Work the current milestone top to
bottom. Tick a box only with evidence. Keep "Waiting on founder" current. Add one line to the session log
per session. Acceptance checks marked 👤 need the founder (hardware, phone, browser, accounts, approvals).

**Current milestone:** M10 (drafts done; founder approval + user tests) · M9 built (founder checks pending) · M0–M8 merged to main 2026-11-22 · was: M5 (built + deployed to dev; founder browser checklist after the M4 soak) · M0–M3 merged, M4 in PR #5 + soak
**Waiting on founder:**
- [x] Soak on home WiFi, fw 0.7.5 (planned 4 days; founder unplugged early 2026-11-24): **~58.7 h**, 2026-11-22 ~19:00Z →
      last upload 2026-11-25 05:40Z (dev Firestore `readings_hourly`, read by ID). **1,376 uploads; every full hour had
      23–24** (interval ~2.5 min + upload time), so no missed-upload gaps. Heap 36.1–36.6 KB across all 59 hours (no leak);
      0 checksum errors, 0 sensor timeouts, 0 dropped frames; RSSI −71 to −34 dBm. **1 unexplained reboot** around
      2026-11-23 06:30Z (uptime 39,312 s → 2,377 s; at most 1 upload lost), then **46.4 h** without a reboot. The cause
      isn't known: uploads don't carry the reset reason (power blip, watchdog, or crash). **0.7.6 (2026-11-24) sends it:**
      `reset_reason` (SDK rst_reason: 0 power on, 1 HW watchdog, 2 crash, 3 SW watchdog, 4 ESP.restart, 6 reset pin)
      every upload, plus `reset_exc` + `reset_addr` (decode against the ELF) after crashes/watchdogs. Unverified on the
      board until it is plugged in again (OTA staged for the bench board). iPhone re-test passed 2026-11-22.
- [ ] 👤 Chrome setup checklist (M5) and owner-page checklist (M7b), whenever convenient.
- [ ] 👤 M10: approve the guide (`/guide`, ask the agent for a dev link), card, and volunteer drafts; add photos;
      price the long cable / charger options (#11) and decide #12; then run the first-user tests
      (`docs/guides/first-user-test.md`).
- [ ] 👤 M9: get 1–2 more NodeMCU boards (2nd OTA bench board + a fresh board to provision); approve the label wording
      (draft in `tools/labels.py`) and pick a 4"×2" sticker sheet; the board now runs dev firmware 0.7.2.
- [ ] 👤 M1 smoke check (2 min): blow out a match ~1 m from the sensor while the agent captures (skipped 2026-11-21).
- [ ] Borrow an Android phone for the M6 phone-setup check (10 min), whenever convenient.
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
- [ ] 24 h soak (uptime, heap, ≥ 99% uploads). **Partial run 2026-11-21 (2.3 h; founder had to unplug):**
      `logs/m4-soak-1795287726.log` (fw 0.3.0, iPhone hotspot): 1 boot / 0 reboots over 8,347 s, **54/54 uploads OK**,
      heap 36.5–37.4 KB (stable), min 7.4 KB during TLS, 0 checksum errors, 0 sensor timeouts, no secrets in the log.
      Full 24 h re-run pending when the board is back (on 0.5.0, together with the browser/phone checklists).
      **Passed 2026-11-24 on 0.7.5:** 46.4 h continuous uptime, no upload gaps, heap flat at ~36 KB (see the soak item at top).
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
      claim bad-link + form).
      Spec-review fixes (2026-11-21): claim polling no longer trips the guess limit (only wrong guesses against a
      stored hash count); one identical "not_ready" answer for unknown/pending/wrong/used; a used token can't be
      revived by a re-sent upload (`usedClaimTokenHash`); health-only uploads (`readings: []`) so a pending claim is
      delivered even before the sensor has a reading (and sensor faults still reach the server); firmware reports a
      wrong password (0x03) separately from not-found/timeout (0xFF → "check it's 2.4 GHz / within range"); claim
      token reused for status queries until new WiFi is saved; setup page releases the port on every error path;
      localized page titles; TTL policies on `readings_hourly.expireAt` + `claim_attempts.expireAt`, and the
      readings map is exempt from indexing (deployed + confirmed). Backend 33 passing; native 66/66; web 18/18;
      tools 25/25. Release 0.4.0: RAM 41.5% (34,020 B), Flash 45.2% (471,775 B); `check_release.py` OK.
      Deviations (until M7): no "tap your home on the map" option; the public H3 cell is computed in M7
      (`publicCellPending`); the flow ends on the claim page's success screen, not the sensor's public page; the
      first reading shown is the sensor's ATM value (uncorrected) until the EPA correction/AQI exist.
- 👤 Browser checklist (after the soak, once 0.4.0 is flashed): Chrome on macOS · Chrome on Windows · Edge ·
      Safari shows the phone-path message. Per browser: picker shows exactly one device · WiFi list appears ·
      wrong password → friendly retry · right password → claim page → first reading shown · port released
      (`pio device list` / re-flash works afterwards).
- **Done when:** codec/claim tests pass; 👤 computer-setup checklist passes on Chrome (Windows + macOS) and
      Edge; Safari shows the phone-path fallback.

### M6 Phone setup (captive portal): backup path
- [x] Soft AP + captive portal + in-flash page (EN/ES), credential test with reconnect polling. **(Hardware
      unverified: phone checklist pending.)**
      Firmware 0.5.0. `lib/core/src/portal.*`: EN+ES strings (kept in flash), form validation (WPA2 8–63 chars or
      open, 5-digit ZIP, address), server-rendered pages that work with JS off and in iOS's captive mini-browser
      (form POST → "Connecting…" page with meta refresh to /status, so a phone that drops during the AP channel
      switch just reloads), HTML escaping of WiFi names, AP name `<Prefix>-Setup-<code>` (fallback code from the
      chip ID until M9 assigns one). `src/setup_portal.cpp`: WPA2 AP with the per-device setup password (decision
      #7), wildcard DNS → 192.168.4.1, Apple/Android/Windows probe URLs + unknown hosts → 302 to the portal, AP held
      60 s after success; web/DNS servers exist only while the AP is up; radio mode (STA/AP/AP+STA) decided in one
      place (`net.cpp applyMode`); Improv and the portal can't test credentials at the same time. Setup info is
      saved with the WiFi only after it connects, sent once in the next signed upload, then deleted from the device's
      config file (file level: LittleFS may keep old blocks until reused, like the WiFi password).
      `tools/setup_info.py` shows the setup WiFi name + password (+ WiFi QR text) over USB, only within 60 s of boot
      or while no short code is assigned. Release guard allowlists exactly `http://192.168.4.1/` (local AP).
      `pio test` 75/75 (9 portal tests); tools 28/28 (the QR escaping test caught a real backslash bug).
      Size: release RAM 44.6% (36,548 B; +2.5 KB vs M5), Flash 49.3% (515,035 B).
      ⚠ Watch on hardware: free heap during TLS should stay ≥ 4 KB (was 8 KB in M4); if not, move the portal's HTML
      fragments to flash too. ⚠ M9 risk: OTA needs free space ≥ the new image, and the sketch area is ~1 MB, so the
      firmware must stay under ~520 KB (now 515 KB). Plan size cuts before M9 (e.g. drop HTTPClient for a raw POST). (Corrected 2026-11-22: that ceiling was wrong. With the 4m1m layout the update is staged just below the filesystem at 3 MB (core `Updater.cpp`: current sketch + new image ≤ 3 MB), so the real limit is the 1,044,464 B max program size.)
      Deviation until M7: phone-path addresses are geocoded by the M7 job (ingest stays lean), so these sensors
      appear on the map only after M7. M7 acceptance: that job runs often enough to keep "on the map in about
      10 minutes" true.
      Spec-review fixes: "/" follows the setup phase (phones reopen the portal at "/" after the channel switch);
      the test starts 0.5 s after the reply; a typed WiFi name wins over the pre-ticked network; async scan after
      the AP starts (Improv still answers within ~2 s of boot); FLASH long-press resets the portal; the
      setup-info command + send-once/clear-after-2xx rules moved to `lib/core/src/setup_info.*` with tests
      (incl. a fix: a binary line could re-trigger the old command). Native 80/80.
      Watch on hardware: only WL_WRONG_PASSWORD shows the password message; if the ESP8266 reports a wrong
      password as CONNECT_FAILED/timeout, people see "couldn't reach that WiFi".
- [x] iPhone run #1 on 0.6.0 (2026-11-22, founder): setup worked ("You're all set!", board RUNNING on home WiFi,
      upload http=200; sensor FDK7NA on the public map 4 min later: pl=1, PM2.5 12.2, AQI 57). Founder found 3 problems:
      (1) wrong password → phone dropped off the setup WiFi and couldn't rejoin; (2) after rejoining, the page didn't
      pop up by itself (had to open a browser); (3) page looks too plain. Also `setup_info.py` printed a cut-off
      password (fixed: waits for a full line; regression test).
- [x] iPhone run #2 (2026-11-22, founder, firmware 0.7.4): the setup page **opened by itself**, a wrong password showed
      "That password didn't work" and the phone **stayed connected**, the right password gave "You're all set!".
      Log `logs/iphone-retest-074.log`: captive.apple.com probe → page; wrong_password after 9 s, nothing saved; new WiFi
      works after 3 s → RUNNING; saved-WiFi retries paused while the phone used setup. Sensor back on the map 2026-11-22
      (FDK7NA online, placed, PM2.5 3.5). The founder's verdict: "Works perfectly".
      **Found on the way (my bug):** the redesigned page ran the sensor out of memory ("Unhandled C++ exception: OOM") on
      0.7.3: the page string (reserved 9 KB) doubled to 18 KB in a neighborhood with many networks, so every page load
      rebooted the sensor and dropped the phone (`logs/iphone-retest-073.log`, 18 reboots). 0.7.4: 14 KB reserved up
      front, no full-page copy, list capped; still one OOM on the first load after flashing (a separate 3.5→7 KB WiFi-list
      buffer). 0.7.5: rows written straight into the page buffer + a memory check before building any page (too little →
      a tiny self-reloading page instead of a crash). Native test: worst-case escaped names stay ≤ the reserve.
      0.7.5 installed over WiFi, uploads OK; its page path is covered by the pre-check but **not yet seen on a phone**
      (next phone setup re-checks it).
- [x] Fixes in 0.6.1 (built + flashed 2026-11-22; phone re-test passed on 0.7.4, see above): (1) pause saved-WiFi retries while a
      phone uses setup + open the setup WiFi on the home network's channel, so the password test doesn't switch
      channels (`core::portal::pauseSavedWifi/pickApChannel`, 2 new tests); (2) dev builds log each setup-page request
      (host + path only, capped) so the next run shows what iOS asks for if the page doesn't pop up; (3) redesigned
      page (blue header, numbered cards, WiFi list with signal bars, show-password button, Outside/Inside tiles,
      spinner + check-mark pages), same wording, still works with JS off; 11.3 KB with 20 networks.
      Evidence: native 83/83, tools 29/29, release guard OK, boot capture `logs/serial-*.log` (1 boot, RUNNING, heap 33.8 KB).
      Size: release Flash 521,915 B (+6.9 KB vs 0.5.0): 50% of the 1 MB program limit; OTA has room (the earlier ~520 KB ceiling was a mistake, see M6 note above).
      Note: a new kit opens its setup WiFi within seconds; only a sensor with saved WiFi it can't reach waits ~3 min.
- 👤 Founder has an iPhone only (2026-11-21): the iPhone run counts; the **Android** run stays open (unverified)
      until someone can lend one (a volunteer or friend in M10 works too).
- 👤 Phone checklist (after the soak, once 0.5.0 is flashed; run `python3 tools/setup_info.py --port <port>` in your
      own terminal for the network name + password): on an iPhone AND an Android, join the network → the setup page
      opens by itself · WiFi list appears · wrong password → friendly retry · right password → "You're all set!" ·
      the first upload carries the address (agent checks the log + private_locations). Also: with no saved WiFi, the
      setup network stays up (SETUP never times out); after a successful setup it disappears ~60 s later.
- **Done when:** 👤 phone-setup checklist passes on at least one iPhone and one Android.

### M7 Corrections, snapshot, map
- [x] EPA correction (+ extended) with paper-value tests, RH from weather, AQI, H3 cells, snapshot, map + `/s/<code>`.
      Facts verified 2026-11-21 from primary sources (cited in code): Barkjohn 2021 AMT Eq. 10 (read in the article's
      MathML), Barkjohn 2022 Sensors Eqs. 1–3 (transition at PA_cf1 570–611, NOT the AirNow fire-map formula I'd have
      guessed), EPA AQI TAD EPA-403/B-26-003 (May 2026) Table 6 + Eq. 1 + NowCast, NWS API docs, Protomaps CLI docs,
      H3 resolution table. `backend/functions/src/lib/{correction,aqi,cells,rh,shortcode}.ts`; `publish.ts` (every
      5 min: place new sensors incl. phone-path geocoding → public H3 res-9 cell, NWS station from the cell center only,
      hourly rollup + NowCast, snapshot; indoor = no location; offline after 30 min; RH fallback cached ≤3 h → 50 %);
      `GET /api/v1/snapshot.json` (CDN cache 60 s / 240 s). Web: MapLibre + self-hosted PMTiles NYC basemap (36 MB,
      `tools/make_basemap.sh`, not in git) + self-hosted fonts, AQI-colored dots + legend + popups, `/s/<code>` page.
      Tests: backend 53 passing (17 math incl. TAD example 35.9→102 and the paper checkpoints PA 570→~300, 611→~400;
      3 publish tests incl. "no address/exact coordinates in the snapshot"), web 21, tools 28, native 80.
      Local demo (emulator + `backend/functions/scripts/seed-demo.mjs`): map + popup + sensor page checked in the
      browser. One map visit ≈ 1.1 MB (tiles 712 KB, fonts 95 KB, code 296 KB), 0 third-party requests.
      Deployed to dev: real Hosting serves range requests (206); live map loads under the CSP with no console errors.
      Founder decisions 2026-11-21: deps approved, H3 res 9, RH from NWS.
      M7 spec-review fixes (2026-11-21): snapshot stored gzip-compressed and without 24 h history (10K sensors ≈ 264 KB;
      size budget + test); publish is time-boxed (locate ≤ 60 s, stops geocoding during a Census outage), reads in
      batches, handles errors per sensor, and always writes the snapshot; "current value" needs a reading < 30 min old
      (health-only uploads stay online without a stale value; the page says "check the wires"); NowCast uses hourly
      means (current hour only with ≥ 4 readings); missed hours are caught up (≤ 12) + one late re-roll; a claimed
      address that doesn't geocode stops retrying and hides the old placement; unplaced sensors are public by code
      right away (page works); missing NWS stations are retried; rh source recorded; popup shows corrected PM2.5;
      NowCast note only when used; CDN s-maxage 120 s (worst case ≈ 2.5 + 5 + 2 min ≈ 10 min to appear); claim page
      shows the EPA-corrected first reading + AQI and links to `/s/<code>` (resolves the M5 deviations); predeploy
      refuses to ship without the basemap; basemap build pinned (20261121). Nightly raw archive built (`archive.ts`,
      03:30 UTC, catch-up, never skips a day; tests) + deny-all Storage rules. Backend 61 passing, web 22.
      2026-11-21: founder enabled Cloud Storage on prosefire-dev; agent deployed the deny-all Storage rules and
      redeployed `archive` so it sees the bucket. `publish` runs in the cloud every 5 min (`firebase functions:log
      --only publish`: publish_ok, 0 errors). **Unverified:** the first archive run (03:30 UTC 2026-11-22): check
      `firebase functions:log --project dev --only archive` for `archive_day_ok`.
- [ ] QC before the map goes public (backend.md): range checks + stuck-value flags (needed before launch), neighbor
      comparison later. Indoor sensors are already excluded from the map.
- [ ] Measure "set up → visible on the map" on dev with the real board (target ≤ 10 min).
- **Done when:** tests pass (incl. "no exact location in snapshot"); 👤 founder approves map look + wording.
      👤 Pending: founder review of https://prosefire-dev.web.app (with a real sensor once the board is claimed after
      the soak) and the wording on the map/sensor pages. Spanish AQI names ("Insalubre…") need a native speaker.

### M7b "My sensor": checking and managing your device
- [x] `/s/<code>` (public): live reading, AQI, 24 h / 7 d chart, online/offline + last seen.
      Chart from `GET /api/v1/sensor/<CODE>/history` (no location; CDN 5 min); public_sensors keeps 168 hours.
- [x] `/my` (owner): enter or scan the owner code → device health (WiFi strength, firmware, last restart, upload
      success), rename, indoor/outdoor, update address, offline notices (decision #14), delete my data. Supports several sensors per browser.
      `backend/functions/src/owner/api.ts`: sessions (signed, 7-day sliding, bound to the code version), sensor
      data with a masked address only, settings, address update (old exact location dropped, re-placed by publish),
      web-push subscriptions, delete my data (readings, location, map entry, codes, notices, device secret; device
      retired) + archive purge (`runArchivePurge`, nightly, resumable). Offline notice: one web push on each
      online → offline change, in the subscriber's language; dead subscriptions removed.
- [x] Installable web app (manifest + service worker) with an "Add to Home Screen" hint on iPhone and Android.
      `public/manifest.webmanifest`, `public/sw.js` (shell only; never caches /api), icons from `tools/make_icons.py`
      (placeholder design until the final name/branding).
- [x] Owner-code endpoints + rate limiting + rotation ("new owner code" via computer setup = physical access).
      Codes: 10 chars, keyed hash HMAC(OWNER_PEPPER) in Secret Manager (created 2026-11-21 with VAPID keys; values
      never printed). 10 wrong tries/IP/hour (+ a global cap); IPs stored only as keyed hashes. Rotation: /setup
      "Get a new owner code" → firmware 0.6.0 `PFCMD NEWCLAIM` → fresh claim token → `/owner/rotate` → old code and
      its sessions stop working.
      Tests: backend 75 (owner 14 incl. brute force, rotation, masked address, delete, logs; notices; purge), web 30,
      native 81, tools 28. Deployed to dev: owner/history live; /my registers its service worker, no console errors.
      Firmware 0.6.0: Flash 49.4% (515,951 B) (OTA room: fine, see the corrected M6 note.)
      M7b spec-review fixes (2026-11-21): client IP from the right X-Forwarded-For position (Hosting vs direct, checked
      live on dev) + IPv6 /64; guesses counted first in a transaction (parallel-safe), correct codes refunded, global
      surge only alerts; shared `checkOwnerCode` helper (partner links later); rotation atomic; push endpoints limited
      to real push services, key sizes checked, ≤ 10 per sensor, per-browser status, 5 s send timeout, sent after the
      snapshot, flag kept on the device; offline notice carries the safety line; archive purge handles both file
      formats, never skips a failing file, deletes late readings, waits until the deletion day is archived; ingest
      refuses setup info for deleted sensors; owner_attempts TTL; iOS permission prompt first on tap; dead cards
      removable; service worker caches the built assets; Android install wording. Backend 85, web 30.
- **Done when:** tests pass (incl. brute-force rate limit, rotated code stops working, owner page never shows
      the full address); 👤 founder checks both pages on a phone and installs the app to the home screen.
      👤 Pending (needs the board on 0.6.0): /setup → "Get a new owner code" → open /my on the iPhone → Add to Home
      Screen → turn on offline notices → unplug the board 35 min → a notice arrives.

### M8 Sensor.Community forwarding (flag OFF by default)
- [x] Task-queue forwarder + payload tests (agent part).
- [ ] 👤 Founder confirms forwarding/bulk registration with Sensor.Community **and their data license** (decided
      2026-11-22: share after the license is confirmed; outdoor sensors only; register with the public cell center;
      recipients are told during setup — sentence added to /setup, /claim, the phone page, USER_FLOW).
      Facts verified 2026-11-21: push API (opendata-stuttgart meta wiki EN-APIs: endpoint, X-Sensor, X-Pin 1 for PMS,
      P1 = PM10 / P2 = PM2.5, no timestamp — the server stamps arrival); airrohr source read via the GitHub API
      (`defines.h` "#define PMS_API_PIN 1"; it reads PMS frame bytes 10–15 = the atmospheric PM1/PM2.5/PM10 per the
      Plantower datasheet, sent as P0/P2/P1). `backend/functions/src/forward.ts` + task-queue worker
      `forwardSensorCommunity` (retries 5×, 30–300 s backoff, ≤ 5/s); ingest enqueues only when SC_FORWARD_ENABLED
      is true AND `devices.scRegistered` is true, only the newest reading < 5 min old, and a queue failure never fails
      an upload. No location is sent (Sensor.Community gets one only at registration). Tests: backend 90 (5 new).
      Deployed to dev 2026-11-22 with SC_FORWARD_ENABLED=false: deploy log "functions[forwardSensorCommunity(us-east1)]
      Successful create operation" + "missing required API cloudtasks.googleapis.com. Enabling now..."
      (`logs/deploy-m8-*.log`); nothing is queued while the flag is off.
      M8 review fixes: enqueue limited to 2 s (a slow queue can't hold an upload; tested with a hanging queue); retries
      only on 5xx/429, network errors/timeouts not retried (no duplicates), readings > 5 min dropped, max 5 min of
      retries; `.env.prosefire-dev` committed (the flag's value is in the repo; changing it = redeploy functions);
      COSTS corrected (each task ≈ 2 billable operations).
      **Unverified until the flag is first turned on in dev:** the real Cloud Tasks path and IAM. The ingest service
      account (default compute SA unless set) needs `roles/cloudtasks.enqueuer` and `roles/iam.serviceAccountUser` on
      itself, and must be allowed to invoke `forwardSensorCommunity`. Check after flag-on: logs show `sc_forward_ok`
      (or `sc_forward_rejected`) and no `sc_enqueue_failed`. Unverified: Sensor.Community's data license (their FAQ
      blocks automated reads). For prod, turning the flag on is a founder action.
- 👤 To finish M8 (founder): (1) contact Sensor.Community to confirm forwarding from a fleet of non-airrohr
      sensors, bulk registration, and their data license; (2) register the test sensor `esp8266-11001626` at
      https://devices.sensor.community (PMS5003, outdoor) with the **public cell center** as its location, not the
      home address; (3) in the Firebase console set `devices/esp8266-11001626.scRegistered = true` (boolean) and
      tell the agent, who turns the flag on for dev and checks maps.sensor.community.
- **Done when:** one test sensor shows on maps.sensor.community.

### M9 OTA + factory provisioning
- [x] Signed OTA (dev key), manifest, staged rollout. Firmware 0.7.x. `firmware/src/ota.cpp` + `lib/core/src/ota_policy.*`:
      checks `/fw/manifest.json` 2 min after first reaching RUNNING, then every 24 h + a per-device 0–59 min offset;
      stages bench (listed IDs) → canary (stable FNV-1a 0–99 bucket < canary_percent) → all; never downgrades; strict
      manifest parser (same-site `/fw/` path, size ≤ 1,044,464 B). RSA-2048 signatures (PKCS#1 v1.5 over SHA-256, the
      core's format; the core's EC check has a length bug, so not EC). The signature checker exists only during a
      download (keeping it from boot cost 7.6 KB RAM and TLS failed: seen on hardware). Release builds: OTA off until the
      founder makes the production key (`tools/ota_keys.py release`, M11); release guard fails if the dev key is in a
      release binary. Tools: `ota_keys.py`, `ota_publish.py` (signs, verifies with openssl, writes manifest; `--unsigned`
      bench test). Hosting: versioned images cached forever (Hosting only sends Content-Length for cacheable files, and
      the updater needs it), manifest `no-cache`.
      **Hardware (bench board, dev project, 2026-11-22):** 0.7.0 → 0.7.1 installed over WiFi (`logs/m9-ota-update-*.log`:
      "[ota] installed 0.7.1 (signature ok)" → "[boot] fw=0.7.1 reset=Software/System restart"); UNSIGNED 0.7.2 refused
      ("update_err=12 Signature verification failed; still on 0.7.1", `logs/m9-ota-unsigned-*.log`); signed 0.7.2 then
      installed (`logs/m9-ota-recover-*.log`). Only 1 bench board exists → the "2 bench boards" check is half done.
      RAM: log format strings + setup-page HTML moved to flash (static RAM 37.6 → 34.5 KB); idle heap 36.9 KB (0.6.1:
      33.8 KB); free heap during an upload 7.6 KB (was 5.3 KB). Size: release Flash 539,847 B (52 %).
- [ ] Factory provisioning: **built + tested in software; the success path is UNVERIFIED on hardware** (needs a fresh
      board: SETCODE save → restart → code read back → label). Backend `POST /api/v1/factory/register` (`src/factory.ts`, 8 emulator tests): per-station
      keys (SHA-256 hashes in the `FACTORY_KEY_HASHES` secret; `tools/factory_station.py new|revoke`), unique 6-char
      short code (reserved in `short_codes/`), owner code stored only as a keyed hash; re-registering an unused board
      keeps its code and issues a new owner code (reprints); a board in use is always refused; a board whose owner used
      "Delete my data" needs `reprovision`, no stored address, and a finished archive purge, and every per-owner field is
      reset (nothing is deleted). Deployed to **dev**; live: no key → 401, valid key → passes auth.
      Firmware: `PFCMD SETCODE <code>` (same 60 s / unprovisioned gate as setup info) saves the code to /identity (+ backup)
      and restarts. `tools/provision.py`: detect (CH340/FTDI/CP210x) → flash-size check → erase + flash (esptool) →
      chip ID + setup WiFi over USB → register → set code → confirm from the restart → labels → CSV log (no secrets);
      batch = one worker per port; `--no-flash` reprint. `tools/labels.py`: SETUP + OWNER labels on one row of a 4"×2"
      (10/sheet) letter sticker sheet; QR via segno; PDF written in-house; QR codes verified with Apple's CoreImage reader
      in the tests. Safety (spec review): kits get release firmware only (`--allow-dev` for tests; the file is scanned
      with the release guard first); a board that has a code or has uploaded is never erased (checked over USB before
      flashing); `--reprovision` is founder-only. Hardware: on the bench board the tool read boot/identity/setup info;
      the dev server refused it (409 already_in_use) and, after the review fixes, the tool refused it locally before
      erasing or registering ("already sent readings from a home"); no label (`logs/prov-test/provision-log.csv`).
      Spec-review fixes also: OTA retries network failures at the next daily check (max 3) and skips only bad images
      (per image file); `ota_publish.py` verifies against the key built into the firmware. Board updated over WiFi
      0.7.2 → 0.7.3 with these fixes (`logs/m9-ota-073-*.log`). Tools tests 52/52, native 90/90, backend 101/101.
- 👤 Pending: (1) a second bench board for the 2-board OTA check; (2) a volunteer provisions a **fresh** board in < 2 min
      from printed instructions (needs a new NodeMCU; the bench board is in use); (3) approve label wording (draft) and
      pick the sticker product; (4) production OTA key (M11).
- **Done when:** OTA works on 2 bench boards and an unsigned image is rejected; 👤 a volunteer provisions a fresh
      board in < 2 min from the printed instructions.

### M10 Guides + first-time-user test
- [ ] Build guide + setup card from `docs/USER_FLOW.md` (EN/ES, photos/diagrams). **Drafts done 2026-11-22, awaiting
      founder approval:** site page `/guide` (EN + ES, `?lang=es`; wiring diagram in the decided colors; a "How did your
      kit come?" switch for the three kit versions while #12 is open; where to put it: outside, ~6 ft up, away from
      smoke sources; troubleshooting), `docs/guides/card.md` (card front/back EN + ES), `docs/guides/volunteer-provisioning.md`.
      Checked in a phone-sized browser (EN + ES, kit switch renumbers steps). Web tests 33/33. Photos need the founder.
- [ ] 👤 First-time-user tests: protocol + observation sheet in `docs/guides/first-user-test.md` (3+ testers; mix of
      computer/phone, iPhone/Android, EN/ES, kit versions).
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
- 2026-11-24 · Soak ended early (founder): ~58.7 h on 0.7.5, 1,376 uploads with no gaps, heap 36.1–36.6 KB, 0 sensor errors, 1 unexplained reboot then 46.4 h up · FUTURE: Fire Watch data sources (#14) + Home Beacon option · next: founder M10 approvals + user tests.
- 2026-11-24 · fw 0.7.6: reset reason (+ crash cause/address) in upload health; test caught that the backend rejects digits in error keys (`reset_epc1` → `reset_addr`) · native 92, backend 102, release 544,127 B, guard OK · next: OTA to the bench board when it's plugged in, read `reset_reason` from dev.
- 2026-11-25 · Decided (founder): sensor and Fire Watch stay two linked products, no sensor app; corrected notes that said Fire Watch was iOS-only (it is also on Android) · docs only · next: founder M10 approvals + user tests.
- 2026-11-25 · Printed case v1 (`hardware/enclosure/`: shell + insert STLs, generated by `make_enclosure.py`, fit checks OK, not printed yet) + `docs/PRODUCT_PLAN.md` (owner notices, optional app, sellable v2 + FCC, responders); 14-agent sourced research; open #20–#26 · next: founder test-prints the case, answers #20–#26.
- 2026-11-26 · Beacon parts check (10-agent sourced comparison): the plan's parts were neither cheapest nor best; lean ≈ $69, balanced ≈ $90, best ≈ $101 per beacon (HOME_BEACON.md §3a); 3 picks out of stock · next: founder bench-tests a Heltec V4.3 R2 + RAK3312 (decisions #30, #33, #35).
- 2026-11-26 · Beacon prototype Amazon list (`docs/HOME_BEACON_PROTOTYPE_BUY.md`, sizes checked vs the case; Amazon blocks automated page checks, so titles/prices to confirm on purchase). Case updated for the Amazon siren (47×39×23.5), deeper board holders, finger presses the board; fit checks OK · test sensor marked indoor (dev).
- 2026-11-26 · Beacon buy list: in-stock replacements (stock checked on seller pages) for the battery (Adafruit 354 direct), booster (U3V12F12 discontinued → Pololu U3V16F12), transistors (IRLB8721 obsolete → IRLZ44N) and solder board (FeatherWing Proto out → 2×8 cm perfboard); backups for every part; outdoor-sensor section. Case: driver-board pocket resized to 20 mm, support ledges, zip-tie slots moved outside the rails (were under the board) + a tie-path fit check; `make_beacon_case.py` → fit checks OK · open: red button LED may not light at 3.3 V (bench test on arrival, HOME_BEACON.md §4).
- 2026-11-25 · Home Beacon build plan (`docs/HOME_BEACON.md`): verified pilot parts list ≈ $83/unit, Heltec V3 pin map + driver wiring, signed-alert firmware plan, responder path; printable indoor case `hardware/beacon/` (fit checks OK, not printed); open #27–#34 · next: founder decides #27.
- 2026-11-22 · M10 drafts: /guide page (EN/ES, wiring diagram, 3 kit versions), card updated, first-user test kit; decisions #2, #13 · web 33 · next: founder approval, photos, user tests; 4-day soak running.
- 2026-11-22 · M9 merged (#11). iPhone re-test: found + fixed an out-of-memory reboot loop in the new setup page (0.7.3 → 0.7.5); founder: "works perfectly" on 0.7.4; 0.7.5 via OTA, back on the map · native 91 · next: 7-day soak, founder M9 items.
- 2026-11-22 · Merged M5–M8 (PRs #6–#10). M9: signed OTA (verified on hardware: update, unsigned rejected, recovery), factory endpoint (dev), SETCODE, provision.py + labels, RAM +3 KB · native 89, tools 48, backend 100 · next: spec-review fixes, founder: iPhone re-test, boards, label wording.
- 2026-11-22 · Board back: 0.6.0 phone setup worked on iPhone, sensor on the map · 0.6.1 portal fixes (stable setup WiFi, request logging, redesign) · native 83, tools 29, flashed + boot capture · next: founder iPhone re-test, then 7-day soak; M9 must cut size first.
- 2026-11-21 · M0 scaffold: git + public GitHub repo, toolchain installed, firmware/tools/backend/web skeletons, CI,
  spec review fixes (ELF symbol check, inherited-flag check, partial-log capture, no-JS safety line) · all local
  checks green (see M0 items), board flashed + captured (`logs/m0-blink-1795252792.log`) · next: green CI on PR #1, then M1 PMS5003 driver.
- 2026-11-21 · CI green on PR #1 (run 44889781985). M1 PMS5003 driver + fake sensor · 18/18 native tests, real-sensor capture 0 checksum errors (`logs/m1-pms-1795254828.log`) · next: M2 device core.
- 2026-11-22 · M7b review fixes deployed · M8 Sensor.Community forwarder built (flag OFF) + deployed to dev · backend 90 · next: founder contacts Sensor.Community; board back → flash 0.6.0 + checklists.
- 2026-11-21 · M7b owner page, owner codes (keyed hash in Secret Manager), web push notices, delete + archive purge, PWA, sensor-page chart; firmware 0.6.0 NEWCLAIM · backend 75, web 30, native 81 · deployed to dev · next: board back → flash 0.6.0, founder checklists.
- 2026-11-21 · M7 review fixes (snapshot gzip/size budget, time-boxed publish, freshness, hourly NowCast, rollup catch-up, nightly archive, claim → sensor page) deployed to dev · backend 61, web 22 · partial soak 2.3 h: 54/54 uploads, 0 reboots · board unplugged ~1 day.
- 2026-11-21 · M7 corrections/AQI/NowCast/H3/snapshot/map + sensor page, deployed to dev · backend 53, web 21 · next: founder map review; after the soak flash 0.5.0 + browser/phone checklists.
- 2026-11-21 · M6 phone setup built (portal, AP, setup-info tool) · native 75/75, tools 28/28, release RAM 44.6% / Flash 49.3% · next: flash 0.5.0 after the soak; phone + browser checklists.
- 2026-11-21 · M5 built + spec-reviewed + deployed to dev (setup/claim pages, claim endpoint, claim token) · backend 33, native 66, web 18, tools 25 · next: flash 0.4.0 after the soak, founder browser checklist.
- 2026-11-21 · Founder back: decisions (startup-only AP fallback, LED = WiFi only, SETUP AP never times out, agent may merge) · M2 review fixes (secure RNG, identity backup) `logs/m2-fresh-1795282632.log` · PRs #1 #2 merged · M3 cost table + ingest: 21 backend tests, simulator 0 problems · next: M4 needs the dev Firebase project (founder); meanwhile M5/M7 groundwork.
- 2026-11-21 · M2 device core + M1 review fixes · 46/46 native tests, board boots twice with persisted identity (`logs/m2-boot*-*.log`) · next: M3 cost table + ingest on emulator.
