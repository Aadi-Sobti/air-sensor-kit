// Improv Wi-Fi over serial: frame parser + builders. Written from the spec at https://www.improv-wifi.com/serial/
// (read 2026-11-21); the checksum (sum of all bytes from 'I' through the data, mod 256) is taken from the
// reference SDK https://github.com/improv-wifi/sdk-cpp (Apache-2.0; used as a reference, no code copied).
// Frame: "IMPROV" | version 0x01 | type | length | data[length] | checksum.
// The serial port is shared with logs: non-Improv bytes are ignored, and our log lines start with '['.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace core {
namespace improv {

constexpr uint8_t kVersion = 0x01;
enum Type : uint8_t { kCurrentState = 0x01, kErrorState = 0x02, kRpc = 0x03, kRpcResult = 0x04 };
enum State : uint8_t { kStopped = 0x00, kReady = 0x02, kProvisioning = 0x03, kProvisioned = 0x04 };
enum Error : uint8_t {
  kNoError = 0x00, kInvalidRpc = 0x01, kUnknownRpc = 0x02, kUnableToConnect = 0x03, kUnknownError = 0xFF
};
enum Command : uint8_t {
  kWifiSettings = 0x01, kGetCurrentState = 0x02, kGetDeviceInfo = 0x03, kGetWifiNetworks = 0x04, kBadChecksum = 0xFF
};

struct Rpc {
  uint8_t command = 0;
  std::string ssid, password;  // for kWifiSettings
};

// Byte-at-a-time parser. feed() returns true when a complete, checksum-valid RPC frame was decoded into out.
// Sets `invalid` when a frame had a bad checksum or malformed RPC (caller should answer kInvalidRpc).
class Parser {
 public:
  bool feed(uint8_t b, Rpc& out, bool& invalid);

 private:
  uint8_t buf_[9 + 255 + 1];
  size_t pos_ = 0;
};

// Decodes the data part of an RPC frame (command, length, payload). False if malformed.
bool decodeRpc(const uint8_t* data, size_t n, Rpc& out);

std::vector<uint8_t> frame(Type type, const std::vector<uint8_t>& data);
std::vector<uint8_t> stateFrame(State s);
std::vector<uint8_t> errorFrame(Error e);
// RPC result: command, length, then length-prefixed strings. Strings longer than 255 are truncated.
std::vector<uint8_t> resultFrame(Command c, const std::vector<std::string>& strings);
// Encodes the client side (used by tools and tests): an RPC command frame.
std::vector<uint8_t> rpcFrame(Command c, const std::vector<uint8_t>& payload);
std::vector<uint8_t> wifiSettingsPayload(const std::string& ssid, const std::string& password);

}  // namespace improv
}  // namespace core
