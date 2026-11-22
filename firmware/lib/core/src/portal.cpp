#include "portal.h"

#include <algorithm>
#include <cctype>

#include "codes.h"

// ESP8266: constant strings live in RAM unless marked PROGMEM, and flash must be read with the _P helpers
// (byte reads from flash pointers crash). On the host these are plain reads.
#if defined(ARDUINO)
#include <pgmspace.h>
#define PF_PROGMEM PROGMEM
static size_t flashLen(const char* p) { return strlen_P(p); }
static std::string fromFlash(const char* p) {
  std::string s(strlen_P(p), '\0');
  if (!s.empty()) memcpy_P(&s[0], p, s.size());
  return s;
}
#else
#include <cstring>
#define PF_PROGMEM
static size_t flashLen(const char* p) { return std::strlen(p); }
static std::string fromFlash(const char* p) { return std::string(p); }
#endif

namespace core {
namespace portal {

// EN + ES. Spanish needs a native speaker's review before launch (same as the website).
// English strings, one after another, each ending in \0 (kept in flash, not RAM).
static const char kEnBlob[] PF_PROGMEM =
    "Set up your air sensor" "\0"
    "Pick your WiFi, type its password and your address, then tap Connect." "\0"
    "Your WiFi" "\0"
    "My WiFi isn't listed" "\0"
    "WiFi name" "\0"
    "WiFi password" "\0"
    "Show password" "\0"
    "open" "\0"
    "If your WiFi name ends in \"5G\", pick the other one. WiFi that makes you log in on a web page won't work." "\0"
    "Street address" "\0"
    "Like 123 Main St, Apt 4. Only you and the project team can see it. The public map only shows your block." "\0"
    "ZIP code" "\0"
    "Where will it go?" "\0"
    "Outside" "\0"
    "Inside" "\0"
    "Connect" "\0"
    "Connecting to your WiFi… This takes about 20 seconds." "\0"
    "Keep this page open. If your phone leaves this network for a moment, that's OK." "\0"
    "You're all set!" "\0"
    "Close the lid. Your sensor's readings will be on the map in about 10 minutes." "\0"
    "That password didn't work. Try again. Capital letters matter." "\0"
    "The sensor couldn't reach that WiFi. Make sure it's 2.4 GHz WiFi and the sensor is close to your router." "\0"
    "Pick your WiFi or type its name." "\0"
    "WiFi passwords have 8 to 63 characters." "\0"
    "Type your street address." "\0"
    "Type a 5-digit ZIP code." "\0"
    "This is not a smoke alarm. It does not replace official warnings or evacuation orders." "\0"
    "Your sensor's readings (never your address) appear on our public map and are shared as open data with Sensor.Community." "\0";
// Spanish strings, one after another, each ending in \0 (kept in flash, not RAM).
static const char kEsBlob[] PF_PROGMEM =
    "Configura tu sensor de aire" "\0"
    "Elige tu WiFi, escribe su contraseña y tu dirección, y toca Conectar." "\0"
    "Tu WiFi" "\0"
    "Mi WiFi no aparece" "\0"
    "Nombre del WiFi" "\0"
    "Contraseña del WiFi" "\0"
    "Mostrar contraseña" "\0"
    "abierta" "\0"
    "Si el nombre de tu WiFi termina en \"5G\", elige el otro. Las redes que piden iniciar sesión en una página web no funcionan." "\0"
    "Dirección" "\0"
    "Por ejemplo: 123 Main St, Apt 4. Solo tú y el equipo del proyecto pueden verla. El mapa público solo muestra tu cuadra." "\0"
    "Código postal" "\0"
    "¿Dónde va a estar?" "\0"
    "Afuera" "\0"
    "Adentro" "\0"
    "Conectar" "\0"
    "Conectando a tu WiFi… Tarda unos 20 segundos." "\0"
    "Deja esta página abierta. Si tu teléfono sale de esta red un momento, no pasa nada." "\0"
    "¡Todo listo!" "\0"
    "Cierra la tapa. Las lecturas de tu sensor estarán en el mapa en unos 10 minutos." "\0"
    "Esa contraseña no funcionó. Inténtalo otra vez. Las mayúsculas importan." "\0"
    "El sensor no pudo llegar a ese WiFi. Asegúrate de que sea WiFi de 2.4 GHz y de que el sensor esté cerca del router." "\0"
    "Elige tu WiFi o escribe su nombre." "\0"
    "Las contraseñas de WiFi tienen de 8 a 63 caracteres." "\0"
    "Escribe tu dirección." "\0"
    "Escribe un código postal de 5 dígitos." "\0"
    "Esto no es una alarma de humo. No reemplaza los avisos oficiales ni las órdenes de evacuación." "\0"
    "Las lecturas de tu sensor (nunca tu dirección) aparecen en nuestro mapa público y se comparten como datos abiertos con Sensor.Community." "\0";

std::string str(Lang l, Key k) {
  if (k < 0 || k >= kKeyCount) return "";
  const char* p = l == Lang::kEs ? kEsBlob : kEnBlob;
  for (int i = 0; i < k; i++) p += flashLen(p) + 1;  // skip to the k-th string
  return fromFlash(p);
}

Lang pickLang(const std::string& al) {
  // First listed language wins; "es", "es-US", "es-419" -> Spanish.
  std::string s;
  for (char c : al) s += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  size_t i = 0;
  while (i < s.size() && (s[i] == ' ' || s[i] == ',')) i++;
  return s.compare(i, 2, "es") == 0 ? Lang::kEs : Lang::kEn;
}

static std::string get(const std::map<std::string, std::string>& f, const char* k) {
  auto it = f.find(k);
  return it == f.end() ? std::string() : it->second;
}

static std::string trim(const std::string& s) {
  size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
  return a == std::string::npos ? std::string() : s.substr(a, b - a + 1);
}

std::vector<Key> validate(const std::map<std::string, std::string>& f, Form& out) {
  std::vector<Key> e;
  // Without JS the "WiFi name" box is always visible and a scanned network is pre-ticked; if someone typed a
  // name, they mean it (hidden / unlisted network), whatever is ticked.
  std::string net = get(f, "net"), typed = trim(get(f, "ssid"));
  out.ssid = !typed.empty() ? typed : (net == "__other__" ? std::string() : net);
  out.password = get(f, "pass");
  out.address = trim(get(f, "address"));
  out.zip = trim(get(f, "zip"));
  out.indoor = get(f, "where") == "inside";
  if (out.ssid.empty() || out.ssid.size() > 32) e.push_back(kErrNeedSsid);
  // WPA2: 8-63 characters (or 64 hex digits); empty for an open network.
  if (!out.password.empty() && (out.password.size() < 8 || out.password.size() > 64)) e.push_back(kErrPwLength);
  if (out.address.size() < 3 || out.address.size() > 200) e.push_back(kErrAddress);
  bool zipOk = out.zip.size() == 5 && std::all_of(out.zip.begin(), out.zip.end(), [](char c) { return c >= '0' && c <= '9'; });
  if (!zipOk) e.push_back(kErrZip);
  return e;
}

std::string htmlEscape(const std::string& s) {
  std::string o;
  o.reserve(s.size());
  for (char c : s) {
    switch (c) {
      case '&': o += "&amp;"; break;
      case '<': o += "&lt;"; break;
      case '>': o += "&gt;"; break;
      case '"': o += "&quot;"; break;
      case '\'': o += "&#39;"; break;
      default: o += c;
    }
  }
  return o;
}

static const char kCss[] PF_PROGMEM =
    "body{font:18px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:34rem;margin:0 auto;padding:1rem;color:#1a1a1a}"
    "h1{font-size:1.5rem}label{display:block;margin:.8rem 0 .25rem;font-weight:600}"
    "input[type=text],input[type=password]{font:inherit;width:100%;box-sizing:border-box;min-height:3rem;padding:.4rem .6rem;border:2px solid #888;border-radius:.5rem}"
    ".c{display:flex;gap:.6rem;align-items:center;min-height:2.8rem;padding:.2rem .5rem;border:2px solid #ddd;border-radius:.5rem;margin:.35rem 0;font-weight:400}"
    ".c input{width:1.3rem;height:1.3rem}.h{color:#555;font-size:.9rem}"
    ".e{background:#fde8e8;border-left:5px solid #b00020;padding:.6rem .8rem;margin:.8rem 0}"
    "button{font:inherit;font-size:1.1rem;min-height:3rem;width:100%;margin-top:1rem;border:0;border-radius:.6rem;background:#1557a0;color:#fff}"
    ".ok{font-size:1.6rem;color:#0a6b2d;font-weight:700}footer{margin-top:2rem;border-top:1px solid #ddd;padding-top:.8rem;font-size:.85rem;color:#444}";

static std::string head(Lang l, const char* extraHead = "") {
  std::string h = "<!doctype html><html lang=\"";
  h += l == Lang::kEs ? "es" : "en";
  h += "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  h += extraHead;
  h += "<title>";
  h += htmlEscape(str(l, kTitle));
  h += "</title><style>";
  h += fromFlash(kCss);
  h += "</style></head><body><main>";
  return h;
}

static std::string foot(Lang l) {
  return std::string("</main><footer><p>") + htmlEscape(str(l, kSafety)) + "</p></footer></body></html>";
}

static std::string bars(int rssi) {
  int n = (rssi + 100) / 12;
  if (n < 1) n = 1;
  if (n > 4) n = 4;
  static const char* b[] = {"", "\xE2\x96\x82", "\xE2\x96\x82\xE2\x96\x84", "\xE2\x96\x82\xE2\x96\x84\xE2\x96\x86",
                            "\xE2\x96\x82\xE2\x96\x84\xE2\x96\x86\xE2\x96\x88"};
  return b[n];
}

std::string formPage(Lang l, const std::vector<Network>& nets, const Form& v, const std::vector<Key>& errors) {
  std::string p = head(l);
  p += "<h1>" + htmlEscape(str(l, kTitle)) + "</h1>";
  for (Key k : errors) p += "<p class=\"e\" role=\"alert\">" + htmlEscape(str(l, k)) + "</p>";
  if (errors.empty()) p += "<p>" + htmlEscape(str(l, kIntro)) + "</p>";
  p += "<form method=\"post\" action=\"/connect\"><fieldset style=\"border:0;padding:0\"><legend><b>" +
       htmlEscape(str(l, kWifi)) + "</b></legend>";
  bool picked = false;
  for (size_t i = 0; i < nets.size() && i < 15; i++) {
    const Network& n = nets[i];
    bool sel = (!v.ssid.empty() && v.ssid == n.ssid) || (v.ssid.empty() && i == 0);
    picked |= sel;
    p += "<label class=\"c\"><input type=\"radio\" name=\"net\" value=\"" + htmlEscape(n.ssid) + "\"" +
         (sel ? " checked" : "") + "> " + htmlEscape(n.ssid) + " <span>" + bars(n.rssi) + "</span>";
    if (!n.secure) p += " <span class=\"h\">(" + htmlEscape(str(l, kOpen)) + ")</span>";
    p += "</label>";
  }
  p += "<label class=\"c\"><input type=\"radio\" name=\"net\" value=\"__other__\"" + std::string(picked ? "" : " checked") +
       "> " + htmlEscape(str(l, kOther)) + "</label>";
  p += "<label for=\"s\">" + htmlEscape(str(l, kWifiName)) + "</label><input id=\"s\" type=\"text\" name=\"ssid\" maxlength=\"32\" "
       "autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\" value=\"" + (picked ? "" : htmlEscape(v.ssid)) + "\"></fieldset>";
  p += "<label for=\"p\">" + htmlEscape(str(l, kPassword)) + "</label><input id=\"p\" type=\"password\" name=\"pass\" maxlength=\"64\" "
       "autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\">";
  // Show/hide needs JS; with JS off the box simply does nothing and the field stays hidden.
  p += "<label class=\"c\"><input type=\"checkbox\" onclick=\"document.getElementById('p').type=this.checked?'text':'password'\"> " +
       htmlEscape(str(l, kShowPw)) + "</label>";
  p += "<p class=\"h\">" + htmlEscape(str(l, kWifiHint)) + "</p>";
  p += "<label for=\"a\">" + htmlEscape(str(l, kAddress)) + "</label><input id=\"a\" type=\"text\" name=\"address\" maxlength=\"200\" "
       "autocomplete=\"street-address\" value=\"" + htmlEscape(v.address) + "\">";
  p += "<p class=\"h\">" + htmlEscape(str(l, kAddressHint)) + "</p>";
  p += "<label for=\"z\">" + htmlEscape(str(l, kZip)) + "</label><input id=\"z\" type=\"text\" name=\"zip\" maxlength=\"5\" "
       "inputmode=\"numeric\" autocomplete=\"postal-code\" value=\"" + htmlEscape(v.zip) + "\">";
  p += "<fieldset style=\"border:0;padding:0\"><legend><b>" + htmlEscape(str(l, kWhere)) + "</b></legend>";
  p += "<label class=\"c\"><input type=\"radio\" name=\"where\" value=\"outside\"" + std::string(v.indoor ? "" : " checked") +
       "> " + htmlEscape(str(l, kOutside)) + "</label>";
  p += "<label class=\"c\"><input type=\"radio\" name=\"where\" value=\"inside\"" + std::string(v.indoor ? " checked" : "") +
       "> " + htmlEscape(str(l, kInside)) + "</label></fieldset>";
  p += "<p class=\"h\">" + htmlEscape(str(l, kShare)) + "</p>";
  p += "<button type=\"submit\">" + htmlEscape(str(l, kConnect)) + "</button></form>";
  return p + foot(l);
}

std::string connectingPage(Lang l) {
  std::string p = head(l, "<meta http-equiv=\"refresh\" content=\"3;url=/status\">");
  p += "<h1>" + htmlEscape(str(l, kTitle)) + "</h1><p>" + htmlEscape(str(l, kConnecting)) + "</p><p class=\"h\">" +
       htmlEscape(str(l, kKeepOpen)) + "</p>";
  return p + foot(l);
}

std::string donePage(Lang l) {
  std::string p = head(l);
  p += "<p class=\"ok\">" + htmlEscape(str(l, kDone)) + "</p><p>" + htmlEscape(str(l, kDoneNext)) + "</p>";
  return p + foot(l);
}

std::string fallbackShortCode(uint32_t chipId) {
  std::string s;
  uint32_t v = chipId;
  for (int i = 0; i < 6; i++) {
    s += kCodeAlphabet[v % kCodeAlphabetLen];
    v /= kCodeAlphabetLen;
  }
  return s;
}

std::string apSsid(const std::string& prefix, const std::string& code) {
  std::string s = prefix + "-Setup-" + code;
  return s.size() > 32 ? s.substr(0, 32) : s;
}

}  // namespace portal
}  // namespace core
