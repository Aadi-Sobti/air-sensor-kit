// WiFi station + NTP. The setup AP itself arrives in M6; here it is only tracked and logged.
#pragma once
#include <stdint.h>

#include "device_config.h"

void netBegin();
// Apply the state machine's wishes. Non-blocking.
void netApply(bool connectWifi, const DeviceConfig& cfg, bool apOn, uint32_t nowMs);
bool netConnected();
int netRssi();
// True once NTP has set the clock (must be true before any TLS connection; see firmware rules).
bool timeValid();
