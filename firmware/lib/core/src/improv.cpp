#include "improv.h"

namespace core {
namespace improv {

static const char kHeader[] = "IMPROV";

Error errorForWifiFailure(WifiFailure f) {
  return f == WifiFailure::kWrongPassword ? kUnableToConnect : kUnknownError;
}

bool decodeRpc(const uint8_t* d, size_t n, Rpc& out) {
  out = Rpc{};
  if (n < 2) return false;
  out.command = d[0];
  size_t len = d[1];
  if (len != n - 2) return false;
  if (out.command == kWifiSettings) {
    if (len < 2) return false;
    size_t sl = d[2];
    if (3 + sl >= n) return false;
    size_t pl = d[3 + sl];
    if (4 + sl + pl != n) return false;
    out.ssid.assign(reinterpret_cast<const char*>(d + 3), sl);
    out.password.assign(reinterpret_cast<const char*>(d + 4 + sl), pl);
    if (out.ssid.empty()) return false;
  }
  return true;
}

bool Parser::feed(uint8_t b, Rpc& out, bool& invalid) {
  invalid = false;
  if (pos_ < 6) {
    if (b == static_cast<uint8_t>(kHeader[pos_])) {
      buf_[pos_++] = b;
    } else {
      pos_ = (b == 'I') ? 1 : 0;
      if (pos_) buf_[0] = b;
    }
    return false;
  }
  if (pos_ == 6 && b != kVersion) {
    pos_ = (b == 'I') ? 1 : 0;
    if (pos_) buf_[0] = b;
    return false;
  }
  buf_[pos_++] = b;
  if (pos_ < 9) return false;
  size_t len = buf_[8];
  if (pos_ < 9 + len + 1) return false;
  uint8_t sum = 0;
  for (size_t i = 0; i < 9 + len; i++) sum = static_cast<uint8_t>(sum + buf_[i]);
  uint8_t type = buf_[7];
  pos_ = 0;
  if (sum != buf_[9 + len]) {
    invalid = true;
    return false;
  }
  if (type != kRpc) return false;  // devices ignore state/result frames
  if (!decodeRpc(buf_ + 9, len, out)) {
    invalid = true;
    return false;
  }
  return true;
}

std::vector<uint8_t> frame(Type type, const std::vector<uint8_t>& data) {
  std::vector<uint8_t> f(kHeader, kHeader + 6);
  f.push_back(kVersion);
  f.push_back(type);
  f.push_back(static_cast<uint8_t>(data.size()));
  f.insert(f.end(), data.begin(), data.end());
  uint8_t sum = 0;
  for (uint8_t x : f) sum = static_cast<uint8_t>(sum + x);
  f.push_back(sum);
  return f;
}

std::vector<uint8_t> stateFrame(State s) { return frame(kCurrentState, {s}); }
std::vector<uint8_t> errorFrame(Error e) { return frame(kErrorState, {e}); }

std::vector<uint8_t> resultFrame(Command c, const std::vector<std::string>& strings) {
  std::vector<uint8_t> payload;
  for (const auto& s : strings) {
    size_t n = s.size() > 255 ? 255 : s.size();
    if (payload.size() + 1 + n > 253) break;  // whole result must fit in one 255-byte data field
    payload.push_back(static_cast<uint8_t>(n));
    payload.insert(payload.end(), s.begin(), s.begin() + n);
  }
  std::vector<uint8_t> d{c, static_cast<uint8_t>(payload.size())};
  d.insert(d.end(), payload.begin(), payload.end());
  return frame(kRpcResult, d);
}

std::vector<uint8_t> rpcFrame(Command c, const std::vector<uint8_t>& payload) {
  std::vector<uint8_t> d{c, static_cast<uint8_t>(payload.size())};
  d.insert(d.end(), payload.begin(), payload.end());
  return frame(kRpc, d);
}

std::vector<uint8_t> wifiSettingsPayload(const std::string& ssid, const std::string& password) {
  std::vector<uint8_t> p;
  p.push_back(static_cast<uint8_t>(ssid.size()));
  p.insert(p.end(), ssid.begin(), ssid.end());
  p.push_back(static_cast<uint8_t>(password.size()));
  p.insert(p.end(), password.begin(), password.end());
  return p;
}

}  // namespace improv
}  // namespace core
