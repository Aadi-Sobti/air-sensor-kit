# Cloud cost estimates

## Readings storage (decision #4): cost table, 2026-11-21

**Prices used** (USD, list price, us-central1, read 2026-11-21; us-east1 should be the same tier, so re-check at deploy):
- Firestore Standard edition (https://cloud.google.com/firestore/pricing): reads $0.03 / 100K, writes $0.09 / 100K,
  deletes $0.01 / 100K, stored data $0.000205479 per GiB-hour (≈ $0.15 per GiB-month). Free per day: 50K reads,
  20K writes, 20K deletes, 1 GiB stored (≈ 1.5M reads + 600K writes per month).
- Cloud Run functions, request-based billing (https://cloud.google.com/run/pricing): $0.000024 per vCPU-second,
  $0.0000025 per GiB-second, $0.40 per million requests. Free per month: 180K vCPU-s, 360K GiB-s, 2M requests.
- Cloud Storage (https://firebase.google.com/pricing, legacy default bucket): $0.026 per GB-month after 5 GB free.
  Used as an upper bound for the archive.

**Assumptions** (check them with real numbers in the M4 soak):
- One upload every 2.5 min (provisional decision #6) = **17,280 uploads per sensor per month**.
- Ingest uses about 100 ms per request, on the smallest instance (0.167 vCPU, 256 MiB, concurrency 1).
- Retention in Firestore: per-reading documents are about 1 KB each including indexes. Hourly documents hold about
  24 readings at ~100 bytes each, plus small fields.
- The public snapshot reads one document per sensor every 5 min = 8,640 reads per sensor per month.
- Monthly totals are after the free tier, at month 12 (storage keeps growing for designs that keep raw data in Firestore).

| Design | 100 sensors | 1,000 sensors | 10,000 sensors | Notes |
|---|---|---|---|---|
| **A. One Firestore doc per reading** + update `devices/{id}` each upload (2 writes, 1 read per upload) | ≈ $4 | ≈ $75 | ≈ $820 | Storage grows ~17 MB per sensor per month and never stops (2 TB at 10K sensors after a year ≈ $310/mo of that) |
| **B. Hourly bucket doc per sensor** (`readings_hourly/{id}_{hour}`, map keyed by reading time) + 35-day TTL in Firestore + a nightly gzip archive of raw readings to Cloud Storage (1 write, ~1 read per upload; registry cached in memory) | **≈ $2** | **≈ $37** | **≈ $380** | Firestore holds only ~35 days (~2.5 MB per sensor). Raw data is kept forever in the archive (≈ $2/mo at 10K sensors after a year) |
| C. Like B, but no archive: rely on Sensor.Community's public archive for raw history | ≈ $2 | ≈ $37 | ≈ $378 | Saves almost nothing, and we'd lose control of our own raw data |

Rough split for B at 10K sensors: Firestore writes ≈ $155, Firestore reads ≈ $78, ingest compute + requests ≈ $143,
storage + archive ≈ $6.

**Levers if costs climb:** uploading every 5 min instead of 2.5 halves writes, requests, and compute (≈ −45%).
Batching readings on the device (the phase-2 offline buffer already sends an array) cuts requests further.

**Retention mechanics (deployed 2026-11-21):** Firestore TTL policies delete `readings_hourly` 35 days after the
hour and `claim_attempts` after 2 h (TTL deletes: $0.01 / 100K). The per-reading map (`r`) is exempt from indexing,
so each upload writes one document without dozens of index entries.

**Choice (provisional, under the founder's 2026-11-21 permission): B.** It is the cheapest at every size, keeps raw
data forever (needed because corrections are versioned and re-run), and makes idempotency free: a re-sent reading
lands on the same map key.

## Map + snapshot (M7, measured 2026-11-21)
- One map visit downloads ≈ 1.1 MB from our own Hosting (map tiles 712 KB, fonts 95 KB, code 296 KB compressed); repeat
  visits are mostly browser-cached. Hosting: 10 GB/month transfer free, then $0.15/GB
  (https://firebase.google.com/docs/hosting/usage-quotas-pricing) → ≈ 9,000 first visits/month free, then ≈ $0.17
  per 1,000 visits. Basemap storage 36 MB + fonts 0.8 MB (10 GB free).
- `publish` runs every 5 min: it reads each public sensor + its current-hour document (2 reads per sensor per run ≈
  17,280 per sensor per month) → ≈ $0.05/sensor/month at list price after the free tier (≈ $52/month at 10K sensors;
  higher than the 1 read assumed in the readings table above). Snapshot requests are CDN-cached (s-maxage 240 s), so
  map traffic adds only ~1 read per 4 min per CDN edge. Lever if needed: run publish every 10 min.
- External calls: NWS once per station per run (a handful for NYC), Census geocoder once per newly set-up sensor.
