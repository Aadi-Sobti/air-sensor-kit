// M4 firmware: everything in M2 plus signed HTTPS uploads every ~2.5 min and Improv Wi-Fi over USB.
#include <Arduino.h>
#include <time.h>

#include "config.h"
#include "device_config.h"
#include "device_id.h"
#include "device_state.h"
#include "identity.h"
#include "improv_serial.h"
#include "kvstore.h"
#include "net.h"
#include "pending_readings.h"
#include "pms_driver.h"
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

static void logState(const char* why) {
  Serial.printf("[state] %s why=%s wifi_saved=%d connected=%d ap=%d\n", core::stateName(gSm.state()), why,
                gCfg.hasWifi() ? 1 : 0, netConnected() ? 1 : 0, gSm.outputs().apOn ? 1 : 0);
}

static void loadUploadState() {
  core::KvRecord r;
  uint16_t v;
  core::LoadResult lr = core::loadRecord(fileStore(), "/state", r, v);
  if (lr == core::LoadResult::kOk || lr == core::LoadResult::kRecoveredFromTmp) gUpload.setEnrolled(r.getInt("enrolled", 0) != 0);
}

static void saveUploadState() {
  core::KvRecord r;
  r.setInt("enrolled", gUpload.enrolled() ? 1 : 0);
  core::saveRecord(fileStore(), "/state", r, 1);
}

static void onImprovSaved(const std::string& ssid, const std::string& pass) {
  gCfg.wifiSsid = ssid;
  gCfg.wifiPass = pass;
  saveConfig(gCfg);
  gSm.wifiSettingsSaved(millis());
  logState("improv");
}

// Every interval: close the averaging window. Readings need real time (NTP) for their timestamp.
static void closeAverage(uint32_t now) {
  core::PmsAverage a;
  gPms->takeAverage(a);
  const core::PmsStats& s = gPms->stats();
  Serial.printf("[pms] n=%u pm25_cf1=%.1f pm25_atm=%.1f pm10_cf1=%.1f c03=%.0f csum_err=%lu partial=%lu timeouts=%lu\n",
                a.samples, a.pm25_cf1, a.pm25_atm, a.pm10_cf1, a.counts[0], (unsigned long)s.checksum_errors,
                (unsigned long)s.partial_dropped, (unsigned long)gPms->timeouts());
  if (a.samples == 0) return;  // warm-up or sensor silent: nothing to report
  if (!timeValid()) {
    Serial.println("[pms] reading dropped: clock not synced yet");
    return;
  }
  gPending.push({static_cast<uint32_t>(time(nullptr)), a});
  (void)now;
}

static void maybeUpload(uint32_t now) {
  if (gPending.empty() || !gUpload.due(now)) return;
  if (!identityUsable(gIdStatus) || !netConnected() || !timeValid() || improvBusy()) return;
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
  std::string body = core::buildUploadJson(info, gPending.items());
  bool enroll = !gUpload.enrolled();
  UploadResult r = uploadNow(gId.deviceId, gId.secretHex, enroll, body);
  gUpload.onResult(r.outcome, millis(), r.retryAfterS);
  if (r.outcome == core::UploadOutcome::kOk) {
    gUploadsOk++;
    gPending.clear();
    if (enroll) saveUploadState();
  } else {
    gUploadsFail++;
  }
  if (gUpload.needsTimeResync()) {
    netResyncTime();
    gUpload.clearTimeResync();
  }
  Serial.printf("[up] http=%d readings=%u ms=%lu heap_before=%lu heap_after=%lu ssl_err=%d enroll=%d next_s=%lu ok=%lu fail=%lu\n",
                r.httpCode, (unsigned)gPending.items().size(), (unsigned long)r.ms, (unsigned long)r.heapBefore,
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
  Serial.printf("[boot] %s fw=%s env=%s id=%s reset=%s\n", PROJECT_NAME, FW_VERSION, FW_ENV, gId.deviceId.c_str(),
                ESP.getResetReason().c_str());
  // Never log the secret, setup password, WiFi credentials, or address.
  Serial.printf("[identity] %s short_code=%s fs=%s%s config=%s enrolled=%d\n", identityStatusName(gIdStatus),
                gId.shortCode.empty() ? "(unassigned)" : gId.shortCode.c_str(), fsOk ? "ok" : "FAIL",
                storageWasFormatted() ? "(formatted)" : "", cfgOk ? "loaded" : "defaults", gUpload.enrolled() ? 1 : 0);
  devLogBootDetails();

  improvBegin(&gId, onImprovSaved);
  uploaderBegin();

  PmsLink* link = devPmsLink();
  static PmsDriver driver(link ? *link : realPmsLink());
  gPms = &driver;
  uint32_t now = millis();
  gPms->begin(now);
  gLastAverage = now;
  gUpload.begin(now);

  gFlash.begin(digitalRead(PIN_FLASH_BUTTON) == LOW, now);
  gSm.begin({gCfg.hasWifi(), netConnected(), false}, now);
  netApply(gSm.outputs().connectWifi, gCfg, gSm.outputs().apOn, now);
  logState("boot");
}

void loop() {
  uint32_t now = millis();
  gPms->poll(now);
  improvPoll(now, netConnected());

  static bool lastHeld = false;
  bool fired = gFlash.update(digitalRead(PIN_FLASH_BUTTON) == LOW, now);
  if (gFlash.held() != lastHeld) {
    lastHeld = gFlash.held();
    Serial.printf("[btn] flash=%s\n", lastHeld ? "down" : "up");
  }
  if (fired) {
    bool ok = eraseWifiAndSetup(gCfg);
    gSm.eraseWifi(now);
    Serial.printf("[reset] FLASH long-press: WiFi + setup info erased (%s), identity kept\n", ok ? "ok" : "FAIL");
    logState("long_press");
  }
  if (gSm.update({gCfg.hasWifi(), netConnected(), false}, now)) logState("update");
  netApply(gSm.outputs().connectWifi, gCfg, gSm.outputs().apOn, now);

  digitalWrite(PIN_LED, core::ledLit(core::ledPatternFor(gSm.state()), now) ? LED_ON : LED_OFF);

  if (now - gLastAverage >= core::UploadPolicy::kIntervalMs) {
    gLastAverage = now;
    closeAverage(now);
  }
  maybeUpload(now);

  if (now - gLastHeartbeat >= kHeartbeatMs) {
    gLastHeartbeat = now;
    Serial.printf("[hb] uptime_s=%lu heap=%u maxblk=%u state=%s rssi=%d time_ok=%d pending=%u flash_pin=%d\n",
                  (unsigned long)(now / 1000), ESP.getFreeHeap(), ESP.getMaxFreeBlockSize(), core::stateName(gSm.state()),
                  netRssi(), timeValid() ? 1 : 0, (unsigned)gPending.items().size(), digitalRead(PIN_FLASH_BUTTON));
  }
  delay(5);  // yields to the WiFi stack / watchdog
}
