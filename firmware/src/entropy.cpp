// Random bytes for the device secret and setup password.
// ESP8266 core 3.1.2 cores/esp8266/Esp.cpp (EspClass::random) copies RANDOM_REG32 directly and warns that with
// WiFi off the register is likely pseudo-random (it is fed by RF noise). Core 3.x boots with WiFi in forced
// sleep, so we: (1) wake the RF and start STA mode, (2) sample the register many times with timing jitter,
// (3) condense the pool with SHA-256 (BearSSL, part of the core), (4) put the radio back to sleep.
#include "entropy.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <bearssl/bearssl_hash.h>

#define RNG_REG (*(volatile uint32_t*)0x3FF20E44)  // RANDOM_REG32 (same address the core uses)

void secureRandom(uint8_t* out, size_t n) {
  WiFiMode_t prev = WiFi.getMode();
  WiFi.forceSleepWake();
  WiFi.mode(WIFI_STA);
  delay(20);  // let the RF front end settle so the register is fed by noise

  br_sha256_context pool;
  br_sha256_init(&pool);
  for (int i = 0; i < 2048; i++) {
    uint32_t sample[2] = {RNG_REG, ESP.getCycleCount()};
    br_sha256_update(&pool, sample, sizeof sample);
    if ((i & 63) == 0) delayMicroseconds(37 + (RNG_REG & 31));
  }
  uint8_t seed[32];
  br_sha256_out(&pool, seed);

  size_t done = 0;
  for (uint32_t counter = 0; done < n; counter++) {
    br_sha256_context c;
    br_sha256_init(&c);
    br_sha256_update(&c, seed, sizeof seed);
    br_sha256_update(&c, &counter, sizeof counter);
    uint32_t extra = RNG_REG;
    br_sha256_update(&c, &extra, sizeof extra);
    uint8_t block[32];
    br_sha256_out(&c, block);
    size_t take = (n - done < sizeof block) ? n - done : sizeof block;
    memcpy(out + done, block, take);
    memset(block, 0, sizeof block);
    done += take;
  }
  memset(seed, 0, sizeof seed);

  if (prev == WIFI_OFF) {
    WiFi.mode(WIFI_OFF);
    WiFi.forceSleepBegin();
  }
}
