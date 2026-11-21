# Future phases: design notes only. Do NOT build without founder approval.

v1 must leave hooks for these (already in the specs): device-timestamped readings, `ingest` accepts arrays,
a firmware uploader/transport interface, server-side `lastSeen`, optional humidity fields, `rh_source`.

## Phase 2: kit improvements
- Humidity sensor (DHT22 on D7, or a cheaper/more accurate I2C part on D5/D6). Set `rh_source: onboard`.
- Offline buffering: store readings in LittleFS when uploads fail, then upload in batches later (no API change).
- More languages, data-quality flags on the map.

## Phase 3: Fire Watch and Alerts integration
Fire Watch is the founder's iOS app (App Store id 6741443286) on Firebase. It combines NASA satellite
hotspots, user reports, cameras, and weather. Independent confirmations upgrade a "possible" fire to "confirmed."
The sensor network would provide:
1. **Smoke-signal events:** a sharp PM2.5 rise vs a sensor's own baseline and/or neighbors, with H3 cell,
   magnitude, number of agreeing sensors, and confidence. This is **supporting evidence only**, never sole confirmation
   (cooking, grills, fireworks, construction, and indoor placement also cause spikes).
2. **Linking + household alerts:** in Fire Watch → *Add my air sensor* → scan the card's Manage QR (or type
   the owner code). Fire Watch's backend calls our partner-link API (`POST /api/v1/links`, see backend rule) and
   gets a revocable, scoped link. The owner then gets Fire Watch alerts when their sensor or nearby sensors see smoke,
   and can unlink on `/my`. Android households: web push from `/my` may cover them (decision #17).
3. **"Gone silent" clusters:** many sensors in one area going offline together can mean power or network
   loss near a fire. A weak signal.
Interface: an event stream (Pub/Sub or webhook) between the two Firebase projects, with a documented schema.

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
**EPA AirNow Fire and Smoke Map:** currently shows PurpleAir sensors; EPA has a data acceptance protocol for
other networks. Our single-PMS design (PurpleAir has two) and QC approach would need to meet its targets.
