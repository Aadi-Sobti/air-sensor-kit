# Future phases: design notes only. Do NOT build without founder approval.

v1 must leave hooks for these (already in the specs): device-timestamped readings, `ingest` accepts arrays,
a firmware uploader/transport interface, server-side `lastSeen`, optional humidity fields, `rh_source`.

## Phase 2: kit improvements
- Humidity sensor (DHT22 on D7, or a cheaper/more accurate I2C part on D5/D6). Set `rh_source: onboard`.
- Offline buffering: store readings in LittleFS when uploads fail, then upload in batches later (no API change).
- More languages, data-quality flags on the map.

## Phase 3: Fire Watch and Alerts integration
Fire Watch is the founder's iOS app (App Store id 6741443286, v1.1.0, English, iOS 15+) on Firebase.
**What it does today** (App Store listing, read 2026-11-22):
- NASA satellite hotspots (FIRMS) + user reports. One satellite detection or a camera-checked report = **possible**
  fire; independent confirmations upgrade it to **confirmed**.
- Map of confirmed fires, possible hotspots, and official perimeters.
- Alerts for a home location + radius: confirmed fires, possible fires, or a daily fire-risk score from weather.
- "Spot a Fire" photo reports (checked by an on-device model); community confirmations can turn one into a broadcast.
- Live public cameras checked by an on-device model; optional background location with "do you see it?" prompts.
- No air-quality or smoke data yet.

### Where the sensor network fits (in this order)
1. **Smoke layer** on the Fire Watch map from our public snapshot (H3 cells only; no linking, no private data).
   Useful everywhere smoke travels (e.g. the 2023 Canadian smoke), which in NYC is far more common than a nearby fire.
2. **Sensor smoke → "do you see it?" prompts** to nearby Fire Watch users. Sensors point human eyes at a place; the
   app's existing photo check + confirmation logic decides. Never an alert on its own.
3. **Smoke-signal events as one confirmation** for an existing possible fire: a sharp PM2.5 rise vs a sensor's own
   baseline and/or neighbors, with H3 cell, magnitude, number of agreeing sensors, wind direction, and confidence.
   **Supporting evidence only**, never sole confirmation (cooking, grills, fireworks, construction, fog/humidity,
   and indoor placement also cause spikes). Fills satellite gaps: small fires, cloud cover, time between passes.
4. **Linking + household alerts:** in Fire Watch → *Add my air sensor* → scan the card's Manage QR (or type
   the owner code). Fire Watch's backend calls our partner-link API (`POST /api/v1/links`, see backend rule) and
   gets a revocable, scoped link. The owner then gets Fire Watch alerts when their sensor or nearby sensors see smoke,
   and can unlink on `/my`. Android households: web push from `/my` may cover them (decision #17).
5. **"Gone silent" clusters:** many sensors in one area going offline together can mean power or network
   loss near a fire. A weak signal.
Interface: an event stream (Pub/Sub or webhook) between the two Firebase projects, with a documented schema.
Privacy: Fire Watch only ever gets H3 cells, never exact addresses (`private_locations` stays in our project).

**Before any smoke alert goes live: a silent test period.** Run detection for a few months without notifying anyone,
compare flagged events with real fire records (e.g. NYC fire dispatch open data; confirm the dataset first), and
publish the numbers (fires caught, false alarms per month). Turn on alerts only if the founder approves those numbers.

### Outside data sources (so Fire Watch isn't limited to where our sensors are)
Checked 2026-11-22 from each provider's docs; re-verify terms and prices before building. Fire Watch's App Store
seller is an LLC, so check whether each license treats it as **commercial** use.
| Source | What | Access / cost | Use in Fire Watch | Watch out |
|---|---|---|---|---|
| NASA FIRMS | Satellite hotspots | Free key (already used) | Possible fires | Lag up to ~3 h outside the US/Canada; misses small or cloud-covered fires |
| [NOAA HMS smoke polygons](https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/) | Analyst-drawn smoke plumes (light/medium/heavy), North America, daily | Free files (Shapefile/KML) | Smoke outlines; pairs with FIRMS (fire + where its smoke went) | Daily, not real time |
| [PurpleAir API](https://www.purpleair.com/products/api-data) | Largest low-cost PM2.5 network, densest in the US | 1M free points at signup, then from $10 per 1M points (cost per call depends on fields) | Ground smoke readings + confirmation where we have no sensors | Paid at scale; check display/redistribution terms; apply EPA correction |
| [AirNow API](https://docs.airnowapi.org/faq) (EPA) | Official US monitors | Free key; per-key rate caps | Trusted baseline readings | Sparse; EPA says not to build a database from the web services. Fire and Smoke Map's corrected PurpleAir layer has no documented public API |
| [Sensor.Community](https://github.com/opendata-stuttgart/meta/wiki/EN-APIs) | Low-cost PM sensors (same type as ours), strongest in Europe | Free, no key, 5-min averages | Smoke readings outside the US | Data license not found yet |
| [OpenAQ](https://docs.openaq.org/using-the-api/rate-limits) | Aggregator: government monitors + some low-cost sensors, worldwide | Free key (~60 req/min; docs conflict) | One API for many countries | Attribution may be required |
| [WAQI / aqicn](https://aqicn.org/api/tos) | Official stations worldwide | Free token | Worldwide AQI | No resale; nonprofit public use needs prior email notice |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | PM2.5 **forecast** from the CAMS model (not measurements) | Free, no key, non-commercial | "Smoke expected tomorrow" | Model, coarse; commercial use unclear |
| [Google Air Quality API](https://developers.google.com/maps/documentation/air-quality/usage-and-billing) | Modeled AQ, fine grid, worldwide | 10,000 requests/month free, then ~$5 per 1,000 | Gap-filling where no sensors | Paid; model, not measurement |
| NWS API (`api.weather.gov`) | Weather observations (wind, humidity) | Free, no key (User-Agent with contact) | Wind direction for smoke events; fog/humidity filter | Moving to API keys |
Design: one "smoke source" adapter per provider feeding the same smoke layer and "do you see it?" triggers;
our network is one source among these. Our sensors matter most where no one else has sensors.

## Phase 4: power/WiFi outages, hardware revision, official maps
Fires cut power and internet, and utilities may shut off power during high-fire-risk weather, so a WiFi-only
sensor goes dark exactly when it matters.
| Option | Cost/complexity | Notes |
|---|---|---|
| Offline buffering | ~$0 | No real-time warning during the outage |
| Battery backup | Per-kit cost | Measure real current draw first; lithium batteries add shipping (hazmat) rules |
| LoRa / Meshtastic mesh | ESP32 + LoRa boards | Needs gateways or nearby sensors |
| Cellular (LTE-M/NB-IoT) | Module + monthly plan | Cell sites can also lose power |
| "Last gasp" message | Small capacitor/battery | Cheap partial signal |
The ESP8266 has no LoRa or Bluetooth, so most of these imply an ESP32-class revision.

### Option: Fire Watch Home Beacon (v2 kit; founder idea 2026-11-24, NOT approved to build)
**Problems it targets** (sources checked 2026-11-22):
- Phone alerts fail when towers fail: in Lahaina (2023) all 21 cell towers serving West Maui failed and many residents
  never got evacuation alerts ([NPR](https://www.npr.org/2024/04/17/1245396324/maui-fire-report-communications-breakdown),
  [PBS](https://www.pbs.org/newshour/nation/maui-sues-cell-carriers-over-text-message-alerts-that-were-never-received-during-lahaina-wildfires)).
  Every phone app (Fire Watch, Watch Duty) depends on cell service.
- Most victims are older or disabled: 26 of 31 in the January 2025 LA fires (median age 76;
  [CA Commission on Aging](https://www.ccoa.ca.gov/docs/Publications/2025/CCoA%20Disaster%20Response%20and%20Recovery%20Policy%20Brief.pdf));
  Camp Fire victims averaged 71 ([SF Chronicle](https://preview-prod.w.sfchronicle.com/california-wildfires/article/Camp-Fire-victims-13450654.php)).
  Evacuation centers lacked data on who needed help.

**What it is:** a battery-backed box in each home (ESP32 + LoRa + the PMS sensor) that:
1. Relays Fire Watch **confirmed** alerts and official evacuation orders house to house over LoRa, with no cell or
   internet needed (one connected beacon, or a solar relay at a school/fire station, is enough).
2. Sounds a loud alarm + strobe in the home (reaches people without smartphones, asleep, or hard of hearing).
3. Has two big buttons, **"I'm OK" / "I need help"**, sent over the mesh to opted-in neighbors and Fire Watch, giving
   responders a live picture of who still needs help evacuating.
4. Keeps measuring smoke, so each beacon also grows the sensor network.

**Already exists (pieces, not this combination):** [Meshtastic](https://meshtastic.org/) (open-source LoRa mesh),
[MeshWX Pro](https://meshwxpro.com/) (NWS alerts over LoRa), LoRa home-security sirens (e.g. YoLink), NOAA Weather
Radio (no cell needed, but NWS warnings only). No wildfire product found that combines alerts, in-home alarm,
check-in buttons, and air sensing. Our edge is distribution (free kits via senior centers, community groups, fire
departments) and community trust, not the technology itself.

**Catches:** higher cost per kit (radio board, battery, alarm; get quotes first), so it is a **v2 kit, never v1**.
LoRa range in dense cities must be measured. Alarms only for confirmed alerts and official orders, or people unplug
them. "Needs help" data is sensitive: opt-in only, shared only with chosen neighbors and responders, covered by the
privacy rules. Liability: build it with a fire department or emergency-management partner, not around them.
Safety text: always "evacuate first"; never a smoke alarm replacement.

**Validate before building:** (1) interview 10–20 older residents, caregivers, a senior center, and a fire department
or CERT team; (2) 5 Meshtastic prototypes in one neighborhood, measuring range and alert delivery with WiFi off;
(3) a pilot in one wildland-edge community with a fire-department partner, then grant funding.
**EPA AirNow Fire and Smoke Map:** currently shows PurpleAir sensors; EPA has a data acceptance protocol for
other networks. Our single-PMS design (PurpleAir has two) and QC approach would need to meet its targets.
