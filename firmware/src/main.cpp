// M4 firmware: everything in M2 plus signed HTTPS uploads every ~2.5 min and Improv Wi-Fi over USB.
#include <Arduino.h>
#include <time.h>

#include "claim.h"
#include "log.h"
#include "config.h"
#include "device_config.h"
#include "device_id.h"
#include "device_state.h"
#include "entropy.h"
#include "identity.h"
#include "improv_serial.h"
#include "kvstore.h"
#include "net.h"
#include "pending_readings.h"
#include "pms_driver.h"
#include "setup_info.h"
#include "ota.h"
#include "setup_portal.h"
#include "storage_fs.h"
#include "upload_payload.h"
#include "upload_policy.h"
#include "uploader.h"

// Dev-only hooks: weak defaults here, overridden by src/dev/ (which only dev envs compile).
__attribute__((weak)) void devLogBootDetails() {}
__attribute__((weak)) PmsLink* devPmsLink() { return nullptr; }  // dev-fake overrides
PmsLink& realPmsLink();

static const uint32_t kHeartbeatMs = 30000;

static uint32_t gLastHeartbeat = 0, gLastAverage = 0;
static PmsDriver* gPms = nullptr;
static Identity gId;
static IdentityStatus gIdStatus = IdentityStatus::kStorageFailed;
static DeviceConfig gCfg;
static core::StateMachine gSm;
static core::LongPress gFlash;
static core::PendingReadings gPending;
static double hwRand01() { return (RANDOM_REG32 >> 8) / 16777216.0; }
static core::UploadPolicy gUpload(hwRand01);
static uint32_t gUploadsOk = 0, gUploadsFail = 0;
static std::string gClaimHash;  // waiting to go out in the next upload
static std::string gClaimToken;  // RAM only (never in flash or logs): reused for status queries until replaced

static void logState(const char* why) {
  LOGF("[state] %s why=%s wifi_saved=%d connected=%d ap=%d\n", core::stateName(gSm.state()), why,
                gCfg.hasWifi() ? 1 : 0, netConnected() ? 1 : 0, gSm.outputs().apOn ? 1 : 0);
}

static void loadUploadState() {
  core::KvRecord r;
  uint16_t v;
  core::LoadResult lr = core::loadRecord(fileStore(), "/state", r, v);
  if (lr == core::LoadResult::kOk || lr == core::LoadResult::kRecoveredFromTmp) {
    gUpload.setEnrolled(r.getInt("enrolled", 0) != 0);
    gClaimHash = r.get("claim_hash");
  }
}

static void saveUploadState() {
  core::KvRecord r;
  r.setInt("enrolled", gUpload.enrolled() ? 1 : 0);
  r.set("claim_hash", gClaimHash);
  core::saveRecord(fileStore(), "/state", r, 1);
}

// Phone setup succeeded: save WiFi + setup info (address/ZIP/indoor), which goes out once in the next signed
// upload and is then erased from the device (the backend keeps it in private_locations).
static void onPortalSaved(const core::portal::Form& f) {
  gCfg.wifiSsid = f.ssid;
  gCfg.wifiPass = f.password;
  gCfg.address = f.address;
  gCfg.zip = f.zip;
  gCfg.indoor = f.indoor;
  gCfg.setupInfoPending = true;
  bool saved = saveConfig(gCfg);
  portalSetSavedSsid(gCfg.wifiSsid);
  LOGF("[cfg] wifi+setup save=%s\n", saved ? "ok" : "FAIL");
  gSm.wifiSettingsSaved(millis());
  gUpload.requestSoon(millis());
  logState("portal");
}

static void onImprovSaved(const std::string& ssid, const std::string& pass) {
  gCfg.wifiSsid = ssid;
  gCfg.wifiPass = pass;
  bool saved = saveConfig(gCfg);
  portalSetSavedSsid(gCfg.wifiSsid);
  DeviceConfig check;
  bool readBack = loadConfig(check) && check.wifiSsid == ssid && check.wifiPass == pass;
  LOGF("[cfg] wifi save=%s readback=%s (%s)\n", saved ? "ok" : "FAIL", readBack ? "ok" : "FAIL",
                lastConfigLoadResult());
  gSm.wifiSettingsSaved(millis());
  logState("improv");
}

// After a successful USB setup: a fresh single-use claim token for the website. Only its hash is kept (and sent
// in the next upload); the token goes to the browser in the URL fragment and is never logged.
static std::string makeClaimRedirect(bool fresh) {
  if (!fresh && !gClaimToken.empty()) return core::claimUrl(SITE_URL, gId.deviceId, gClaimToken);
  uint8_t rnd[16];
  secureRandom(rnd, sizeof rnd);
  core::ClaimToken c = core::makeClaimToken(rnd);
  memset(rnd, 0, sizeof rnd);
  gClaimHash = c.hashHex;
  gClaimToken = c.token;
  saveUploadState();
  gUpload.requestSoon(millis());  // the claim page is waiting for this upload
  LOGLN("[claim] new claim token issued");
  return core::claimUrl(SITE_URL, gId.deviceId, c.token);
}

// Every interval: close the averaging window. Readings need real time (NTP) for their timestamp.
static void closeAverage(uint32_t now) {
  core::PmsAverage a;
  gPms->takeAverage(a);
  const core::PmsStats& s = gPms->stats();
  LOGF("[pms] n=%u pm25_cf1=%.1f pm25_atm=%.1f pm10_cf1=%.1f c03=%.0f csum_err=%lu partial=%lu timeouts=%lu\n",
                a.samples, a.pm25_cf1, a.pm25_atm, a.pm10_cf1, a.counts[0], (unsigned long)s.checksum_errors,
                (unsigned long)s.partial_dropped, (unsigned long)gPms->timeouts());
  if (a.samples == 0) return;  // warm-up or sensor silent: nothing to report
  if (!timeValid()) {
    LOGLN("[pms] reading dropped: clock not synced yet");
    return;
  }
  gPending.push({static_cast<uint32_t>(time(nullptr)), a});
  (void)now;
}

static void maybeUpload(uint32_t now) {
  if (!gUpload.due(now)) return;
  // Not while the setup AP is up: TLS needs most of the free heap, and the AP is only up during setup.
  if (!identityUsable(gIdStatus) || !netConnected() || !timeValid() || improvBusy() || portalActive()) return;
  // A claim page is waiting: send what we have now instead of at the end of the 2.5-min window, but only a
  // real average (>= 4 samples after warm-up). With nothing to report it goes out as a health-only upload.
  if (!gClaimHash.empty() && gPending.empty() && gPms->pendingSamples() >= 4) {
    closeAverage(now);
    gLastAverage = now;
  }
  core::UploadInfo info;
  info.fw = FW_VERSION;
  info.uptimeS = now / 1000;
  info.rssi = netRssi();
  const core::PmsStats& s = gPms->stats();
  info.errors = {{"csum_err", s.checksum_errors},
                 {"len_err", s.length_errors},
                 {"partial", s.partial_dropped},
                 {"timeouts", gPms->timeouts()},
                 {"unsolicited", gPms->unsolicited()},
                 {"sensor_ok", gPms->healthy(now) ? 1u : 0u},
                 {"dropped", gPending.dropped()},
                 {"heap", ESP.getFreeHeap()}};
  std::string claimSent = gClaimHash;
  info.claimTokenHash = claimSent;
  bool setupSent = core::attachSetupInfo(info, gCfg.setupInfoPending, gCfg.address, gCfg.zip, gCfg.indoor);
  std::string body = core::buildUploadJson(info, gPending.items());
  bool enroll = !gUpload.enrolled();
  size_t sent = gPending.items().size();
  UploadResult r = uploadNow(gId.deviceId, gId.secretHex, enroll, body);
  gUpload.onResult(r.outcome, millis(), r.retryAfterS);
  if (r.outcome == core::UploadOutcome::kOk) {
    gUploadsOk++;
    gPending.clear();
    bool claimDone = !claimSent.empty() && claimSent == gClaimHash;
    if (claimDone) gClaimHash.clear();
    if (enroll || claimDone) saveUploadState();
    if (core::shouldClearSetupInfo(setupSent, r.outcome)) {  // delivered: the device doesn't need it any more
      gCfg.address.clear();
      gCfg.zip.clear();
      gCfg.setupInfoPending = false;
      saveConfig(gCfg);
    }
  } else {
    gUploadsFail++;
  }
  if (gUpload.needsTimeResync()) {
    netResyncTime();
    gUpload.clearTimeResync();
  }
  LOGF("[up] http=%d readings=%u accepted=%d ms=%lu heap_before=%lu heap_during=%lu ssl_err=%d enroll=%d next_s=%lu ok=%lu fail=%lu\n",
                r.httpCode, (unsigned)sent, r.accepted, (unsigned long)r.ms, (unsigned long)r.heapBefore,
                (unsigned long)r.heapMin, r.sslError, enroll ? 1 : 0, (unsigned long)(gUpload.nextInMs(millis()) / 1000),
                (unsigned long)gUploadsOk, (unsigned long)gUploadsFail);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.println();  // end any 74880-baud ROM garbage on a fresh line
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LED_OFF);
  pinMode(PIN_FLASH_BUTTON, INPUT_PULLUP);
  netBegin();

  char idBuf[24];
  core::formatDeviceId(ESP.getChipId(), idBuf, sizeof idBuf);
  gId.deviceId = idBuf;  // always set, even if storage fails
  bool fsOk = storageBegin();
  gIdStatus = fsOk ? loadOrCreateIdentity(gId) : IdentityStatus::kStorageFailed;
  bool cfgOk = fsOk && loadConfig(gCfg);
  if (fsOk) loadUploadState();
  LOGF("[boot] %s fw=%s env=%s id=%s reset=%s\n", PROJECT_NAME, FW_VERSION, FW_ENV, gId.deviceId.c_str(),
                ESP.getResetReason().c_str());
  // Never log the secret, setup password, WiFi credentials, or address.
  LOGF("[identity] %s short_code=%s fs=%s%s config=%s enrolled=%d\n", identityStatusName(gIdStatus),
                gId.shortCode.empty() ? "(unassigned)" : gId.shortCode.c_str(), fsOk ? "ok" : "FAIL",
                storageWasFormatted() ? "(formatted)" : "", cfgOk ? "loaded" : lastConfigLoadResult(), gUpload.enrolled() ? 1 : 0);
  devLogBootDetails();

  improvBegin(&gId, onImprovSaved, makeClaimRedirect);
  portalBegin(&gId, ESP.getChipId(), onPortalSaved);
  portalSetSavedSsid(gCfg.wifiSsid);
  improvSetSetupInfo([](std::string& ssid, std::string& pw) {
    ssid = portalApSsid();
    pw = gId.setupPassword;
  });
  improvSetSetCode([](const std::string& code) {
    bool ok = saveShortCode(gId, code);
    // The packing tool confirms by reading the code back from the next boot line ([identity] short_code=...).
    LOGF("[factory] short_code=%s saved=%d\n", code.c_str(), ok ? 1 : 0);
    if (!ok) return;
    Serial.flush();
    delay(200);
    ESP.restart();  // the setup WiFi name includes the code, so start over with it
  });
  uploaderBegin();
  otaBegin(gId.deviceId);

  PmsLink* link = devPmsLink();
  static PmsDriver driver(link ? *link : realPmsLink());
  gPms = &driver;
  uint32_t now = millis();
  gPms->begin(now);
  gLastAverage = now;
  gUpload.begin(now);

  gFlash.begin(digitalRead(PIN_FLASH_BUTTON) == LOW, now);
  gSm.begin({gCfg.hasWifi(), netConnected(), false}, now);
  portalSetWanted(gSm.outputs().apOn && identityUsable(gIdStatus), now);
  netApply(gSm.outputs().connectWifi, gCfg, gSm.outputs().apOn, now);
  logState("boot");
}

void loop() {
  uint32_t now = millis();
  gPms->poll(now);
  improvPoll(now, netConnected());
  portalPoll(now);

  static bool lastHeld = false;
  bool fired = gFlash.update(digitalRead(PIN_FLASH_BUTTON) == LOW, now);
  if (gFlash.held() != lastHeld) {
    lastHeld = gFlash.held();
    LOGF("[btn] flash=%s\n", lastHeld ? "down" : "up");
  }
  if (fired) {
    bool ok = eraseWifiAndSetup(gCfg);
    portalReset();
    portalSetSavedSsid("");
    gSm.eraseWifi(now);
    LOGF("[reset] FLASH long-press: WiFi + setup info erased (%s), identity kept\n", ok ? "ok" : "FAIL");
    logState("long_press");
  }
  if (gSm.update({gCfg.hasWifi(), netConnected(), portalClientSeen()}, now)) logState("update");
  netApply(gSm.outputs().connectWifi, gCfg, gSm.outputs().apOn, now);
  // The AP needs the setup password, so it only runs with a usable identity.
  portalSetWanted(gSm.outputs().apOn && identityUsable(gIdStatus), now);

  digitalWrite(PIN_LED, core::ledLit(core::ledPatternFor(gSm.state()), now) ? LED_ON : LED_OFF);

  if (now - gLastAverage >= core::UploadPolicy::kIntervalMs) {
    gLastAverage = now;
    closeAverage(now);
  }
  maybeUpload(now);
  otaPoll(now, gSm.state() == core::DeviceState::kRunning && identityUsable(gIdStatus) && netConnected() && timeValid() &&
              !improvBusy() && !portalActive(),
          FW_VERSION);

  if (now - gLastHeartbeat >= kHeartbeatMs) {
    gLastHeartbeat = now;
    LOGF("[hb] uptime_s=%lu heap=%u maxblk=%u state=%s rssi=%d time_ok=%d pending=%u flash_pin=%d\n",
                  (unsigned long)(now / 1000), ESP.getFreeHeap(), ESP.getMaxFreeBlockSize(), core::stateName(gSm.state()),
                  netRssi(), timeValid() ? 1 : 0, (unsigned)gPending.items().size(), digitalRead(PIN_FLASH_BUTTON));
  }
  delay(5);  // yields to the WiFi stack / watchdog
}
