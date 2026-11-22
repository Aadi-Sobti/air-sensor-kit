// Phone setup path: the sensor's own WPA2 access point + captive portal (decision #7: password on the QR sticker).
#pragma once
#include <stdint.h>

#include <string>

#include "identity.h"
#include "portal.h"

// Called after the phone user's WiFi credentials connected (caller saves WiFi + setup info).
typedef void (*PortalSavedFn)(const core::portal::Form& form);

void portalBegin(const Identity* id, uint32_t chipId, PortalSavedFn onSaved);
// Bring the AP up/down as the state machine wants (plus a short hold after success so the phone sees it).
void portalSetWanted(bool wanted, uint32_t nowMs);
void portalPoll(uint32_t nowMs);
bool portalActive();
bool portalClientSeen();  // a phone joined since the AP opened (stops the idle timeout)
const std::string& portalApSsid();
void portalReset();
void portalSetSavedSsid(const std::string& ssid);  // home network to match the setup WiFi's channel to  // FLASH long-press: forget any in-progress or finished phone setup
