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

## Map + snapshot (M7, measured 2026-11-21; corrected after the M7 review)
- One map visit downloads ≈ 1.1 MB from our own Hosting (map tiles 712 KB, fonts 95 KB, code 296 KB compressed) plus the
  snapshot (≈ 26 B/sensor compressed: ≈ 3 KB at 100 sensors, ≈ 264 KB at 10K). Repeat visits are mostly browser-cached.
  Hosting: 10 GB/month transfer free, then $0.15/GB (https://firebase.google.com/docs/hosting/usage-quotas-pricing) →
  ≈ 9,000 first visits/month free, then ≈ $0.17 per 1,000 visits (+ ≈ $0.04 per 1,000 at 10K sensors for the snapshot).
  Basemap 36 MB + fonts 0.8 MB of Hosting storage (10 GB free).
- `publish` every 5 min, per sensor per month at list price ($0.03/100K reads, $0.09/100K writes):
  current-hour read 8,640 + public_sensors read 8,640 + finished-hour reads ≈ 1,440 (incl. one late re-roll) ≈ 18,700
  reads ≈ **$0.0056**; public_sensors writes ≈ 1,440 ≈ $0.0013. ≈ $0.007/sensor/month → ≈ $70/month at 10K sensors
  (≈ $0.70 at 100). Lever: run every 10 min (halves it).
- Snapshot document: stored gzip-compressed (≈ 264 KB at 10K sensors; Firestore's 1 MiB limit ≈ 35K sensors). CDN-cached
  (s-maxage 120 s) → ≈ 1 read per 2 min per CDN edge, independent of visitors.
- Nightly raw archive: one query over the previous day's hourly docs (24 reads/sensor/day = 720/month ≈ $0.0002) and one
  gzipped file per day (≈ 3 KB/sensor/day compressed → ≈ 11 GB/year at 10K sensors; Storage ≈ $0.026/GB-month).
- Cloud Scheduler: 2 jobs (publish, archive): free (3 jobs free per billing account, https://cloud.google.com/scheduler/pricing).
- External calls: NWS once per station per run (a handful for NYC), Census once per newly set-up sensor.

## Owner page + notices (M7b, 2026-11-21)
- Owner page loads: 1 session check (1–2 reads) + 26 reads per sensor view (24 hourly docs for "uploads received",
  location, map entry) → ≈ $0.000008 per view; negligible.
- Web push: free (browser push services). Sending happens inside the publish job; only on online → offline changes.
- Secret Manager: 3 secrets (owner key, VAPID public/private); within the free tier (6 active versions, 10K accesses/month;
  https://cloud.google.com/secret-manager/pricing). Each cold start reads them once.
- Delete my data: a batch of deletes (≈ 720 hourly docs per month of history) + the archive purge rewrites one file per
  archived day once (Storage ops ≈ $0.005/1,000).
