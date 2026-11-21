// Improv Wi-Fi over USB serial: the computer setup path (primary). Answers in any state.
#pragma once
#include <stdint.h>

#include "device_config.h"
#include "identity.h"

// Called when new credentials connected successfully (caller saves them and updates the state machine).
typedef void (*ImprovSavedFn)(const std::string& ssid, const std::string& pass);

void improvBegin(const Identity* id, ImprovSavedFn onSaved);
void improvPoll(uint32_t nowMs, bool wifiConnected);  // reads Serial; non-blocking except network scans
bool improvBusy();                                     // a credential test is running
