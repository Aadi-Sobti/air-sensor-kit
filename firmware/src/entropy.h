#pragma once
#include <stddef.h>
#include <stdint.h>
// Fills out with cryptographic-quality random bytes for long-lived secrets. Wakes the radio while sampling.
void secureRandom(uint8_t* out, size_t n);
