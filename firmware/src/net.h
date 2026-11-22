// WiFi station + NTP. The setup AP itself arrives in M6; here it is only tracked and logged.
#pragma once
#include <stdint.h>

#include <string>

#include "device_config.h"

void netBegin();
// Apply the state machine's wishes. Non-blocking.
void netApply(bool connectWifi, const DeviceConfig& cfg, bool apOn, uint32_t nowMs);
bool netConnected();
int netRssi();
// True once NTP has set the clock (must be true before any TLS connection; see firmware rules).
bool timeValid();
// Credential test for setup (Improv / portal): connect with new credentials WITHOUT saving them. While a test
// runs, netApply() leaves the radio alone. Saved WiFi is never erased by a failed test.
void netTestBegin(const std::string& ssid, const std::string& pass);
enum class NetTest { kIdle, kRunning, kConnected, kFailed };
NetTest netTestPoll(uint32_t nowMs);  // kFailed after a wrong password or ~25 s
void netTestEnd();                    // back to the saved network (netApply takes over again)
const char* netTestReason();          // why the last test ended (diagnostics; never includes credentials)
int netTestFailure();                 // core::improv::WifiFailure of the last failed test
void netResyncTime();                 // re-run NTP (after the server reported clock skew)
void netSetApActive(bool on);         // the setup portal's access point is up (radio mode AP / AP+STA)
bool netTesting();
// While a phone uses the setup WiFi, stop retrying an unreachable saved network: the search makes the radio leave
// the setup channel and the phone drops (core::portal::pauseSavedWifi decides). A working connection is kept.
void netSetSavedWifiPaused(bool paused);                    // a credential test (Improv or portal) is running
