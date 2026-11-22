#include "dev_log.h"

#include <Arduino.h>
#include <ESP8266WebServer.h>

void devLogBootDetails() {
  Serial.printf("[dev] core=%s sdk=%s flash=%u cpu_mhz=%u sketch=%u free_sketch=%u\n",
                ESP.getCoreVersion().c_str(), ESP.getSdkVersion(), ESP.getFlashChipRealSize(),
                ESP.getCpuFreqMHz(), ESP.getSketchSize(), ESP.getFreeSketchSpace());
}

void devLogPortalRequest(ESP8266WebServer& server) {
  static uint8_t logged = 0;
  if (logged >= 60) return;
  logged++;
  String host = server.hostHeader();
  if (host.length() > 48) host = host.substring(0, 48);
  String path = server.uri();
  if (path.length() > 48) path = path.substring(0, 48);
  Serial.printf("[portal] req %s %s%s\n", server.method() == HTTP_POST ? "POST" : "GET", host.c_str(), path.c_str());
}
