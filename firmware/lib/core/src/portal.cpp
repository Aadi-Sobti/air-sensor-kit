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
// Page fragments: kept in flash on the device (literals would otherwise sit in RAM), plain strings on the host.
#define PS(lit) fromFlash(PSTR(lit))
#else
#include <cstring>
#define PF_PROGMEM
static size_t flashLen(const char* p) { return std::strlen(p); }
static std::string fromFlash(const char* p) { return std::string(p); }
#define PS(lit) std::string(lit)
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

// Look: calm blue cards on a light background, big tap targets (>= 48 px), works in iOS's captive mini-browser.
// Everything here is plain HTML + CSS; the little JS (show password, "connecting" button) is optional.
static const char kCss[] PF_PROGMEM =
    ":root{--b:#1660c4;--bd:#0e4793;--t:#14202e;--m:#5a6878;--l:#dfe6ee}"
    "*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}"
    "body{margin:0;background:#eef3f8;color:var(--t);font:17px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif}"
    ".top{background:linear-gradient(135deg,#1660c4,#0d8a9c);color:#fff;padding:1.6rem 1.2rem 3.2rem}"
    ".top svg{width:2.6rem;height:2.6rem;display:block;margin-bottom:.7rem}"
    ".top h1{margin:0;font-size:1.6rem;line-height:1.2}.top p{margin:.45rem 0 0;opacity:.92}"
    "main{max-width:32rem;margin:-2.2rem auto 0;padding:0 .9rem 1.5rem}"
    ".card{background:#fff;border-radius:1.1rem;padding:1.1rem 1.1rem 1.2rem;margin-bottom:.9rem;box-shadow:0 1px 2px rgba(20,32,46,.06),0 4px 14px rgba(20,32,46,.06)}"
    "h2{display:flex;align-items:center;gap:.55rem;font-size:1.1rem;margin:0 0 .8rem}"
    ".n{flex:none;display:inline-grid;place-items:center;width:1.7rem;height:1.7rem;border-radius:50%;background:#e4eefb;color:var(--b);font-size:.95rem}"
    "label.f{display:block;font-weight:600;margin:.9rem 0 .35rem}"
    "input[type=text],input[type=password]{font:inherit;width:100%;min-height:3.2rem;padding:.5rem .85rem;border:1.5px solid #c5d0dc;border-radius:.8rem;background:#fff;color:inherit;-webkit-appearance:none}"
    "input:focus{outline:0;border-color:var(--b);box-shadow:0 0 0 3px rgba(22,96,196,.2)}"
    ".list{border:1.5px solid var(--l);border-radius:.9rem;overflow:hidden}"
    ".net{display:flex;align-items:center;gap:.7rem;min-height:3.3rem;padding:.4rem .85rem;border-top:1px solid var(--l);cursor:pointer}"
    ".net:first-child{border-top:0}.net:has(input:checked){background:#eaf2fd}"
    ".net input,.opt input{width:1.25rem;height:1.25rem;margin:0;accent-color:var(--b);flex:none}"
    ".nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.net .h{flex:none}"
    ".sig{display:inline-flex;align-items:flex-end;gap:2px;height:15px;flex:none}"
    ".sig b{width:4px;border-radius:1px;background:#cfd8e3}.sig b:nth-child(1){height:30%}.sig b:nth-child(2){height:55%}"
    ".sig b:nth-child(3){height:78%}.sig b:nth-child(4){height:100%}"
    ".s1 b:nth-child(-n+1),.s2 b:nth-child(-n+2),.s3 b:nth-child(-n+3),.s4 b{background:var(--b)}"
    "details{margin-top:.7rem}summary{color:var(--b);font-weight:600;cursor:pointer;padding:.5rem 0;min-height:2.6rem}"
    ".pw{position:relative}.pw input{padding-right:5.2rem}"
    ".sh{display:none;position:absolute;right:.35rem;top:.35rem;bottom:.35rem;padding:0 .8rem;border:0;border-radius:.6rem;background:#e4eefb;color:var(--b);font:inherit;font-size:.9rem;font-weight:600}"
    ".js .sh{display:block}"
    ".h{color:var(--m);font-size:.88rem;margin:.45rem 0 0}"
    ".two{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}"
    ".opt{display:flex;flex-direction:column;align-items:center;gap:.35rem;padding:.9rem .5rem;border:1.5px solid var(--l);border-radius:.9rem;font-weight:600;cursor:pointer}"
    ".opt:has(input:checked){border-color:var(--b);background:#eaf2fd}.opt i{font-style:normal;font-size:1.7rem;line-height:1}"
    ".e{display:flex;gap:.6rem;align-items:flex-start;background:#fdecee;color:#8a1022;border:1.5px solid #f3b8c0;border-radius:.9rem;padding:.8rem .9rem;margin-bottom:.9rem;font-weight:600}"
    ".e b{flex:none;display:inline-grid;place-items:center;width:1.5rem;height:1.5rem;border-radius:50%;background:#c4142f;color:#fff;font-size:.9rem}"
    ".go{display:block;width:100%;min-height:3.5rem;margin-top:1rem;border:0;border-radius:.95rem;background:var(--b);color:#fff;font:inherit;font-size:1.15rem;font-weight:700;box-shadow:0 4px 12px rgba(22,96,196,.3)}"
    ".go:active{background:var(--bd)}.go:disabled{opacity:.7}"
    ".st{text-align:center;padding:1.6rem 1.1rem}.st h2{display:block;font-size:1.35rem;margin:1rem 0 .4rem}"
    ".spin{width:3.4rem;height:3.4rem;margin:.4rem auto 0;border-radius:50%;border:5px solid #dbe6f4;border-top-color:var(--b);animation:r 1s linear infinite}"
    "@keyframes r{to{transform:rotate(360deg)}}"
    ".ok{display:grid;place-items:center;width:4.2rem;height:4.2rem;margin:.3rem auto 0;border-radius:50%;background:#1f9d55;color:#fff;font-size:2.3rem;font-weight:700}"
    "footer{max-width:32rem;margin:0 auto;padding:0 1.6rem 2rem;color:var(--m);font-size:.82rem;text-align:center}";

// Logo: a sensor with air waves (inline SVG, no external files).
static const char kLogo[] PF_PROGMEM =
    "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><rect x=\"4\" y=\"4\" width=\"40\" height=\"40\" rx=\"12\" fill=\"#fff\" "
    "fill-opacity=\".18\"/><path d=\"M13 19c4-4 8-4 11 0s7 4 11 0M13 26c4-4 8-4 11 0s7 4 11 0M13 33c4-4 8-4 11 0s7 4 11 0\" "
    "fill=\"none\" stroke=\"#fff\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>";

// `sub` is the line under the title in the blue header (may be empty).
static std::string head(Lang l, const std::string& sub, const std::string& extraHead = std::string()) {
  std::string h;
  h.reserve(kPageReserve);
  h += PS("<!doctype html><html lang=\"");
  h += l == Lang::kEs ? "es" : "en";
  h += PS("\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
       "<meta name=\"color-scheme\" content=\"light\">");
  h += extraHead;
  h += "<title>";
  h += htmlEscape(str(l, kTitle));
  h += PS("</title><style>");
  h += fromFlash(kCss);
  h += PS("</style><script>document.documentElement.className='js'</script></head><body><header class=\"top\">");
  h += fromFlash(kLogo);
  h += "<h1>" + htmlEscape(str(l, kTitle)) + "</h1>";
  if (!sub.empty()) h += "<p>" + htmlEscape(sub) + "</p>";
  h += PS("</header><main>");
  return h;
}

static std::string foot(Lang l) {
  return std::string(PS("</main><footer><p>&#9888;&#65039; ")) + htmlEscape(str(l, kSafety)) + PS("</p></footer></body></html>");
}

static std::string bars(int rssi) {
  int n = (rssi + 100) / 12;
  if (n < 1) n = 1;
  if (n > 4) n = 4;
  return PS("<i class=\"sig s") + std::to_string(n) + PS("\" aria-hidden=\"true\"><b></b><b></b><b></b><b></b></i>");
}

static std::string section(int num, const std::string& title) {
  return PS("<section class=\"card\"><h2><span class=\"n\">") + std::to_string(num) + "</span>" + title + "</h2>";
}

std::string formPage(Lang l, const std::vector<Network>& nets, const Form& v, const std::vector<Key>& errors) {
  std::string p = head(l, str(l, kIntro));
  for (Key k : errors) p += PS("<div class=\"e\" role=\"alert\"><b>!</b><span>") + htmlEscape(str(l, k)) + PS("</span></div>");
  p += PS("<form method=\"post\" action=\"/connect\" onsubmit=\"var b=this.querySelector('.go');b.disabled=1;b.textContent='");
  p += htmlEscape(str(l, kConnect)) + "…'\">";

  // 1. WiFi: scanned networks as rows; "My WiFi isn't listed" opens a name box (works without JS: <details>).
  p += section(1, htmlEscape(str(l, kWifi)));
  bool picked = false;
  // Room left for the rest of the page after the list (fields, sharing notice, footer) is well under 4 KB.
  // Rows go straight into the page buffer: a separate list buffer growing next to it ran out of memory on hardware.
  if (!nets.empty()) p += PS("<div class=\"list\">");
  for (size_t i = 0; i < nets.size() && i < 15 && p.size() < kPageReserve - 4096; i++) {
    const Network& n = nets[i];
    bool sel = (!v.ssid.empty() && v.ssid == n.ssid) || (v.ssid.empty() && i == 0);
    picked |= sel;
    p += PS("<label class=\"net\"><input type=\"radio\" name=\"net\" value=\"") + htmlEscape(n.ssid) + "\"" +
            (sel ? " checked" : "") + PS(" onchange=\"document.getElementById('s').value=''\"><span class=\"nm\">") + htmlEscape(n.ssid) + "</span>";
    if (!n.secure) p += PS("<span class=\"h\">(") + htmlEscape(str(l, kOpen)) + ")</span>";
    p += bars(n.rssi) + "</label>";
  }
  if (!nets.empty()) p += "</div>";
  // A typed name always wins over a ticked row (validate()), so a hidden network works without JS too.
  p += std::string("<details") + (picked ? "" : " open") + "><summary>" + htmlEscape(str(l, kOther)) +
       PS("</summary><label class=\"f\" for=\"s\">") + htmlEscape(str(l, kWifiName)) +
       PS("</label><input id=\"s\" type=\"text\" name=\"ssid\" maxlength=\"32\" autocapitalize=\"off\" autocorrect=\"off\" "
       "spellcheck=\"false\" value=\"") + (picked ? "" : htmlEscape(v.ssid)) + PS("\"></details>");
  p += PS("<label class=\"f\" for=\"p\">") + htmlEscape(str(l, kPassword)) +
       PS("</label><div class=\"pw\"><input id=\"p\" type=\"password\" name=\"pass\" maxlength=\"64\" autocapitalize=\"off\" "
       "autocorrect=\"off\" spellcheck=\"false\"><button type=\"button\" class=\"sh\" aria-label=\"") + htmlEscape(str(l, kShowPw)) +
       PS("\" onclick=\"var q=document.getElementById('p');q.type=q.type=='password'?'text':'password'\">&#128065;</button></div>");
  p += PS("<p class=\"h\">") + htmlEscape(str(l, kWifiHint)) + PS("</p></section>");

  // 2. Address + ZIP.
  p += section(2, PS("<label for=\"a\">") + htmlEscape(str(l, kAddress)) + "</label>");
  p += PS("<input id=\"a\" type=\"text\" name=\"address\" maxlength=\"200\" autocomplete=\"street-address\" value=\"") +
       htmlEscape(v.address) + PS("\"><p class=\"h\">&#128274; ") + htmlEscape(str(l, kAddressHint)) + "</p>";
  p += PS("<label class=\"f\" for=\"z\">") + htmlEscape(str(l, kZip)) + PS("</label><input id=\"z\" type=\"text\" name=\"zip\" "
       "maxlength=\"5\" inputmode=\"numeric\" pattern=\"[0-9]*\" autocomplete=\"postal-code\" style=\"max-width:9rem\" value=\"") +
       htmlEscape(v.zip) + PS("\"></section>");

  // 3. Outside / inside (default outside).
  p += section(3, htmlEscape(str(l, kWhere)));
  p += PS("<div class=\"two\"><label class=\"opt\"><i>&#127795;</i><input type=\"radio\" name=\"where\" value=\"outside\"") +
       std::string(v.indoor ? "" : " checked") + ">" + htmlEscape(str(l, kOutside)) + "</label>";
  p += PS("<label class=\"opt\"><i>&#127968;</i><input type=\"radio\" name=\"where\" value=\"inside\"") +
       std::string(v.indoor ? " checked" : "") + ">" + htmlEscape(str(l, kInside)) + PS("</label></div></section>");

  p += PS("<p class=\"h\">") + htmlEscape(str(l, kShare)) + "</p>";
  p += PS("<button class=\"go\" type=\"submit\">") + htmlEscape(str(l, kConnect)) + PS("</button></form>");
  p += foot(l);  // append in place: `p + foot` would copy the whole page
  return p;
}

std::string connectingPage(Lang l) {
  std::string p = head(l, "", PS("<meta http-equiv=\"refresh\" content=\"3;url=/status\">"));
  p += PS("<section class=\"card st\" role=\"status\"><div class=\"spin\"></div><h2>") + htmlEscape(str(l, kConnecting)) +
       PS("</h2><p class=\"h\">") + htmlEscape(str(l, kKeepOpen)) + PS("</p></section>");
  p += foot(l);  // append in place: `p + foot` would copy the whole page
  return p;
}

std::string donePage(Lang l) {
  std::string p = head(l, "");
  p += PS("<section class=\"card st\" role=\"status\"><div class=\"ok\">&#10003;</div><h2>") + htmlEscape(str(l, kDone)) +
       "</h2><p>" + htmlEscape(str(l, kDoneNext)) + PS("</p></section>");
  p += foot(l);  // append in place: `p + foot` would copy the whole page
  return p;
}

bool pauseSavedWifi(bool apOn, int stations, bool staConnected, uint32_t msSinceActivity) {
  return apOn && stations > 0 && !staConnected && msSinceActivity < kPortalIdleMs;
}

int pickApChannel(const std::vector<Network>& nets, const std::string& savedSsid) {
  const Network* best = nullptr;
  for (const Network& n : nets) {
    if (!savedSsid.empty() && n.ssid == savedSsid) {
      best = &n;
      break;
    }
    if (!best || n.rssi > best->rssi) best = &n;
  }
  if (!best || best->channel < 1 || best->channel > 11) return 0;
  return best->channel;
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
