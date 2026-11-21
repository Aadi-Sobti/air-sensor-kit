// Human-facing random codes. Pure C++: the caller supplies random bytes (ESP8266 hardware RNG on the device).
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

namespace core {

// 31 characters with no look-alikes (no 0/O, 1/I/L), upper case: easy to read off a sticker and type.
extern const char kCodeAlphabet[];
constexpr size_t kCodeAlphabetLen = 31;

// Builds a code of `len` chars using unbiased rejection sampling over `rnd`. Returns "" if `rnd` runs out
// (the caller should pass at least 2*len bytes).
std::string makeCode(const uint8_t* rnd, size_t rndLen, size_t len);

// Setup WiFi password (WPA2 needs >= 8 chars). 12 chars x log2(31) = ~59 bits.
constexpr size_t kSetupPasswordLen = 12;

// Lowercase hex of bytes (for the device secret).
std::string toHex(const uint8_t* b, size_t n);

}  // namespace core
