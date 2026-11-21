#include "dev_log.h"

#include <Arduino.h>

void devLogBootDetails() {
  Serial.printf("[dev] core=%s sdk=%s flash=%u cpu_mhz=%u sketch=%u free_sketch=%u\n",
                ESP.getCoreVersion().c_str(), ESP.getSdkVersion(), ESP.getFlashChipRealSize(),
                ESP.getCpuFreqMHz(), ESP.getSketchSize(), ESP.getFreeSketchSpace());
}
