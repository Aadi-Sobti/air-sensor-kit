// Improv Wi-Fi over USB serial: the computer setup path (primary). Answers in any state.
#pragma once
#include <stdint.h>

#include <string>

#include "device_config.h"
#include "identity.h"

// Called when new credentials connected successfully (caller saves them and updates the state machine).
typedef void (*ImprovSavedFn)(const std::string& ssid, const std::string& pass);
// Returns the URL the browser goes to after setup (claim page with a fresh single-use claim token).
typedef std::string (*ImprovRedirectFn)(bool fresh);

void improvBegin(const Identity* id, ImprovSavedFn onSaved, ImprovRedirectFn redirect);
void improvPoll(uint32_t nowMs, bool wifiConnected);  // reads Serial; non-blocking except network scans
bool improvBusy();                                     // a credential test is running
// Provides the setup AP name + password for the "PFCMD SETUPINFO" serial command (see improv_serial.cpp).
typedef void (*SetupInfoFn)(std::string& ssid, std::string& password);
void improvSetSetupInfo(SetupInfoFn fn);
// "PFCMD SETCODE <code>" from the packing laptop (M9). Called only when allowed (no short code yet, or < 60 s
// after boot). The handler stores the code, prints "[factory] short_code=<code> saved=1|0", and restarts.
typedef void (*SetCodeFn)(const std::string& code);
void improvSetSetCode(SetCodeFn fn);
