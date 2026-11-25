// The ONE place for pins, names, and versions. Never use D3/D4/D8 for sensors.
#pragma once

#define PROJECT_NAME "ProseFire"   // placeholder name (decisions.md #1)
#define AP_PREFIX PROJECT_NAME     // soft AP: <AP_PREFIX>-Setup-<SHORTCODE>, must stay <= 32 chars
#define FW_VERSION "0.7.6"

#ifndef FW_ENV
#define FW_ENV "unknown"
#endif

// Upload endpoint: a Firebase Hosting rewrite to the ingest function, so the backend can move without a firmware
// change. Dev project for now; the production domain replaces this before launch (M11).
#define INGEST_HOST "prosefire-dev.web.app"
#define INGEST_PATH "/api/v1/ingest"
#define SITE_URL "https://prosefire-dev.web.app"

// Serial (USB): logs + Improv setup + factory mode
#define SERIAL_BAUD 115200

// PMS5003 on EspSoftwareSerial at 9600 8N1 (datasheet)
#define PMS_BAUD 9600
#define PIN_PMS_RX 5   // D1: PMS TXD -> ESP
#define PIN_PMS_TX 4   // D2: ESP -> PMS RXD

// Status LED: onboard, ACTIVE-LOW
#define PIN_LED 2      // D4
#define LED_ON LOW
#define LED_OFF HIGH

// FLASH button: long-press 5 s = setup reset (input after boot only)
#define PIN_FLASH_BUTTON 0  // D3

// Reserved for phase 2 humidity sensors
#define PIN_RESERVED_DHT22 13   // D7
#define PIN_RESERVED_I2C_SDA 14 // D5 (call Wire.begin(sda, scl) explicitly; D1/D2 are taken)
#define PIN_RESERVED_I2C_SCL 12 // D6

// Never use D3/D4/D8 for sensors: boot-strapping pins.
