// M2 firmware: identity + config in LittleFS, state machine + LED, FLASH long-press reset, WiFi/NTP,
// PMS5003 readings averaged and logged. Uploads arrive in M4, setup paths in M5/M6.
#include <Arduino.h>

#include "config.h"
#include "device_config.h"
#include "device_state.h"
#include "identity.h"
#include "net.h"
#include "pms_driver.h"
#include "storage_fs.h"

// Dev-only hooks: weak defaults here, overridden by src/dev/ (which only dev envs compile).
__attribute__((weak)) void devLogBootDetails() {}
__attribute__((weak)) PmsLink* devPmsLink() { return nullptr; }  // dev-fake overrides
PmsLink& realPmsLink();

static const uint32_t kHeartbeatMs = 5000;
static const uint32_t kPmsLogMs = 30000;  // log window; the upload interval (decision #6) comes in M4

static uint32_t gLastHeartbeat = 0, gLastPmsLog = 0;
static PmsDriver* gPms = nullptr;
static Identity gId;
static DeviceConfig gCfg;
static core::StateMachine gSm;
static core::LongPress gFlash;

static void logPmsAverage() {
  core::PmsAverage a;
  gPms->takeAverage(a);
  const core::PmsStats& s = gPms->stats();
  Serial.printf(
      "[pms] n=%u pm1_cf1=%.1f pm25_cf1=%.1f pm10_cf1=%.1f pm25_atm=%.1f pm25_cf1_min=%u pm25_cf1_max=%u "
      "c03=%.0f c25=%.0f ok=%lu csum_err=%lu len_err=%lu partial=%lu acks=%lu discarded=%lu warmup=%lu "
      "timeouts=%lu unsolicited=%lu\n",
      a.samples, a.pm1_cf1, a.pm25_cf1, a.pm10_cf1, a.pm25_atm, a.pm25_cf1_min, a.pm25_cf1_max, a.counts[0],
      a.counts[3], (unsigned long)s.frames_ok, (unsigned long)s.checksum_errors, (unsigned long)s.length_errors,
      (unsigned long)s.partial_dropped, (unsigned long)s.short_frames, (unsigned long)s.bytes_discarded, (unsigned long)gPms->warmupDiscards(),
      (unsigned long)gPms->timeouts(), (unsigned long)gPms->unsolicited());
}

static core::StateInputs readInputs(uint32_t now) {
  core::StateInputs in;
  in.hasSavedWifi = gCfg.hasWifi();
  in.wifiConnected = netConnected();
  in.sensorOk = gPms->healthy(now) || (now < core::kPmsWarmupMs);  // don't flag PROBLEM during boot
  in.apClientSeen = false;  // M6
  return in;
}

static void logState(const char* why) {
  Serial.printf("[state] %s why=%s wifi_saved=%d connected=%d ap=%d\n", core::stateName(gSm.state()), why,
                gCfg.hasWifi() ? 1 : 0, netConnected() ? 1 : 0, gSm.outputs().apOn ? 1 : 0);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.println();  // end any 74880-baud ROM garbage on a fresh line
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LED_OFF);
  pinMode(PIN_FLASH_BUTTON, INPUT_PULLUP);
  netBegin();

  bool fsOk = storageBegin();
  IdentityStatus ids = fsOk ? loadOrCreateIdentity(gId) : IdentityStatus::kSaveFailed;
  bool cfgOk = fsOk && loadConfig(gCfg);
  Serial.printf("[boot] %s fw=%s env=%s id=%s reset=%s\n", PROJECT_NAME, FW_VERSION, FW_ENV,
                gId.deviceId.c_str(), ESP.getResetReason().c_str());
  // Never log the secret, setup password, WiFi credentials, or address.
  Serial.printf("[identity] %s short_code=%s fs=%s config=%s\n", identityStatusName(ids),
                gId.shortCode.empty() ? "(unassigned)" : gId.shortCode.c_str(), fsOk ? "ok" : "FAIL",
                cfgOk ? "loaded" : "defaults");
  devLogBootDetails();

  PmsLink* link = devPmsLink();
  static PmsDriver driver(link ? *link : realPmsLink());
  gPms = &driver;
  uint32_t now = millis();
  gPms->begin(now);
  Serial.printf("[pms] start link=%s warmup_s=%lu\n", gPms->linkName(),
                (unsigned long)(core::kPmsWarmupMs / 1000));

  gFlash.begin(digitalRead(PIN_FLASH_BUTTON) == LOW, now);
  gSm.begin(readInputs(now), now);
  netApply(gSm.outputs().connectWifi, gCfg, gSm.outputs().apOn, now);
  logState("boot");
}

void loop() {
  uint32_t now = millis();
  gPms->poll(now);

  if (gFlash.update(digitalRead(PIN_FLASH_BUTTON) == LOW, now)) {
    bool ok = eraseWifiAndSetup(gCfg);
    gSm.eraseWifi(now);
    Serial.printf("[reset] FLASH long-press: WiFi + setup info erased (%s), identity kept\n", ok ? "ok" : "FAIL");
    logState("long_press");
  }
  if (gSm.update(readInputs(now), now)) logState("update");
  netApply(gSm.outputs().connectWifi, gCfg, gSm.outputs().apOn, now);

  digitalWrite(PIN_LED, core::ledLit(core::ledPatternFor(gSm.state()), now) ? LED_ON : LED_OFF);

  if (now - gLastHeartbeat >= kHeartbeatMs) {
    gLastHeartbeat = now;
    Serial.printf("[hb] uptime_s=%lu heap=%u state=%s rssi=%d time_ok=%d\n", (unsigned long)(now / 1000),
                  ESP.getFreeHeap(), core::stateName(gSm.state()), netRssi(), timeValid() ? 1 : 0);
  }
  if (now - gLastPmsLog >= kPmsLogMs) {
    gLastPmsLog = now;
    logPmsAverage();
  }
  delay(5);  // yields to the WiFi stack / watchdog
}
