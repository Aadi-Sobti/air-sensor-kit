// M0 blink-and-log firmware: proves build, flash, and serial capture work.
#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "config.h"
#include "device_id.h"

// Dev-only hooks: weak no-ops here, overridden by src/dev/ (which only the dev env compiles).
__attribute__((weak)) void devLogBootDetails() {}

static const uint32_t kHeartbeatMs = 5000;
static const uint32_t kBlinkMs = 500;

static char gDeviceId[24];
static uint32_t gLastHeartbeat = 0;
static uint32_t gLastBlink = 0;
static bool gLedOn = false;

void setup() {
  // WiFi stays off until M2; saves power and keeps logs quiet.
  WiFi.mode(WIFI_OFF);
  Serial.begin(SERIAL_BAUD);
  Serial.println();  // end any 74880-baud ROM garbage on a fresh line

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LED_OFF);

  core::formatDeviceId(ESP.getChipId(), gDeviceId, sizeof gDeviceId);
  Serial.printf("[boot] %s fw=%s env=%s id=%s reset=%s\n", PROJECT_NAME, FW_VERSION, FW_ENV,
                gDeviceId, ESP.getResetReason().c_str());
  devLogBootDetails();
}

void loop() {
  uint32_t now = millis();
  if (now - gLastBlink >= kBlinkMs) {
    gLastBlink = now;
    gLedOn = !gLedOn;
    digitalWrite(PIN_LED, gLedOn ? LED_ON : LED_OFF);
  }
  if (now - gLastHeartbeat >= kHeartbeatMs) {
    gLastHeartbeat = now;
    Serial.printf("[hb] uptime_s=%lu heap=%u\n", static_cast<unsigned long>(now / 1000),
                  ESP.getFreeHeap());
  }
  delay(10);  // yields to the WiFi stack / watchdog
}
