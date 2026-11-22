// OTA = updating sensors over WiFi (M9). Signed images only: the updater refuses to boot an image whose RSA-2048
// signature doesn't match the public key built into this firmware. Rules (stages, timing): core/ota_policy.h.
#pragma once
#include <stdint.h>
#include <string>

// Installs signature checking. With no key in this build, OTA stays off (release builds until the founder creates
// the production key, M11).
void otaBegin(const std::string& deviceId);
// Call every loop. `canRun`: RUNNING, time valid, and no setup/upload in progress. May block for a minute while
// downloading, then restarts the sensor into the new version.
void otaPoll(uint32_t nowMs, bool canRun, const std::string& currentVersion);
