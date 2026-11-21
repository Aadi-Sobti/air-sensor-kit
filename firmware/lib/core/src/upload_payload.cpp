#include "upload_payload.h"

#include <cstdio>

namespace core {

std::string jsonEscape(const std::string& s) {
  std::string o;
  o.reserve(s.size() + 2);
  for (unsigned char c : s) {
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': o += "\\r"; break;
      case '\t': o += "\\t"; break;
      default:
        if (c < 0x20) {
          char b[8];
          std::snprintf(b, sizeof b, "\\u%04x", c);
          o += b;
        } else {
          o += static_cast<char>(c);
        }
    }
  }
  return o;
}

static void num(std::string& o, const char* key, double v, bool integer) {
  char b[48];
  if (integer)
    std::snprintf(b, sizeof b, "\"%s\":%lu", key, static_cast<unsigned long>(v < 0 ? 0 : v + 0.5));
  else
    std::snprintf(b, sizeof b, "\"%s\":%.1f", key, v < 0 ? 0.0 : v);
  o += b;
}

std::string buildUploadJson(const UploadInfo& info, const std::vector<UploadReading>& readings) {
  std::string o = "{\"fw\":\"" + jsonEscape(info.fw) + "\"";
  char b[64];
  std::snprintf(b, sizeof b, ",\"uptime_s\":%lu,\"rssi\":%d", static_cast<unsigned long>(info.uptimeS),
                info.rssi > 0 ? 0 : (info.rssi < -127 ? -127 : info.rssi));
  o += b;
  o += ",\"readings\":[";
  for (size_t i = 0; i < readings.size(); i++) {
    const UploadReading& r = readings[i];
    const PmsAverage& a = r.avg;
    if (i) o += ",";
    std::snprintf(b, sizeof b, "{\"ts\":%lu,\"n\":%u,", static_cast<unsigned long>(r.ts), a.samples);
    o += b;
    num(o, "pm1_cf1", a.pm1_cf1, false); o += ",";
    num(o, "pm25_cf1", a.pm25_cf1, false); o += ",";
    num(o, "pm10_cf1", a.pm10_cf1, false); o += ",";
    num(o, "pm1_atm", a.pm1_atm, false); o += ",";
    num(o, "pm25_atm", a.pm25_atm, false); o += ",";
    num(o, "pm10_atm", a.pm10_atm, false); o += ",\"counts\":[";
    for (size_t k = 0; k < kPmsCountBins; k++) {
      std::snprintf(b, sizeof b, "%s%lu", k ? "," : "", static_cast<unsigned long>(a.counts[k] + 0.5f));
      o += b;
    }
    o += "],";
    num(o, "pm25_cf1_min", a.pm25_cf1_min, true); o += ",";
    num(o, "pm25_cf1_max", a.pm25_cf1_max, true);
    o += "}";
  }
  o += "]";
  if (!info.errors.empty()) {
    o += ",\"errors\":{";
    for (size_t i = 0; i < info.errors.size(); i++) {
      std::snprintf(b, sizeof b, "%s\"%s\":%lu", i ? "," : "", info.errors[i].first.c_str(),
                    static_cast<unsigned long>(info.errors[i].second));
      o += b;
    }
    o += "}";
  }
  if (info.hasSetup) {
    o += ",\"setup\":{\"address\":\"" + jsonEscape(info.address) + "\",\"zip\":\"" + jsonEscape(info.zip) +
         "\",\"indoor\":" + (info.indoor ? "true" : "false") + "}";
  }
  if (!info.claimTokenHash.empty()) o += ",\"claim_token_hash\":\"" + jsonEscape(info.claimTokenHash) + "\"";
  o += "}";
  return o;
}

}  // namespace core
