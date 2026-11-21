// M1 firmware: blink + PMS5003 readings averaged and logged. WiFi stays off until M2.
#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "config.h"
#include "device_id.h"
#include "pms_driver.h"

// Dev-only hooks: weak defaults here, overridden by src/dev/ (which only dev envs compile).
__attribute__((weak)) void devLogBootDetails() {}
__attribute__((weak)) PmsLink* devPmsLink() { return nullptr; }
PmsLink& realPmsLink();

static const uint32_t kHeartbeatMs = 5000;
static const uint32_t kBlinkMs = 500;
static const uint32_t kPmsLogMs = 30000;  // log window; the upload interval (decision #6) comes in M4

static char gDeviceId[24];
static uint32_t gLastHeartbeat = 0, gLastBlink = 0, gLastPmsLog = 0;
static bool gLedOn = false;
static PmsDriver* gPms = nullptr;

static void logPmsAverage() {
  core::PmsAverage a;
  gPms->takeAverage(a);
  const core::PmsStats& s = gPms->stats();
  Serial.printf(
      "[pms] n=%u pm1_cf1=%.1f pm25_cf1=%.1f pm10_cf1=%.1f pm25_atm=%.1f pm25_cf1_min=%u pm25_cf1_max=%u "
      "c03=%.0f c25=%.0f ok=%lu csum_err=%lu len_err=%lu acks=%lu discarded=%lu warmup=%lu timeouts=%lu\n",
      a.samples, a.pm1_cf1, a.pm25_cf1, a.pm10_cf1, a.pm25_atm, a.pm25_cf1_min, a.pm25_cf1_max, a.counts[0],
      a.counts[3], (unsigned long)s.frames_ok, (unsigned long)s.checksum_errors, (unsigned long)s.length_errors,
      (unsigned long)s.short_frames, (unsigned long)s.bytes_discarded, (unsigned long)gPms->warmupDiscards(),
      (unsigned long)gPms->timeouts());
}

void setup() {
  WiFi.mode(WIFI_OFF);
  Serial.begin(SERIAL_BAUD);
  Serial.println();  // end any 74880-baud ROM garbage on a fresh line

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LED_OFF);

  core::formatDeviceId(ESP.getChipId(), gDeviceId, sizeof gDeviceId);
  Serial.printf("[boot] %s fw=%s env=%s id=%s reset=%s\n", PROJECT_NAME, FW_VERSION, FW_ENV, gDeviceId,
                ESP.getResetReason().c_str());
  devLogBootDetails();

  PmsLink* link = devPmsLink();
  static PmsDriver driver(link ? *link : realPmsLink());
  gPms = &driver;
  gPms->begin(millis());
  Serial.printf("[pms] start link=%s warmup_s=%lu\n", gPms->linkName(),
                (unsigned long)(core::kPmsWarmupMs / 1000));
}

void loop() {
  uint32_t now = millis();
  gPms->poll(now);
  if (now - gLastBlink >= kBlinkMs) {
    gLastBlink = now;
    gLedOn = !gLedOn;
    digitalWrite(PIN_LED, gLedOn ? LED_ON : LED_OFF);
  }
  if (now - gLastHeartbeat >= kHeartbeatMs) {
    gLastHeartbeat = now;
    Serial.printf("[hb] uptime_s=%lu heap=%u\n", (unsigned long)(now / 1000), ESP.getFreeHeap());
  }
  if (now - gLastPmsLog >= kPmsLogMs) {
    gLastPmsLog = now;
    logPmsAverage();
  }
  delay(5);  // yields to the WiFi stack / watchdog
}
