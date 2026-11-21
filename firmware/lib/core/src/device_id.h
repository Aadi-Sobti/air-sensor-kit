// Pure C++ helpers (no Arduino): testable in the `native` env.
#pragma once
#include <cstddef>
#include <cstdint>

namespace core {

// Writes "esp8266-<chipId decimal>" (the ID format Sensor.Community expects) into out.
// Returns the number of chars written (excluding NUL), or 0 if out is too small.
size_t formatDeviceId(uint32_t chipId, char* out, size_t outSize);

}  // namespace core
