// Dev-only code. This folder is excluded from the release build (platformio.ini build_src_filter).
#pragma once
void devLogBootDetails();
#include <ESP8266WebServer.h>  // a type alias, so it cannot be forward-declared
// One line per setup-page request: method, host, path (never the query or form fields). Capped at 60 per boot.
void devLogPortalRequest(ESP8266WebServer& server);
